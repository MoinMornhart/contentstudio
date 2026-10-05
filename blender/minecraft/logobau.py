# Herkunft: MoinStudio blender/moin/logobau.py (MIT), v0.38.0.
"""Logos bauen (Richtungsmodul Minecraft) – ohne Bildgenerator, nur aus echten Minecraft-Dateien: die Minecraft-Schrift
der Spieldatei, Blocktexturen, Items, Mob-Köpfe und der Skin des Creators oder seiner Freunde.

Zwei Stile, beide mit transparentem Hintergrund:
- „2d“: Blockschrift als Pixelarbeit (numpy): Füllung aus Blocktextur oder Farbverlauf, gemeißelte Kanten, Tiefe nach
  unten rechts wie bei 3D-Blockbuchstaben, dicke Kontur, harter Schatten. Symbol als Iso-Würfel (Block, Kopf) oder Item.
- „3d“: echter 3D-Blocktext in Blender – jeder Pixel der Schrift wird ein Würfel mit echter Blocktextur, dazu Block,
  Item oder Kopf als 3D-Modell; Cycles mit transparentem Film, danach Kontur und Schatten wie beim 2D-Stil.

spec: {text, untertitel, stil, fuellung: {art: textur|verlauf, block, oben, unten}, kontur, kontur_dicke, schatten,
symbol: {art: kopf|block|item, name, datei, platz: links|rechts|oben}, neigung, untertitel_farbe, samples, geraet}
"""
import math
import os

import numpy as np

from . import logo as ml
from .text import Schrift, _drehe

# Kontur in Glyphen-Pixeln
DICKE = {"keine": 0.0, "duenn": 0.22, "mittel": 0.4, "dick": 0.62}
# Hell/Dunkel der drei sichtbaren Würfelseiten (wie das Inventar im Spiel)
LICHT = {"oben": 1.0, "vorn": 0.9, "seite": 0.68}


def hex_farbe(h, standard=(1.0, 1.0, 1.0)):
    try:
        h = str(h).lstrip("#")
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except (ValueError, TypeError):
        return standard


def _srgb(c):
    """lineare Einfärbung aus bloecke.py → sRGB"""
    return tuple(v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in c)


def _texturbild(textures, name, unter="block"):
    pfad = os.path.join(textures, unter, f"{name}.png")
    a = ml.lade(pfad)
    return a[:a.shape[1]]  # animierte Streifen: erstes Bild


def block_texturen(textures, art):
    """Texturen eines Blocks je Seite (sRGB, eingefärbt wie im Spiel) über das Blockmodell der Spieldatei."""
    from . import bloecke

    info = bloecke.art_info(art, bloecke.Texturen(textures))

    def lade(eintrag, overlay=None):
        name, farbe = eintrag
        a = _texturbild(textures, name).copy()
        if farbe:
            a[..., :3] *= np.array(_srgb(farbe), dtype=np.float32)
        if overlay:
            o = _texturbild(textures, overlay[0]).copy()
            o[..., :3] *= np.array(_srgb(overlay[1]), dtype=np.float32)
            a = ml.ueber(o, a)
        return a

    if "alle" in info:
        t = lade(info["alle"])
        return {"oben": t, "vorn": t, "seite": t}
    seite = lade(info["seite"], info.get("overlay"))
    return {"oben": lade(info["oben"]), "vorn": lade(info["vorn"]) if "vorn" in info else seite, "seite": seite}


def kopf_texturen(datei):
    """Kopf aus einem Skin oder einer Mob-Textur (gleiches Box-Layout 8×8×8 bei 0,0) samt zweiter Ebene."""
    skin = ml.lade(datei)
    s = skin.shape[1] / 64

    def teil(x, y):
        return skin[int(y * s):int((y + 8) * s), int(x * s):int((x + 8) * s)]

    faces = {"oben": teil(8, 0), "vorn": teil(8, 8), "seite": teil(16, 8)}
    if skin.shape[0] >= 16 * s and skin.shape[1] >= 56 * s:
        for k, (x, y) in {"oben": (40, 0), "vorn": (40, 8), "seite": (48, 8)}.items():
            faces[k] = ml.ueber(teil(x, y), faces[k])
    for f in faces.values():
        f[..., 3] = 1.0  # die erste Ebene ist immer deckend
    return faces


