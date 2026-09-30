"""Minecraft-Figur aus einem Skin (ROADMAP 4.1).

Maße in Skin-Pixeln (1 px = 1/16 Block; die Figur ist 32 px = 1,8 m hoch). Die Figur schaut nach −Y (zur
Standardkamera), ihre rechte Seite liegt bei −X. Jeder Körperteil hängt an einem Gelenk (Empty) an Hals, Schulter
oder Hüfte, sodass Posen nur Winkel setzen.

Stilbuch 6: pixelscharfe Texturen, zweite Skin-Ebene leicht abgesetzt (+0,5 px am Kopf, +0,25 px am Körper),
feine Fase an jeder Würfelkante für die helle Lichtkante (1–2 px bei 1280 px Bildbreite).
"""
import math

import bpy
from mathutils import Euler, Matrix, Vector

PX = 1.8 / 32.0  # Meter je Skin-Pixel

# (u, v) im 64×64-Skin, Breite/Höhe/Tiefe in Pixeln, Mittelpunkt relativ zum Gelenk, Gelenk relativ zum Körper
# Grundlage: Standard-Skin-Layout von Minecraft (Java), Box-UV.
TEILE = {
    # name: (uv_basis, uv_ebene2, (w, h, d), aufblähen_ebene2)
    "kopf": ((0, 0), (32, 0), (8, 8, 8), 0.5),
    "koerper": ((16, 16), (16, 32), (8, 12, 4), 0.25),
    "arm_r": ((40, 16), (40, 32), (4, 12, 4), 0.25),
    "arm_l": ((32, 48), (48, 48), (4, 12, 4), 0.25),
    "bein_r": ((0, 16), (0, 32), (4, 12, 4), 0.25),
    "bein_l": ((16, 48), (0, 48), (4, 12, 4), 0.25),
}


# Glieder mit Gelenk in der Mitte (Ellbogen, Knie); das Mesh eines Glieds hat seinen Ursprung genau dort
GLIEDER = ("arm_r", "arm_l", "bein_r", "bein_l")
UEBERGANG = 2.0  # halbe Breite des weichen Übergangs am Gelenk in Pixeln


def _beuge_matrix(glied, grad, anteil=1.0):
    """Drehung des unteren Glied-Teils um das Gelenk: Arme beugen den Unterarm nach vorn (−Y), Beine den Unterschenkel
    nach hinten (+Y), wie echte Ellbogen und Knie. Drehachse ist die Innenkante (Armbeuge vorn, Kniekehle hinten):
    so staucht und faltet sich innen nichts, außen dehnt sich das Glied nur leicht."""
    richtung = -1 if glied.startswith("arm") else 1
    innen = Vector((0, 2 * PX * richtung, 0))
    dreh = Matrix.Rotation(math.radians(grad * anteil * richtung), 4, "X")
    return Matrix.Translation(innen) @ dreh @ Matrix.Translation(-innen)


def _beuge(figur, glied, grad):
    """Verformt beide Ebenen eines Glieds: unterhalb des Gelenks gedreht, im Übergang weich verteilt."""
    figur.beugung[glied] = grad
    for name in (glied, f"{glied}.2"):
        ob = figur.teile.get(name)
        if ob is None:
            continue
        ruhe = figur.ruhe[name]
        for v, r in zip(ob.data.vertices, ruhe):
            z = r.z / PX
            anteil = min(1.0, max(0.0, (UEBERGANG - z) / (2 * UEBERGANG)))
            anteil = anteil * anteil * (3 - 2 * anteil)
            v.co = _beuge_matrix(glied, grad, anteil) @ r if grad else r
        ob.data.update()


def _box_rects(u, v, w, h, d):
    """Box-UV-Bereiche (x, y, breite, höhe) im Bild, y von oben."""
    return {
        "oben": (u + d, v, w, d),
        "unten": (u + d + w, v, w, d),
        "rechts": (u, v + d, d, h),
        "vorn": (u + d, v + d, w, h),
        "links": (u + d + w, v + d, d, h),
        "hinten": (u + 2 * d + w, v + d, w, h),
    }


