"""Items aus der echten Item-Textur (ROADMAP 4.6): Jeder undurchsichtige Pixel wird ein Würfel (wie im Spiel,
1 Pixel dick). Gehaltene Waffen und Werkzeuge liegen nach Stilbuch 4 flach zur Kamera und diagonal im Bild:
Klinge 30–50° zur Bildhorizontalen, Spitze nach oben und vom Gesicht weg, Griff in der Faust.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

from .bloecke import _rgba_im_speicher
from .figur import PX, _beuge_matrix

# Größe in der Hand: Stilbuch 4 – mitgehaltenes Schwert 1,3–1,6 Kopfgrößen (Diagonale), Kopf = 8 px
ITEM_PIXEL = 1.45 * 8 * PX / (16 * math.sqrt(2))
# Griff von Werkzeugen und Waffen im zentrierten Item-Modell (Textur unten links, ca. Pixel 3/13 von oben links)
GRIFF = Vector((-4.5 / 16, -4.5 / 16, 0.0))


def _bild(ordner, name):
    pfad = os.path.join(ordner, "item", f"{name}.png")
    if not os.path.exists(pfad):  # manche Items (Fackel, Blumen) nutzen im Spiel die Blocktextur
        pfad = os.path.join(ordner, "block", f"{name}.png")
    if not os.path.exists(pfad):
        raise FileNotFoundError(f"Item-Textur {name} fehlt in der Spieldatei ({pfad})")
    img = bpy.data.images.load(pfad, check_existing=True)
    img.alpha_mode = "STRAIGHT"
    return _rgba_im_speicher(img, pfad)


def _dreizack(texturen_ordner, pixel, col):
    """Dreizack wie im Spiel in der Hand: kein Inventarbild, sondern das 3D-Modell (TridentModel, entity/trident.png,
    31 Pixel lang), aufrecht in der Faust, Zacken oben – wie das Spiel ihn in der dritten Person zeigt. Vorher war er
    nur ein kleiner grüner Klumpen in der Faust (Werkzeug-Prüfbogen 01.10.)."""
    from mathutils import Vector
    from . import mobs as mmobs

    pfad = os.path.join(texturen_ordner, "entity", "trident", "trident.png")
    if not os.path.exists(pfad):
        pfad = os.path.join(texturen_ordner, "entity", "trident.png")
    bild = bpy.data.images.load(pfad, check_existing=True)
    bild.alpha_mode = "STRAIGHT"
    # Java-Modell (y nach unten) in Bedrock-Form (y nach oben); Griff bei y = −20 liegt später 7 px unter der Mitte
    versatz = 13
    boxen = [
        {"origin": [-0.5, -27 + versatz, -0.5], "size": [1, 25, 1], "uv": [0, 6]},  # Stab
        {"origin": [-1.5, -2 + versatz, -0.5], "size": [3, 2, 1], "uv": [4, 0]},  # Querstück
        {"origin": [-2.5, -1 + versatz, -0.5], "size": [1, 4, 1], "uv": [4, 3]},  # Zacke links
        {"origin": [-0.5, 0 + versatz, -0.5], "size": [1, 4, 1], "uv": [0, 0]},  # Zacke Mitte
        {"origin": [1.5, -1 + versatz, -0.5], "size": [1, 4, 1], "uv": [4, 3], "mirror": True},  # Zacke rechts
    ]
    mat = mmobs._material("item.trident", bild)
    me = mmobs._mesh("item.trident", boxen, bild.size[0], bild.size[1], Vector((0, 0, 0)), mat)
    # mobs._mesh rechnet in Figur-Pixeln; auf die Item-Pixelgröße bringen
    me.transform(Matrix.Diagonal((pixel / PX, pixel / PX, pixel / PX, 1.0)))
    ob = bpy.data.objects.new("item.trident", me)
    col.objects.link(ob)
    ob["griff"] = (0.0, 0.0, 0.0)
    ob["pixel"] = pixel
    ob["aufrecht"] = True  # Haltung steht fest, keine Handgelenk-Drehung
    return ob


def baue_item(name, texturen_ordner, pixel=ITEM_PIXEL, collection=None):
    """Extrudiertes Item: Texturfläche in X (rechts) und Z (oben), Vorderseite zeigt nach −Y, Mitte im Ursprung.
    Gibt das Objekt zurück; `obj["griff"]` ist die lokale Griffposition (unten links, wie im Spiel)."""
    col = collection or bpy.context.scene.collection
    if name == "trident":
        return _dreizack(texturen_ordner, pixel, col)
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
    ob["pixel"] = pixel * 16 / max(w, 1)  # Kantenlänge eines Spiel-Pixels (Texturen mit 32/64 px sind feiner)
    return ob


def haltung(name, texturen_ordner, seite="r"):
    """Wie das Spiel das Item in der Hand hält: `display.thirdperson_righthand/lefthand` aus der Modellkette
    (models/item/<name>.json → parent …): Werkzeuge und Waffen erben von item/handheld (rotation [0, −90, 55],
    translation [0, 4, 0.5], scale 0.85), gewöhnliche Items von item/generated ([0, 0, 0], [0, 3, 1], 0.55)."""
    import json

    modelle = os.path.join(os.path.dirname(texturen_ordner), "models")
    schluessel = "thirdperson_righthand" if seite == "r" else "thirdperson_lefthand"
    if name == "trident":  # 3D-Modell (siehe _dreizack) aufrecht in der Faust, in voller Größe
        return {"rotation": [0, 0, 0], "translation": [0, 3.0, 1.0], "scale": [1.0, 1.0, 1.0]}
    pfad = os.path.join(modelle, "item", f"{name}.json")
    for _ in range(8):
        if not os.path.exists(pfad):
            break
        with open(pfad, encoding="utf-8") as fh:
            m = json.load(fh)
        d = (m.get("display") or {}).get(schluessel)
        if d:
            return {"rotation": d.get("rotation", [0, 0, 0]), "translation": d.get("translation", [0, 0, 0]), "scale": d.get("scale", [1, 1, 1])}
        eltern = m.get("parent", "")
        if not eltern or eltern.startswith("builtin"):
            break
        eltern = eltern.split(":")[-1]
        pfad = os.path.join(modelle, *eltern.split("/")) + ".json"
    # Standard: wie ein Werkzeug (die meisten Dinge in Thumbnails sind Werkzeuge und Waffen)
    return {"rotation": [0, -90, 55] if seite == "r" else [0, 90, -55], "translation": [0, 4.0, 0.5], "scale": [0.85, 0.85, 0.85]}


def mc_halten(item, figur, seite, pixel, anzeige, groesse=1.0):
    """Hält das Item exakt so wie Minecraft in der dritten Person (MoinStudio, 30.09.: „die Werkzeuge passen immer noch
    nicht, informiere dich ordentlich“). Nachgebaut aus dem Spiel:

    ItemInHandLayer: translateToHand(Arm) → Rx(−90°) → Ry(180°) → translate(±1/16, 2/16, −10/16)
    ItemTransform (display aus dem Modell): translate(t/16) → Rx·Ry·Rz(rotation) → scale → translate(−½, −½, −½)
    Das Item-Modell liegt im Würfel 0…1 (Textur in x/y, 1 px dick um z = 0.5).

    Unser Arm hat dieselbe Geometrie (12 px, Drehpunkt 2 px unter der Oberkante, rechter Arm auf −X, vorn = −Y).
    Modell-Arm-Raum von Minecraft (y nach unten, vorn −z) → unser Arm-Raum: (x, y, z) → (x, z, −y), 1 Einheit = 1 Block.
    Das Item folgt dem gebeugten Unterarm (Ellbogen) wie die Faust. `pixel`: Pixelgröße, mit der das Item gebaut ist."""
    from .bloecke import BLOCK

    arm = figur.teile[f"arm_{seite}"]
    rechts = seite == "r"
    rx, ry, rz = (math.radians(w) for w in anzeige["rotation"])
    tx, ty, tz = (w / 16 for w in anzeige["translation"])
    if not rechts:
        # ItemTransform.apply(leftHand = true): Drehung um y und z umgekehrt, x-Verschiebung gespiegelt – zusätzlich zu
        # den Werten für die linke Hand aus dem Modell. Ohne das schwebte z. B. die Spitzhacke links neben der Faust
        # (Werkzeug-Prüfbogen 01.10.)
        ry, rz, tx = -ry, -rz, -tx
    s = anzeige["scale"]
    # Übergröße (größer als im Spiel) wächst um den Griff, nicht um die Mitte: sonst rutschte der Griff bei 1,15–1,4
    # aus der Faust, das Schwert stand oben auf der Hand (MoinStudio, 02.10.: „Das Schwert ist falsch“)
    griff = Matrix.Translation(GRIFF) @ Matrix.Diagonal((groesse, groesse, groesse, 1.0)) @ Matrix.Translation(-GRIFF)
    # 1. Minecraft: Item-Modell (0…1) → Modell-Arm-Raum (Einheit Block)
    a = (Matrix.Rotation(math.radians(-90), 4, "X") @ Matrix.Rotation(math.radians(180), 4, "Y")
         @ Matrix.Translation(((1 if rechts else -1) / 16, 2 / 16, -10 / 16))
         @ Matrix.Translation((tx, ty, tz))
         @ Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")
         @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
         @ griff
         @ Matrix.Translation((-0.5, -0.5, -0.5)))
    # 2. unser Item-Netz (Mitte im Ursprung, Textur in X/Z, vorn −Y, Kante `pixel`) → Item-Modell (0…1)
    k = 1.0 / (16 * pixel)
    q = Matrix(((k, 0, 0, 0.5), (0, 0, k, 0.5), (0, -k, 0, 0.5), (0, 0, 0, 1)))
    # 3. Modell-Arm-Raum → unser Arm-Drehpunkt-Raum (Meter)
    c = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1))) @ Matrix.Diagonal((BLOCK, BLOCK, BLOCK, 1.0))
    # 4. Drehpunkt (Schulter) im Netz-Raum des Arms, dann Beugung des Unterarms und Weltlage des Arms
    drehpunkt = -Vector(arm.location)  # Netz liegt um „mitte“ vom Gelenk versetzt
    beuge = _beuge_matrix(f"arm_{seite}", figur.beugung[f"arm_{seite}"])
    item.matrix_world = arm.matrix_world @ beuge @ Matrix.Translation(drehpunkt) @ c @ a @ q
    bpy.context.view_layer.update()
    return item


def aufrichten(item, figur, seite, kamera, griff=0.2):
    """Flache Items (Fackel, Brot, Blume …) aufrecht in der Faust, Fläche zur Kamera: im Spiel zeigen sie bei hängendem
    Arm mit der Spitze nach vorn und sind von vorn nur ein Punkt (Werkzeug-Prüfbogen 01.10.: Fackel unsichtbar).
    Thumbnail-Künstler halten sie hoch wie eine Fackel."""
    faust = figur.hand(seite)
    m = item.matrix_world.to_3x3().normalized()
    oben_jetzt = (m @ Vector((0, 0, 1))).normalized()
    ziel_oben = Vector((0, 0, 1))
    dreh = oben_jetzt.rotation_difference(ziel_oben).to_matrix().to_4x4()
    item.matrix_world = Matrix.Translation(faust) @ dreh @ Matrix.Translation(-faust) @ item.matrix_world
    bpy.context.view_layer.update()
    # um die Hochachse drehen, bis die Fläche zur Kamera zeigt
    normale = (item.matrix_world.to_3x3() @ Vector((0, 1, 0)))
    normale.z = 0
    zur_kamera = kamera.matrix_world.translation - faust
    zur_kamera.z = 0
    if normale.length > 1e-6 and zur_kamera.length > 1e-6:
        winkel = normale.normalized().to_2d().angle_signed(zur_kamera.normalized().to_2d())
        item.matrix_world = Matrix.Translation(faust) @ Matrix.Rotation(-winkel, 4, "Z") @ Matrix.Translation(-faust) @ item.matrix_world
        bpy.context.view_layer.update()
    # die Faust hält nur das untere Ende: Mitte steckte sonst samt halber Fackel in Faust und Ärmel
    ecken = [item.matrix_world @ Vector(c) for c in item.bound_box]
    unten = min(e.z for e in ecken)
    hoehe = max(e.z for e in ecken) - unten
    # und vor die Faust zur Kamera hin – schmale Items (Fackel: 2 px) steckten sonst im 4 px breiten Arm
    vor = kamera.matrix_world.translation - faust
    vor.z = 0
    vor = vor.normalized() * 2.6 * PX * figur.wurzel.scale.x if vor.length > 1e-6 else Vector()
    item.matrix_world = Matrix.Translation(Vector((vor.x, vor.y, faust.z - unten - hoehe * griff))) @ item.matrix_world
    bpy.context.view_layer.update()
    item["aufrecht"] = True
    return item


def _stiel_drehen(item, faust, kamera):
    """Sieht man das Werkzeug fast nur von der Kante (ein Strich, z. B. Axt beim Sturmangriff), wird es um den eigenen
    Stiel gedreht, bis die Fläche zur Kamera zeigt – wie man ein Werkzeug in der Hand dreht. Die Spitze bleibt, wo sie
    ist (Drehungen um den Unterarm kippten Kopf von Axt und Hacke weg, MoinStudio, 01.10.)."""
    basis = item.matrix_world.copy()
    stiel = (basis.to_3x3() @ Vector((1, 0, 1))).normalized()  # Griff unten links → Spitze oben rechts

    def flach(grad):
        m = Matrix.Translation(faust) @ Matrix.Rotation(math.radians(grad), 4, stiel) @ Matrix.Translation(-faust) @ basis
        normale = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
        return abs(normale.dot((kamera.matrix_world.translation - m.translation).normalized()))

    if flach(0) >= 0.3:
        return
    grad = max((0, 25, -25, 45, -45, 65, -65), key=lambda g: flach(g) - abs(g) / 400)
    item.matrix_world = Matrix.Translation(faust) @ Matrix.Rotation(math.radians(grad), 4, stiel) @ Matrix.Translation(-faust) @ basis
    bpy.context.view_layer.update()
    print("CS_STIEL", item.name, grad, round(flach(0), 2), "->", round(flach(grad), 2))


def handgelenk_drehen(item, figur, seite, kamera):
    """Spiel-Haltung beibehalten, aber im Handgelenk drehen, wenn das Werkzeug so verdeckt oder aus dem Bild wäre
    (Test 30.09.: beim Hieb mit hochgerissenem Arm zeigt die Klinge im Spiel nach hinten hinter den Kopf – Thumbnail-
    Künstler drehen es dann nach vorn). Gedreht wird um die Unterarm-Achse durch die Faust; bewertet werden Sichtbarkeit
    im Bild, ob die Spitze zur Kamera statt vom Betrachter weg zeigt, Gesicht frei und möglichst wenig Drehung."""
    from bpy_extras.object_utils import world_to_camera_view

    if item.get("aufrecht"):
        return item
    arm = figur.teile[f"arm_{seite}"]
    m = arm.matrix_world @ _beuge_matrix(f"arm_{seite}", figur.beugung[f"arm_{seite}"])
    achse = (m.to_3x3() @ Vector((0, 0, -1))).normalized()
    faust = figur.hand(seite)
    basis = item.matrix_world.copy()
    zur_kamera = (kamera.matrix_world.translation - faust).normalized()
    scene = bpy.context.scene

    def wert(grad):
        item.matrix_world = Matrix.Translation(faust) @ Matrix.Rotation(math.radians(grad), 4, achse) @ Matrix.Translation(-faust) @ basis
        bpy.context.view_layer.update()
        ecken = [item.matrix_world @ Vector(c) for c in item.bound_box]
        mitte = sum(ecken, Vector()) / 8
        weg = (mitte - faust)
        vorn = weg.normalized().dot(zur_kamera) if weg.length > 1e-6 else 0.0
        # verdeckt? Strahl von der Kamera zur Werkzeugmitte trifft zuerst die Figur
        tiefe = bpy.context.evaluated_depsgraph_get()
        start = kamera.matrix_world.translation
        treffer, _, _, _, ob, _ = scene.ray_cast(tiefe, start, (mitte - start).normalized(), distance=(mitte - start).length - 0.02)
        verdeckt = 1.0 if treffer and ob is not None and ob != item and ob.name.startswith(figur.wurzel.name.split(".")[0]) else 0.0
        v = world_to_camera_view(scene, kamera, mitte)
        drin = 1.0 if 0.02 < v.x < 0.98 and 0.02 < v.y < 0.98 and v.z > 0 else 0.0
        # Bewertung wie in v0.39 (MoinStudio, 01.10.: „die Werkzeuge gingen doch mal, jetzt sind sie grauenhaft, besonders
        # Axt und Hacke“ – Zusatzregeln für Fläche und Spitze hatten den Werkzeugkopf verdreht)
        # Spitze nach unten wirkt wie falsch gehalten (MoinStudio, 02.10.: beim Hieb drehte das Handgelenk die Klinge um
        # 135° nach unten hinten) – Vorbilder halten Waffen mit der Spitze nach oben
        p = item.get("pixel", PX)
        spitze = (item.matrix_world @ Vector((6 * p, 0, 6 * p))) - (item.matrix_world @ Vector((-6 * p, 0, -6 * p)))
        unten = max(0.0, -spitze.normalized().z) if spitze.length > 1e-6 else 0.0
        return (1 - _im_bild(item, kamera)) * 3 + (1 - drin) * 2 + verdeckt * 2.5 + max(0.0, -vorn) * 1.5 \
            + max(0.0, _ueber_gesicht(item, figur, kamera) - 0.1) * 4 + unten * 1.6 + abs(grad) / 360

    bester = min((0, 45, -45, 90, -90, 135, -135, 180), key=wert)

    item.matrix_world = Matrix.Translation(faust) @ Matrix.Rotation(math.radians(bester), 4, achse) @ Matrix.Translation(-faust) @ basis
    bpy.context.view_layer.update()
    _stiel_drehen(item, faust, kamera)
    if bester:
        print("CS_HANDGELENK", figur.wurzel.name, bester)
    return item


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
    # Werkzeug sichtbar und Gesicht frei (MoinStudio, 30.09.: „Werkzeuge ein großes Problem“ – Test: in 6 von 6 Bildern
    # war das Werkzeug abgeschnitten, hinter dem Kopf oder aus dem Bild gedreht). Mehrere Richtungen probieren und die
    # nehmen, bei der das Werkzeug am vollständigsten im Bild ist, ohne das Gesicht zu verdecken.
    if not getattr(in_die_hand, "_innen", False):
        in_die_hand._innen = True
        try:
            def wert(w2, andersrum):
                _neu_ausrichten(item, figur, seite, kamera, w2, andersrum)
                raus = 1.0 - _im_bild(item, kamera)
                return raus * 4 + max(0.0, _ueber_gesicht(item, figur, kamera) - 0.1) * 5 + abs(w2 - winkel) / 90 + (0.15 if andersrum else 0)
            kandidaten = [(w2, a2) for w2 in (winkel, 60.0, 20.0, 80.0, -15.0) for a2 in (False, True)]
            bester = min(kandidaten, key=lambda k: wert(*k))
            _neu_ausrichten(item, figur, seite, kamera, *bester)
        finally:
            in_die_hand._innen = False
    return item


def _im_bild(item, kamera):
    """Anteil der Bildfläche des Gegenstands (Umriss-Kasten), der im Bild liegt."""
    from bpy_extras.object_utils import world_to_camera_view

    p = [world_to_camera_view(bpy.context.scene, kamera, item.matrix_world @ Vector(c)) for c in item.bound_box]
    if min(e.z for e in p) <= 0:
        return 0.0
    x0, x1, y0, y1 = min(e.x for e in p), max(e.x for e in p), min(e.y for e in p), max(e.y for e in p)
    flaeche = max(1e-6, (x1 - x0) * (y1 - y0))
    drin = max(0.0, min(1.0, x1) - max(0.0, x0)) * max(0.0, min(1.0, y1) - max(0.0, y0))
    return drin / flaeche


def _neu_ausrichten(item, figur, seite, kamera, winkel, andersrum):
    """wie in_die_hand, aber die Klinge zeigt bei `andersrum` zur anderen Bildseite"""
    hand = figur.hand(seite)
    cam = kamera.matrix_world.to_3x3()
    rechts, oben, vor = cam @ Vector((1, 0, 0)), cam @ Vector((0, 1, 0)), cam @ Vector((0, 0, -1))
    nach_rechts = ((hand - figur.kopf_mitte()).dot(rechts) >= 0) != andersrum
    a = math.radians(winkel)
    klinge = (rechts * (math.cos(a) if nach_rechts else -math.cos(a)) + oben * math.sin(a)).normalized()
    y_w = vor.normalized()
    anti = y_w.cross(klinge).normalized()
    x_w, z_w = ((klinge - anti) / math.sqrt(2)).normalized(), ((klinge + anti) / math.sqrt(2)).normalized()
    if x_w.cross(y_w).dot(z_w) < 0:
        anti = -anti
        x_w, z_w = ((klinge - anti) / math.sqrt(2)).normalized(), ((klinge + anti) / math.sqrt(2)).normalized()
    rot = Matrix((x_w, y_w, z_w)).transposed().to_4x4()
    item.matrix_world = Matrix.Translation(hand) @ rot @ Matrix.Translation(-Vector(item["griff"]))
    bpy.context.view_layer.update()


def _ueber_gesicht(item, figur, kamera):
    """Anteil des Kopfes im Bild, den der Gegenstand verdeckt (nur wenn er vor dem Kopf liegt)."""
    from bpy_extras.object_utils import world_to_camera_view

    scene = bpy.context.scene
    k = [world_to_camera_view(scene, kamera, e) for e in figur.kopf_ecken()]
    i = [world_to_camera_view(scene, kamera, item.matrix_world @ Vector(c)) for c in item.bound_box]
    if min(e.z for e in i) > min(e.z for e in k) + 0.3:  # Gegenstand deutlich hinter dem Kopf
        return 0.0
    kx0, kx1, ky0, ky1 = min(e.x for e in k), max(e.x for e in k), min(e.y for e in k), max(e.y for e in k)
    ix0, ix1, iy0, iy1 = min(e.x for e in i), max(e.x for e in i), min(e.y for e in i), max(e.y for e in i)
    schnitt = max(0.0, min(kx1, ix1) - max(kx0, ix0)) * max(0.0, min(ky1, iy1) - max(ky0, iy0))
    return schnitt / max(1e-6, (kx1 - kx0) * (ky1 - ky0))