def iso_wuerfel(faces, breite):
    """Würfel schräg von oben (wie im Inventar): oben, vorn (links im Bild), Seite (rechts im Bild). Pixelscharf."""
    W = int(breite)
    e = W / math.sqrt(3)
    H = int(round(2 * e))
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32) + 0.5
    aus = np.zeros((H, W, 4), dtype=np.float32)
    flaechen = (
        ("oben", (0, e / 2), (W / 2, -e / 2), (W / 2, e / 2), True),
        ("vorn", (0, e / 2), (W / 2, e / 2), (0, e), False),
        ("seite", (W / 2, e), (W / 2, -e / 2), (0, e), False),
    )
    for name, o, a, b, oben in flaechen:
        tex = faces[name]
        th, tw = tex.shape[:2]
        det = a[0] * b[1] - a[1] * b[0]
        px, py = xs - o[0], ys - o[1]
        s = (px * b[1] - py * b[0]) / det
        t = (a[0] * py - a[1] * px) / det
        ok = (s >= 0) & (s < 1) & (t >= 0) & (t < 1)
        tx, ty = (t, 1 - s) if oben else (s, t)
        ix = np.clip((tx * tw).astype(int), 0, tw - 1)
        iy = np.clip((ty * th).astype(int), 0, th - 1)
        farbe = tex[iy, ix]
        farbe[..., :3] *= LICHT[name]
        sichtbar = ok & (farbe[..., 3] > 0.5)
        aus[sichtbar] = farbe[sichtbar]
    return aus