def _faces(w, h, d, inflate):
    """Quader um den Ursprung (Mitte), Ecken je Fläche in Bildreihenfolge unten-links, unten-rechts, oben-rechts,
    oben-links (so, wie das Bild die Fläche von außen zeigt)."""
    x0, x1 = -w / 2 - inflate, w / 2 + inflate
    y0, y1 = -d / 2 - inflate, d / 2 + inflate  # y0 = vorn
    z0, z1 = -h / 2 - inflate, h / 2 + inflate
    return {
        "vorn": [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
        "hinten": [(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)],
        "rechts": [(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)],
        "links": [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)],
        # Oberseite: Bildunterkante grenzt an die Vorderseite
        "oben": [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
        # Unterseite: Bildoberkante grenzt an die Vorderseite
        "unten": [(x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)],
    }


def _material(name, image, overlay):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"  # pixelscharf
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if overlay:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        if hasattr(mat, "blend_method"):
            mat.blend_method = "CLIP"
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"
    bsdf.inputs["Roughness"].default_value = 0.62
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.35
            break
    return mat


def _mesh(name, rects, dims, tex_w, tex_h, inflate, mat, teilung=1):
    """`teilung`: Seitenflächen in so viele Reihen teilen (Arme/Beine: 1 Reihe je Pixel), damit sie sich am Gelenk
    weich biegen lassen."""
    w, h, d = dims
    verts, faces, uvs = [], [], []
    for face, corners in _faces(w, h, d, inflate).items():
        rx, ry, rw, rh = rects[face]
        n = teilung if face in ("vorn", "hinten", "rechts", "links") else 1
        bl, br, tr, tl = (Vector(c) for c in corners)
        for k in range(n):
            t0, t1 = k / n, (k + 1) / n
            base = len(verts)
            verts.extend([bl.lerp(tl, t0) * PX, br.lerp(tr, t0) * PX, br.lerp(tr, t1) * PX, bl.lerp(tl, t1) * PX])
            faces.append((base, base + 1, base + 2, base + 3))
            y0, y1 = ry + rh * (1 - t0), ry + rh * (1 - t1)
            uvs.extend([(rx, y0), (rx + rw, y0), (rx + rw, y1), (rx, y1)])
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    layer = me.uv_layers.new(name="uv")
    for loop in me.loops:
        x, y = uvs[loop.vertex_index]
        layer.data[loop.index].uv = (x / tex_w, 1.0 - y / tex_h)
    me.materials.append(mat)
    me.update()
    return me


def _slim(image):
    """Slim-Skin (Alex): Pixel (54, 20) im rechten Arm ist durchsichtig."""
    w, h = image.size
    if w != 64 or h != 64:
        return False
    px = image.pixels[:]
    y = 63 - 20
    return px[(y * 64 + 54) * 4 + 3] < 0.5


class Figur:
    """Eine gebaute Figur: `wurzel` trägt Position und Blickrichtung, `gelenke` die Posen-Winkel."""

    def __init__(self, name, wurzel, gelenke, teile, slim):
        self.name = name
        self.wurzel = wurzel
        self.gelenke = gelenke
        self.teile = teile
        self.slim = slim
        # Ruheform der Glieder (für Ellbogen/Knie) und aktuelle Beugung in Grad
        self.ruhe = {n: [v.co.copy() for v in ob.data.vertices] for n, ob in teile.items() if n.split(".")[0] in GLIEDER}
        self.beugung = {g: 0.0 for g in GLIEDER}

    def hand(self, seite):
        """Weltposition der Faust – folgt dem gebeugten Unterarm."""
        bpy.context.view_layer.update()
        arm = self.teile[f"arm_{seite}"]
        return arm.matrix_world @ (_beuge_matrix(f"arm_{seite}", self.beugung[f"arm_{seite}"]) @ Vector((0, 0, -5.2 * PX)))

    def kopf_punkte(self):
        """Oberkante und Unterkante der Kopfmitte in Weltkoordinaten (für die Kamera-Rahmung)."""
        bpy.context.view_layer.update()
        mw = self.teile["kopf"].matrix_world
        return mw @ Vector((0, 0, 4 * PX)), mw @ Vector((0, 0, -4 * PX))

    def gesicht_richtung(self):
        """Blickrichtung des Gesichts in Weltkoordinaten."""
        bpy.context.view_layer.update()
        return (self.teile["kopf"].matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()

    def kopf_ecken(self):
        """Die acht Ecken des Kopfwürfels (mit zweiter Ebene) in Weltkoordinaten."""
        bpy.context.view_layer.update()
        mw = self.teile["kopf"].matrix_world
        return [mw @ Vector(c) for c in self.teile["kopf"].bound_box]

    def kopf_mitte(self):
        bpy.context.view_layer.update()
        return self.teile["kopf"].matrix_world.translation.copy()


def baue_figur(name, skin_path, slim=None, fase=True, collection=None):
    col = collection or bpy.context.scene.collection
    image = bpy.data.images.load(skin_path, check_existing=True)
    image.alpha_mode = "STRAIGHT"
    tex_w, tex_h = image.size
    alt = tex_h == 32  # altes 64×32-Format: linke Glieder = gespiegelte rechte, keine zweite Ebene am Körper
    if slim is None:
        slim = _slim(image)
    arm_w = 3 if slim else 4
    mat = _material(f"{name}.skin", image, False)
    mat2 = _material(f"{name}.skin2", image, True)

    def empty(n, loc, parent=None):
        e = bpy.data.objects.new(f"{name}.{n}", None)
        e.empty_display_size = 0.05
        col.objects.link(e)
        if parent:
            e.parent = parent
        e.location = Vector(loc) * PX
        e.rotation_mode = "XYZ"
        return e

    wurzel = empty("wurzel", (0, 0, 0))
    huefte = empty("huefte", (0, 0, 12), wurzel)  # Oberkörper dreht und neigt sich um die Hüfte
    gelenke = {
        "koerper": huefte,
        "kopf": empty("hals", (0, 0, 12), huefte),  # 24 px über dem Boden
        "arm_r": empty("schulter_r", (-4 - arm_w / 2 + 0.5, 0, 10 if not slim else 9.5), huefte),
        "arm_l": empty("schulter_l", (4 + arm_w / 2 - 0.5, 0, 10 if not slim else 9.5), huefte),
        "bein_r": empty("huefte_r", (-2, 0, 12), wurzel),
        "bein_l": empty("huefte_l", (2, 0, 12), wurzel),
    }
    # Mittelpunkt des Teils relativ zu seinem Gelenk (px)
    mitte = {
        "koerper": (0, 0, 6),
        "kopf": (0, 0, 4),
        "arm_r": (-0.5, 0, -4),
        "arm_l": (0.5, 0, -4),
        "bein_r": (0, 0, -6),
        "bein_l": (0, 0, -6),
    }
    teile = {}
    for teil, (uv1, uv2, dims, inflate) in TEILE.items():
        dims = (arm_w, dims[1], dims[2]) if teil.startswith("arm") else dims
        src1, src2 = uv1, uv2
        if alt and teil in ("arm_l", "bein_l"):
            src1 = TEILE[teil.replace("_l", "_r")][0]
        for ebene, (uv, blow, m) in enumerate(((src1, 0.0, mat), (src2, inflate, mat2))):
            if ebene == 1 and alt and teil != "kopf":
                continue
            rects = _box_rects(uv[0], uv[1], *dims)
            me = _mesh(f"{name}.{teil}.{ebene}", rects, dims, tex_w, tex_h, blow, m, teilung=dims[1] * 2 if teil in GLIEDER else 1)
            ob = bpy.data.objects.new(me.name, me)
            col.objects.link(ob)
            ob.parent = gelenke[teil]
            ob.location = Vector(mitte[teil]) * PX
            if alt and teil in ("arm_l", "bein_l"):
                ob.scale.x = -1  # gespiegelt wie im Spiel
            if ebene == 0:
                teile[teil] = ob
                if fase:
                    bev = ob.modifiers.new("Fase", "BEVEL")
                    bev.width = 0.2 * PX  # Stilbuch: feine helle Kante an jeder Würfelkante
                    bev.segments = 2
                    # nur echte Würfelkanten (90°), nicht die leicht geknickten Reihen am gebeugten Gelenk
                    bev.limit_method = "ANGLE"
                    bev.angle_limit = math.radians(60)
                    bev.harden_normals = True
                    for poly in me.polygons:
                        poly.use_smooth = True
                    if hasattr(me, "use_auto_smooth"):
                        me.use_auto_smooth = True
            else:
                teile[f"{teil}.2"] = ob
    return Figur(name, wurzel, gelenke, teile, slim)


def _arm_matrix(seite, heben, seitlich, drehen):
    """Stilbuch-Winkel → Rotation: `heben` 0 = hängt, 90 = nach vorn, 180 = nach oben; `seitlich` = vom Körper weg
    (positiv) bzw. zur Körpermitte (negativ); `drehen` = Drehung um die Hochachse, positiv = nach +X (zum Thema)."""
    s = -1 if seite == "r" else 1  # rechte Seite liegt bei −X
    # Reihenfolge: erst seitlich abspreizen, dann nach vorn/oben heben – so bleibt „seitlich“ bei jeder Armhöhe
    # „vom Körper weg“ (umgekehrt kippt ein hoch erhobener, abgespreizter Arm zur Körpermitte)
    return (Matrix.Rotation(math.radians(drehen), 4, "Z")
            @ Matrix.Rotation(math.radians(-heben), 4, "X")
            @ Matrix.Rotation(math.radians(seitlich * s * -1), 4, "Y"))


def pose(figur, p):
    """Setzt eine Pose. Schlüssel (alle optional, Grad):
    Drehrichtung überall: positiv = nach +X, also zum Thema, das rechts im Bild steht (steht die Figur rechts, spiegelt die Szene).
    kopf: {drehen, nicken, neigen}  – nicken positiv = nach unten, neigen positiv = Kopf zur +X-Schulter
    koerper: {drehen, vor, neigen}   – vor = nach vorn beugen
    arm_r/arm_l: {heben, seitlich, drehen, beugen}  – beugen = Ellbogen, 0 = gestreckt, 90 = rechter Winkel nach vorn
    bein_r/bein_l: {vor, seitlich, beugen}  – vor positiv = Bein nach vorn; beugen = Knie (Unterschenkel nach hinten)
    blick: Grad, um den sich die ganze Figur um die Hochachse dreht (0 = schaut nach −Y, −90 = nach −X, 90 = nach +X)
    kippen: ganze Figur um die Füße nach hinten kippen (Taumeln, Sturz)
    """
    g = figur.gelenke
    # kippen: ganze Figur um die Füße nach hinten (positiv) bzw. vorn – für Taumeln/Sturz (Stilbuch Pose 21)
    figur.wurzel.rotation_euler = Euler((math.radians(-p.get("kippen", 0)), math.radians(p.get("kippen_seite", 0)), math.radians(p.get("blick", 0))), "XYZ")
    k = p.get("koerper", {})
    g["koerper"].rotation_euler = Euler((math.radians(-k.get("vor", 0)), math.radians(k.get("neigen", 0)), math.radians(k.get("drehen", 0))), "ZXY")
    h = p.get("kopf", {})
    g["kopf"].rotation_mode = "ZXY"
    g["kopf"].rotation_euler = Euler((math.radians(-h.get("nicken", 0)), math.radians(h.get("neigen", 0)), math.radians(h.get("drehen", 0))), "ZXY")
    for seite in ("r", "l"):
        a = p.get(f"arm_{seite}", {})
        m = _arm_matrix(seite, a.get("heben", 0), a.get("seitlich", 0), a.get("drehen", 0))
        g[f"arm_{seite}"].rotation_mode = "QUATERNION"
        g[f"arm_{seite}"].rotation_quaternion = m.to_quaternion()
        b = p.get(f"bein_{seite}", {})
        s = -1 if seite == "r" else 1
        g[f"bein_{seite}"].rotation_euler = Euler((math.radians(-b.get("vor", 0)), math.radians(-b.get("seitlich", 0) * s * -1), 0), "XYZ")
        _beuge(figur, f"arm_{seite}", a.get("beugen", 0))
        _beuge(figur, f"bein_{seite}", b.get("beugen", 0))
    bpy.context.view_layer.update()
