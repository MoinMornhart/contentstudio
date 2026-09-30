"""Items aus der echten Item-Textur (ROADMAP 4.6): Jeder undurchsichtige Pixel wird ein Würfel (wie im Spiel,
1 Pixel dick). Gehaltene Waffen und Werkzeuge liegen nach Stilbuch 4 flach zur Kamera und diagonal im Bild:
Klinge 30–50° zur Bildhorizontalen, Spitze nach oben und vom Gesicht weg, Griff in der Faust.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

from .bloecke import _rgba_im_speicher
from .figur import PX

# Größe in der Hand: Stilbuch 4 – mitgehaltenes Schwert 1,3–1,6 Kopfgrößen (Diagonale), Kopf = 8 px
ITEM_PIXEL = 1.45 * 8 * PX / (16 * math.sqrt(2))


def _bild(ordner, name):
    pfad = os.path.join(ordner, "item", f"{name}.png")
    if not os.path.exists(pfad):  # manche Items (Fackel, Blumen) nutzen im Spiel die Blocktextur
        pfad = os.path.join(ordner, "block", f"{name}.png")
    if not os.path.exists(pfad):
        raise FileNotFoundError(f"Item-Textur {name} fehlt in der Spieldatei ({pfad})")
    img = bpy.data.images.load(pfad, check_existing=True)
    img.alpha_mode = "STRAIGHT"
    return _rgba_im_speicher(img, pfad)


def baue_item(name, texturen_ordner, pixel=ITEM_PIXEL, collection=None):
    """Extrudiertes Item: Texturfläche in X (rechts) und Z (oben), Vorderseite zeigt nach −Y, Mitte im Ursprung.
    Gibt das Objekt zurück; `obj["griff"]` ist die lokale Griffposition (unten links, wie im Spiel)."""
    col = collection or bpy.context.scene.collection
    img = _bild(texturen_ordner, name)
    w, h = img.size
    px = img.pixels[:]

    def deckend(i, j):
        if i < 0 or j < 0 or i >= w or j >= h:
            return False
        return px[(j * w + i) * 4 + 3] > 0.5

    verts, faces, uvs = [], [], []
    d = 0.5 * pixel

    def quad(ecken, u, v):
        b = len(verts)
        verts.extend(ecken)
        faces.append((b, b + 1, b + 2, b + 3))
        uvs.extend([(u, v)] * 4)

    for j in range(h):
        for i in range(w):
            if not deckend(i, j):
                continue
            x0, x1 = (i - w / 2) * pixel, (i + 1 - w / 2) * pixel
            z0, z1 = (j - h / 2) * pixel, (j + 1 - h / 2) * pixel
            u, v = (i + 0.5) / w, (j + 0.5) / h
            quad([(x0, -d, z0), (x1, -d, z0), (x1, -d, z1), (x0, -d, z1)], u, v)  # vorn
            quad([(x1, d, z0), (x0, d, z0), (x0, d, z1), (x1, d, z1)], u, v)  # hinten
            if not deckend(i - 1, j):
                quad([(x0, d, z0), (x0, -d, z0), (x0, -d, z1), (x0, d, z1)], u, v)
            if not deckend(i + 1, j):
                quad([(x1, -d, z0), (x1, d, z0), (x1, d, z1), (x1, -d, z1)], u, v)
            if not deckend(i, j - 1):
                quad([(x0, d, z0), (x1, d, z0), (x1, -d, z0), (x0, -d, z0)], u, v)
            if not deckend(i, j + 1):
                quad([(x0, -d, z1), (x1, -d, z1), (x1, d, z1), (x0, d, z1)], u, v)
    me = bpy.data.meshes.new(f"item.{name}")
    me.from_pydata(verts, [], faces)
    layer = me.uv_layers.new(name="uv")
    for poly in me.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[me.loops[li].vertex_index]
    mat = bpy.data.materials.new(f"item.{name}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.35
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.15
    me.materials.append(mat)
    ob = bpy.data.objects.new(me.name, me)
    col.objects.link(ob)
    # Griff: bei Waffen und Werkzeugen liegt der Griff unten links in der Textur (Pixel ~ 3, 3)
    ob["griff"] = ((3.5 - w / 2) * pixel, 0.0, (3.5 - h / 2) * pixel)
    return ob


def in_die_hand(item, figur, seite, kamera, winkel=40.0):
    """Richtet ein gehaltenes Item nach Stilbuch 4 aus: Griff in der Faust von `figur` (Arm `seite` = "r"/"l"),
    Fläche zur Kamera, Klinge `winkel` Grad über der Bildhorizontalen, Spitze vom Gesicht weg."""
    bpy.context.view_layer.update()
    hand = figur.hand(seite)  # folgt dem gebeugten Ellbogen
    cam = kamera.matrix_world.to_3x3()
    rechts, oben, vor = cam @ Vector((1, 0, 0)), cam @ Vector((0, 1, 0)), cam @ Vector((0, 0, -1))
    # Spitze vom Gesicht weg: liegt der Kopf im Bild links von der Hand, zeigt die Klinge nach rechts oben
    kopf = figur.kopf_mitte()
    nach_rechts = (hand - kopf).dot(rechts) >= 0
    a = math.radians(winkel)
    klinge = (rechts * (math.cos(a) if nach_rechts else -math.cos(a)) + oben * math.sin(a)).normalized()
    # Lokale Achsen: Diagonale (1,0,1)/√2 → Klinge, lokales +Y → Blickrichtung der Kamera (Vorderseite zur Kamera)
    y_w = vor.normalized()
    e2 = y_w.cross(klinge).normalized()
    diag, anti = klinge, e2
    x_w = ((diag - anti) / math.sqrt(2)).normalized()
    z_w = ((diag + anti) / math.sqrt(2)).normalized()
    if x_w.cross(y_w).dot(z_w) < 0:  # rechtshändiges System erzwingen
        anti = -e2
        x_w = ((diag - anti) / math.sqrt(2)).normalized()
        z_w = ((diag + anti) / math.sqrt(2)).normalized()
    rot = Matrix((x_w, y_w, z_w)).transposed().to_4x4()
    griff = Vector(item["griff"])
    item.matrix_world = Matrix.Translation(hand) @ rot @ Matrix.Translation(-griff)
    bpy.context.view_layer.update()
    return item