def symbol_bild(symbol, hoehe, textures):
    """Symbol als RGBA-Bild mit etwa `hoehe` Pixeln Höhe."""
    art = symbol.get("art")
    if art == "item":
        a = ml.lade(symbol["datei"])
        a = a[:a.shape[1]]
        return ml.skaliere_pixel(a, max(1, hoehe // a.shape[0]))
    faces = kopf_texturen(symbol["datei"]) if art == "kopf" else block_texturen(textures, symbol["name"])
    return iso_wuerfel(faces, int(hoehe * math.sqrt(3) / 2))


def fuellung(maske, k, spec, textures):
    """Farbe der Buchstaben: Blocktextur (Texturpixel = halber Schriftpixel) oder Verlauf von oben nach unten."""
    H, W = maske.shape
    f = spec.get("fuellung") or {}
    if f.get("art") == "textur" and f.get("block"):
        tex = block_texturen(textures, f["block"])["vorn"]
        th, tw = tex.shape[:2]
        px = max(1, k // 2)
        ys = (np.arange(H) // px) % th
        xs = (np.arange(W) // px) % tw
        return tex[ys][:, xs, :3].copy()
    oben = np.array(hex_farbe(f.get("oben"), (1.0, 0.85, 0.2)), dtype=np.float32)
    unten = np.array(hex_farbe(f.get("unten"), tuple(oben * 0.75)), dtype=np.float32)
    zeilen = max(1, H // k - 1)
    t = np.clip((np.arange(H) // k) / zeilen, 0, 1)[:, None, None]  # stufig je Schriftpixel (Pixel-Look)
    return np.broadcast_to(oben * (1 - t) + unten * t, (H, W, 3)).copy()


def lege(ziel, quelle, x, y):
    """RGBA `quelle` bei (x, y) über `ziel` legen (in place)."""
    h, w = quelle.shape[:2]
    ziel[y:y + h, x:x + w] = ml.ueber(quelle, ziel[y:y + h, x:x + w])


def schrift_ebene(schrift, text, k, spec, textures, tiefe=0.8, farbe=None):
    """Schriftzug als RGBA: Füllung, gemeißelte Kanten, Tiefe nach unten rechts (3D-Blockbuchstaben)."""
    m = schrift.satz(text)
    M = np.kron(m, np.ones((k, k), dtype=bool))
    H, W = M.shape
    fl = np.broadcast_to(np.array(farbe, dtype=np.float32), (H, W, 3)).copy() if farbe else fuellung(M, k, spec, textures)
    b = max(1, k // 6)
    hell = M & ~ml.verschiebe(M, 0, b) | M & ~ml.verschiebe(M, b, 0)
    dunkel = M & ~ml.verschiebe(M, 0, -b) | M & ~ml.verschiebe(M, -b, 0)
    fl[hell] = np.minimum(1.0, fl[hell] * 1.22 + 0.06)
    fl[dunkel] *= 0.72
    front = np.concatenate([fl, M[..., None].astype(np.float32)], axis=-1)
    d = int(round(k * tiefe))
    dx = int(round(d * 0.35))
    ebene = np.zeros((H + d, W + dx, 4), dtype=np.float32)
    if d:
        seite = front.copy()
        seite[..., :3] *= 0.42
        for s in range(d, 0, -1):
            lege(ebene, seite, int(round(s * 0.35)), s)
    lege(ebene, front, 0, 0)
    return ebene, H


def baue_2d(spec, assets, textures):
    schrift = Schrift(assets)
    text = (spec.get("text") or "LOGO").upper()
    breite_px = schrift.satz(text).shape[1]
    k = int(max(8, min(26, 1900 // max(1, breite_px))))
    haupt, h_front = schrift_ebene(schrift, text, k, spec, textures)
    teile = [haupt]
    unter = None
    if spec.get("untertitel"):
        k2 = max(6, int(k * 0.5))
        unter, _ = schrift_ebene(schrift, spec["untertitel"].upper(), k2, spec, textures, tiefe=0.5, farbe=hex_farbe(spec.get("untertitel_farbe"), (1.0, 1.0, 1.0)))
    sym = None
    if spec.get("symbol") and spec["symbol"].get("art"):
        sym = symbol_bild(spec["symbol"], int(h_front * 1.45), textures)
    return komponiere(haupt, unter, sym, (spec.get("symbol") or {}).get("platz", "links"), k, spec)


def komponiere(haupt, unter, sym, platz, k, spec):
    """Schrift, Untertitel und Symbol anordnen, Kontur und Schatten, leicht schräg, zuschneiden."""
    luecke = k * 2
    # Block aus Schrift und Untertitel
    bw = max(haupt.shape[1], unter.shape[1] if unter is not None else 0)
    bh = haupt.shape[0] + (unter.shape[0] + k if unter is not None else 0)
    block = np.zeros((bh, bw, 4), dtype=np.float32)
    lege(block, haupt, (bw - haupt.shape[1]) // 2, 0)
    if unter is not None:
        lege(block, unter, (bw - unter.shape[1]) // 2, haupt.shape[0] + k)
    if sym is not None and platz == "oben":
        W = max(bw, sym.shape[1])
        H = sym.shape[0] + luecke // 2 + bh
        teile = [(sym, (W - sym.shape[1]) // 2, 0), (block, (W - bw) // 2, sym.shape[0] + luecke // 2)]
    elif sym is not None:
        W = bw + sym.shape[1] + luecke
        H = max(bh, sym.shape[0])
        ys, yb = (H - sym.shape[0]) // 2, (H - bh) // 2
        teile = [(sym, 0, ys), (block, sym.shape[1] + luecke, yb)] if platz != "rechts" else [(block, 0, yb), (sym, bw + luecke, ys)]
    else:
        W, H, teile = bw, bh, [(block, 0, 0)]
    rand = k * 3
    bild = np.zeros((H + 2 * rand, W + 2 * rand, 4), dtype=np.float32)
    for t, x, y in teile:
        lege(bild, t, x + rand, y + rand)
    return veredeln(bild, k, spec)


def veredeln(bild, k, spec):
    """Dicke Kontur und harter Schatten (Lesbarkeit auf jedem Hintergrund), leichte Neigung, zuschneiden."""
    maske = bild[..., 3] > 0.5
    dicke = DICKE.get(spec.get("kontur_dicke", "mittel"), 0.4) * k
    if dicke > 0:
        kontur = ml.wachse(maske, dicke)
        farbe = np.array(hex_farbe(spec.get("kontur"), (0.08, 0.08, 0.1)), dtype=np.float32)
        unten = np.zeros_like(bild)
        unten[kontur, :3] = farbe
        unten[kontur, 3] = 1.0
        bild = ml.ueber(bild, unten)
    if spec.get("schatten", True):
        alpha = ml.verschiebe(bild[..., 3], k * 0.4, k * 0.55)
        schatten = np.zeros_like(bild)
        schatten[..., 3] = np.clip(ml.weich(alpha, max(1, k * 0.12)), 0, 1) * 0.55
        bild = ml.ueber(bild, schatten)
    grad = float(spec.get("neigung") or 0)
    if abs(grad) >= 0.5:
        bild = _drehe(bild, max(-12.0, min(12.0, grad)))
    return ml.zuschneiden(bild, rand=max(2, k // 3))


# ---------------------------------------------------------------- 3D in Blender

def _voxel(name, maske, v, tiefe, x0, z0, uv_kachel, farbe_zeile=None):
    """Schriftmaske als Würfel-Mesh (nur sichtbare Seiten), Vorderseite nach −Y. UVs kacheln die Textur über
    `uv_kachel` Würfel; `farbe_zeile(j)` gibt je Zeile eine Farbe für den Verlauf."""
    import bpy

    h, w = maske.shape
    verts, faces, uvs, farben = [], [], [], []

    def voll(i, j):
        return 0 <= i < w and 0 <= j < h and maske[j, i]

    def quad(ecken, uv, farbe):
        n = len(verts)
        verts.extend(ecken)
        faces.append((n, n + 1, n + 2, n + 3))
        uvs.extend(uv)
        farben.append(farbe)

    d = tiefe * v
    for j in range(h):
        for i in range(w):
            if not maske[j, i]:
                continue
            xa, xb = x0 + i * v, x0 + (i + 1) * v
            za, zb = z0 - (j + 1) * v, z0 - j * v
            f = farbe_zeile(j) if farbe_zeile else (1, 1, 1)
            u = lambda x: x / (v * uv_kachel)
            quad([(xa, 0, za), (xb, 0, za), (xb, 0, zb), (xa, 0, zb)], [(u(xa), u(za)), (u(xb), u(za)), (u(xb), u(zb)), (u(xa), u(zb))], f)
            quad([(xb, d, za), (xa, d, za), (xa, d, zb), (xb, d, zb)], [(u(xb), u(za)), (u(xa), u(za)), (u(xa), u(zb)), (u(xb), u(zb))], f)
            if not voll(i, j - 1):
                quad([(xa, 0, zb), (xb, 0, zb), (xb, d, zb), (xa, d, zb)], [(u(xa), 0), (u(xb), 0), (u(xb), u(d)), (u(xa), u(d))], f)
            if not voll(i, j + 1):
                quad([(xa, d, za), (xb, d, za), (xb, 0, za), (xa, 0, za)], [(u(xa), u(d)), (u(xb), u(d)), (u(xb), 0), (u(xa), 0)], tuple(c * 0.8 for c in f))
            if not voll(i - 1, j):
                quad([(xa, d, za), (xa, 0, za), (xa, 0, zb), (xa, d, zb)], [(u(d), u(za)), (0, u(za)), (0, u(zb)), (u(d), u(zb))], f)
            if not voll(i + 1, j):
                quad([(xb, 0, za), (xb, d, za), (xb, d, zb), (xb, 0, zb)], [(0, u(za)), (u(d), u(za)), (u(d), u(zb)), (0, u(zb))], f)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    # jede Fläche hat eigene Ecken: Ecke i der Schleifen = Punkt i
    me.uv_layers.new(name="uv")
    me.color_attributes.new("farbe", "FLOAT_COLOR", "CORNER")
    me.uv_layers["uv"].data.foreach_set("uv", np.array(uvs, dtype=np.float32).ravel())
    ecken_farben = np.repeat(np.array([(*f, 1.0) for f in farben], dtype=np.float32), 4, axis=0)
    me.color_attributes["farbe"].data.foreach_set("color", ecken_farben.ravel())
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _farb_material(name):
    import bpy

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "farbe"
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.55
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def _linear(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def baue_3d(spec, assets, textures, ausgabe_roh):
    """Blocktext aus Würfeln mit echter Textur rendern (transparent). Liefert die Glyphenpixel-Größe im Bild."""
    import bpy
    from mathutils import Vector

    from . import bloecke
    from . import figur as mfigur
    from . import items as mitems
    from . import look as mlook

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    schrift = Schrift(assets)
    text = (spec.get("text") or "LOGO").upper()
    m = schrift.satz(text)
    v = 0.1
    f = spec.get("fuellung") or {}
    texturen = bloecke.Texturen(textures)
    if f.get("art") == "textur" and f.get("block"):
        info = bloecke.art_info(f["block"], texturen)
        name, farbe = info.get("alle") or info.get("vorn") or info["seite"]
        mat = texturen.material(name, farbe)
        zeile = None
    else:
        oben = np.array(_linear(hex_farbe(f.get("oben"), (1.0, 0.85, 0.2))))
        unten = np.array(_linear(hex_farbe(f.get("unten"), (0.9, 0.5, 0.05))))
        mat = _farb_material("verlauf")
        zeile = lambda j: tuple(oben * (1 - j / max(1, m.shape[0] - 1)) + unten * (j / max(1, m.shape[0] - 1)))
    breite = m.shape[1] * v
    haupt = _voxel("text", m, v, 2.2, -breite / 2, m.shape[0] * v / 2, 8, zeile)
    haupt.data.materials.append(mat)
    objekte = [haupt]
    if spec.get("untertitel"):
        mu = schrift.satz(spec["untertitel"].upper())
        vu = v * 0.5
        weiss = _linear(hex_farbe(spec.get("untertitel_farbe"), (1.0, 1.0, 1.0)))
        u = _voxel("untertitel", mu, vu, 2.0, -mu.shape[1] * vu / 2, -m.shape[0] * v / 2 - v * 1.2, 8, lambda j: weiss)
        u.data.materials.append(_farb_material("untertitel"))
        objekte.append(u)
    sym = spec.get("symbol") or {}
    hoehe = m.shape[0] * v * 1.35
    if sym.get("art"):
        platz = sym.get("platz", "links")
        if sym["art"] == "kopf":
            fig = mfigur.baue_figur("symbol", sym["datei"], fase=True)
            for n, ob in fig.teile.items():
                if not n.startswith("kopf"):
                    ob.hide_render = True
            s = hoehe / (8 * mfigur.PX)
            fig.wurzel.scale = (s, s, s)
            fig.wurzel.rotation_euler = (0, 0, math.radians(-28 if platz != "rechts" else 28))
            bpy.context.view_layer.update()
            ziel = Vector((-breite / 2 - hoehe * 1.0, 0, 0)) if platz != "rechts" else Vector((breite / 2 + hoehe * 1.0, 0, 0))
            if platz == "oben":
                ziel = Vector((0, 0, m.shape[0] * v / 2 + hoehe * 0.75))
            fig.wurzel.location += ziel - fig.kopf_mitte()
            objekte += [ob for n, ob in fig.teile.items() if n.startswith("kopf")]
        else:
            if sym["art"] == "block":
                ob = bloecke.baue({(0, 0, 0): sym["name"]}, texturen, name="symbol")
                ob.data.transform(__import__("mathutils").Matrix.Translation((-bloecke.BLOCK / 2, -bloecke.BLOCK / 2, bloecke.BLOCK / 2)))
                s = hoehe * 0.62 / bloecke.BLOCK
                ob.rotation_euler = (0, 0, math.radians(35))
            else:
                ob = mitems.baue_item(sym["name"], textures)
                s = hoehe / max(ob.dimensions.z, 1e-6)
            ob.scale = (s, s, s)
            x = -breite / 2 - hoehe * 0.65 if platz != "rechts" else breite / 2 + hoehe * 0.65
            ob.location = (x, 0, 0) if platz != "oben" else (0, 0, m.shape[0] * v / 2 + hoehe * 0.7)
            objekte.append(ob)
    # Neigung als echte Drehung der ganzen Gruppe
    gruppe = bpy.data.objects.new("gruppe", None)
    scene.collection.objects.link(gruppe)
    for ob in objekte:
        if ob.parent is None:
            ob.parent = gruppe
    for n in bpy.data.objects:
        if n.name.startswith("symbol.wurzel"):
            n.parent = gruppe
    gruppe.rotation_euler = (0, math.radians(-float(spec.get("neigung") or 0)), 0)
    bpy.context.view_layer.update()

    # Kamera leicht von unten rechts (Tiefe und Unterseite sichtbar wie beim Minecraft-Schriftzug)
    cam_d = bpy.data.cameras.new("kamera")
    cam_d.lens = 60
    cam = bpy.data.objects.new("kamera", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 1600, 800
    punkte = []
    for ob in bpy.data.objects:
        if ob.type == "MESH" and not ob.hide_render:
            punkte += [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    mitte = sum(punkte, Vector()) / len(punkte)
    richtung = Vector((-math.sin(math.radians(14)), math.cos(math.radians(14)), math.sin(math.radians(11)))).normalized()  # Blickrichtung der Kamera
    from bpy_extras.object_utils import world_to_camera_view

    abstand = 20.0
    for _ in range(4):
        cam.location = mitte - richtung * abstand
        cam.rotation_euler = richtung.to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        p = [world_to_camera_view(scene, cam, q) for q in punkte]
        ausdehnung = max(max(abs(q.x - 0.5) for q in p) / 0.46, max(abs(q.y - 0.5) for q in p) / 0.44)
        abstand *= ausdehnung
    # Bildformat an den Schriftzug anpassen (kein leerer Rand)
    bpy.context.view_layer.update()
    p = [world_to_camera_view(scene, cam, q) for q in punkte]
    bx = max(q.x for q in p) - min(q.x for q in p)
    by = (max(q.y for q in p) - min(q.y for q in p)) * scene.render.resolution_y / scene.render.resolution_x
    scene.render.resolution_y = int(max(240, min(1600, 1600 * (by + 0.08) / max(bx + 0.04, 1e-3))))
    scene.render.resolution_x = 1600
    cam_d.sensor_fit = "HORIZONTAL"

    # Licht: Sonne von vorn oben links, weiches Umgebungslicht
    sonne = bpy.data.lights.new("sonne", "SUN")
    sonne.energy = 3.2
    sonne.angle = math.radians(8)
    so = bpy.data.objects.new("sonne", sonne)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(-25), math.radians(-20))
    welt = bpy.data.worlds.new("welt")
    scene.world = welt
    welt.use_nodes = True
    welt.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    welt.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.render.engine = "CYCLES"
    mlook.gpu_einrichten(scene, spec.get("geraet", "CPU"))
    scene.cycles.samples = int(spec.get("samples", 32))
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = ausgabe_roh
    bpy.ops.render.render(write_still=True)
    # Größe eines Glyphenpixels im Bild (für Kontur und Schatten)
    ecken = [world_to_camera_view(scene, cam, haupt.matrix_world @ Vector(c)) for c in haupt.bound_box]
    return max(4, int((max(e.x for e in ecken) - min(e.x for e in ecken)) * scene.render.resolution_x / max(1, m.shape[1])))


def baue_logo(spec, assets, textures, ausgabe):
    warnungen = []
    if spec.get("stil") == "3d":
        roh = ausgabe.replace(".png", ".roh.png")
        k = baue_3d(spec, assets, textures, roh)
        bild = veredeln(np.pad(ml.lade(roh), ((k * 2, k * 2), (k * 2, k * 2), (0, 0))), k, {**spec, "neigung": 0})
    else:
        bild = baue_2d(spec, assets, textures)
    ml.speichere(bild, ausgabe)
    return {"breite": int(bild.shape[1]), "hoehe": int(bild.shape[0]), "warnungen": warnungen}
