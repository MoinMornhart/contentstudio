"""Spiele-Vorlagen: die Person in ein vorhandenes Spiele-Thumbnail setzen, genau an die Stelle der Person.

Ablauf: freistellen.py entfernt die Person aus der Vorlage und füllt die Lücke (hintergrund.png, person.json).
Diese Szene legt den aufgefüllten Hintergrund bildfüllend hinter die Kamera-Ebene, stellt der echte Skin so, dass
der Kopf an der Stelle des Kopfes aus der Vorlage sitzt (gleiche Größe), setzt Pose, Mimik und ein Requisit aus einem
glTF-Modell (z. B. Pistole) in die Hand. Licht: warmes Key-Licht von der Seite, aus der das Licht in der Vorlage kommt.
Den Titel der Vorlage legt vorlage_titel.py danach wieder oben drauf.
"""
import math
import re
import os

import bpy
from mathutils import Matrix, Vector

from . import figur as mfigur
from . import look as mlook
from . import mimik as mmimik
from . import szene as mszene
from .posen import POSEN
from .reaktion import _bildflaeche

BREITE, HOEHE = 1280, 720


def _requisit(pfad, knoten, laenge_m):
    """glTF laden, nur die genannten Knoten behalten, auf `laenge_m` (längste Achse) skalieren. Gibt ein Leer-Objekt
    zurück, dessen lokale Achsen gelten: +X = Lauf/Spitze, +Z = Oberseite, Ursprung = Griff."""
    vorher = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=pfad)
    neu = [o for o in bpy.data.objects if o not in vorher]
    netze = [o for o in neu if o.type == "MESH"]
    bpy.context.view_layer.update()
    if knoten:
        behalten = [o for o in netze if o.name in knoten]
    else:
        # Poly-Haven-Modelle enthalten oft Varianten und Einzelteile nebeneinander (zweite Waffe, Magazin, Patrone):
        # behalten wird das größte Teil und alles, dessen Mitte innerhalb seiner Box liegt (Schlitten, Abzug …)
        def box(o):
            e = [o.matrix_world @ Vector(c) for c in o.bound_box]
            return Vector((min(p.x for p in e), min(p.y for p in e), min(p.z for p in e))), Vector((max(p.x for p in e), max(p.y for p in e), max(p.z for p in e)))

        haupt = max(netze, key=lambda o: (box(o)[1] - box(o)[0]).length)
        h0, h1 = box(haupt)
        behalten = [o for o in netze if not re.search(r"bullet|magazin|ammo|cartridge|casing|shell", o.name.lower()) and all(h0[i] - 1e-4 <= (box(o)[0][i] + box(o)[1][i]) / 2 <= h1[i] + 1e-4 for i in range(3))]
    for o in neu:
        if o not in behalten and o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    ecken = [o.matrix_world @ Vector(c) for o in behalten for c in o.bound_box]
    lo = Vector((min(e.x for e in ecken), min(e.y for e in ecken), min(e.z for e in ecken)))
    hi = Vector((max(e.x for e in ecken), max(e.y for e in ecken), max(e.z for e in ecken)))
    faktor = laenge_m / max(hi - lo)
    leer = bpy.data.objects.new("requisit", None)
    bpy.context.scene.collection.objects.link(leer)
    # Griff: hinteres Viertel, untere Hälfte (Pistolen, Schwerter mit Griff hinten unten)
    griff = Vector((lo.x + 0.22 * (hi.x - lo.x), (lo.y + hi.y) / 2, lo.z + 0.3 * (hi.z - lo.z)))
    for o in behalten:
        mw = o.matrix_world.copy()
        o.parent = leer
        o.matrix_world = Matrix.Scale(faktor, 4) @ Matrix.Translation(-griff) @ mw
    return leer


def _richte(fig, p, seite, punkt, beugen):
    """Sucht heben/drehen des Arms (seite r|l), sodass Schulter → Faust auf den Punkt zeigt (grob, dann fein)."""
    arm = f"arm_{seite}"

    def fehler(heben, drehen):
        q = dict(p)
        q[arm] = {**p.get(arm, {}), "heben": heben, "drehen": drehen, "seitlich": 0, "beugen": beugen}
        mfigur.pose(fig, q)
        schulter = fig.teile[arm].matrix_world.translation
        return (fig.hand(seite) - schulter).normalized().angle((punkt - schulter).normalized())

    beste = min(((fehler(h, d), h, d) for h in range(0, 181, 20) for d in range(-100, 101, 20)))
    _, h0, d0 = beste
    beste = min(((fehler(h, d), h, d) for h in range(h0 - 16, h0 + 17, 4) for d in range(d0 - 16, d0 + 17, 4)))
    p[arm] = {**p.get(arm, {}), "heben": beste[1], "drehen": beste[2], "seitlich": 0, "beugen": beugen}
    mfigur.pose(fig, p)
    return {"heben": beste[1], "drehen": beste[2], "fehler_grad": round(math.degrees(beste[0]), 1)}


def _ziele(fig, p, seite, punkt):
    """Waffenarm leicht gebeugt aufs Ziel; die zweite Hand greift von unten an die Waffenhand (beidhändig)."""
    waffe = _richte(fig, p, seite, punkt, beugen=10)
    andere = "l" if seite == "r" else "r"
    stuetze = _richte(fig, p, andere, fig.hand(seite) - Vector((0, 0, 1.5 * mfigur.PX)), beugen=35)
    return {"waffe": waffe, "stuetze": stuetze}


def _deckung(scene, cam, maske_pfad, raster=(64, 36)):
    """Wie viel der entfernten Person verdecken die Figuren (die Hauptfigur, Freunde, Gegenstand)? Sichtstrahlen durch ein
    Punktraster der Personenmaske; Treffer auf etwas anderes als die Hintergrundfläche zählen als verdeckt. Liegt der
    Wert niedrig, bleibt der aufgefüllte Umriss der alten Person sichtbar („Geist“)."""
    import numpy as np

    img = bpy.data.images.load(maske_pfad, check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    maske = px.reshape(h, w, 4)[::-1, :, 0] > 0.5  # Zeile 0 = oben
    tiefe = bpy.context.evaluated_depsgraph_get()
    von = cam.matrix_world.translation
    rahmen = [cam.matrix_world @ e for e in cam.data.view_frame(scene=scene)]  # oben rechts, unten rechts, unten links, oben links
    punkte = gedeckt = 0
    for j in range(raster[1]):
        for i in range(raster[0]):
            u, v = (i + 0.5) / raster[0], (j + 0.5) / raster[1]
            if not maske[int(v * h), int(u * w)]:
                continue
            punkte += 1
            ziel = rahmen[3] + (rahmen[0] - rahmen[3]) * u + (rahmen[2] - rahmen[3]) * v
            ok, _, _, _, ob, _ = scene.ray_cast(tiefe, von, (ziel - von).normalized())
            if ok and ob is not None and ob.name != "hintergrund":
                gedeckt += 1
    return round(gedeckt / punkte, 3) if punkte else 1.0


def baue_vorlage(spec, ausgabe, bericht=None):
    """spec: {hintergrund, skin, slim, pose, mimik, kopf: [u, v], kopf_anteil, blick, kopf_drehung,
    requisit: {gltf, knoten, hand: r|l, laenge_px}, licht_seite: rechts|links, samples, geraet}"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = BREITE, HOEHE
    s = 1 if spec.get("licht_seite", "rechts") == "rechts" else -1

    fig = mfigur.baue_figur("ich", spec["skin"], slim=spec.get("slim"))
    roh = spec.get("pose", "neutral")
    roh = roh if isinstance(roh, dict) else POSEN.get(roh, POSEN["neutral"])  # Posen-Name oder eigene Winkel
    p = {k: (dict(v) if isinstance(v, dict) else v) for k, v in roh.items()}
    p["blick"] = spec.get("blick", p.get("blick", 0))
    if "kopf_drehung" in spec:
        p.setdefault("kopf", {})["drehen"] = spec["kopf_drehung"]
    if spec.get("ansicht") == "hinten":
        # Person von hinten (Third-Person-Spiele): Figur um 180° drehen; Winkel sind in Bildrichtung angegeben,
        # deshalb seitenverkehrt, damit „drehen positiv“ weiter zur rechten Bildseite zeigt
        p = mszene._spiegeln(p)
        p["blick"] = 180 - p.get("blick", 0)
    mfigur.pose(fig, p)
    if spec.get("mimik"):
        mmimik.setze_mimik(fig, spec["mimik"])

    # Kamera: Kopf an der Stelle und in der Größe des Kopfes aus der Vorlage
    cam_daten = bpy.data.cameras.new("kamera")
    cam_daten.lens = spec.get("linse", 50)
    cam = bpy.data.objects.new("kamera", cam_daten)
    scene.collection.objects.link(cam)
    scene.camera = cam
    kopf = fig.kopf_mitte()
    kopf_h = 8 * mfigur.PX * 1.06
    vfov = 2 * math.atan(cam_daten.sensor_width * HOEHE / BREITE / 2 / cam_daten.lens)
    u, v = spec.get("kopf", [0.5, 0.3])
    from bpy_extras.object_utils import world_to_camera_view

    # Kopf ganz im Bild halten: ragt er hinaus, wird die Figur schrittweise kleiner
    for faktor in (1.0, 0.9, 0.8, 0.7, 0.6):
        abstand = kopf_h / (spec.get("kopf_anteil", 0.4) * faktor) / (2 * math.tan(vfov / 2))
        breite_m = 2 * abstand * math.tan(cam_daten.angle_x / 2)
        hoehe_m = breite_m * HOEHE / BREITE
        cam.location = kopf + Vector((-(u - 0.5) * breite_m, -abstand, -(0.5 - v) * hoehe_m))
        cam.rotation_euler = (math.radians(90), 0, 0)
        bpy.context.view_layer.update()
        ecken = [world_to_camera_view(scene, cam, e) for e in fig.kopf_ecken()]
        if all(0.01 < e.x < 0.99 and 0.02 < e.y < 0.99 for e in ecken):
            break
    kopf_faktor = faktor  # für den Bericht: wie stark die Figur für „Kopf im Bild“ verkleinert wurde
    _bildflaeche(spec["hintergrund"], cam, abstand * 6, helligkeit=spec.get("hintergrund_hell", 1.0))

    info = {"kopf_faktor": kopf_faktor}
    r = spec.get("requisit")
    if spec.get("ziel"):
        # Worauf die Person zielt oder zeigt ([u, v] im Bild): den Arm mit dem Gegenstand genau dorthin richten.
        # Der Zielpunkt liegt auf dem Sehstrahl durch (u, v), deutlich hinter der Figur (im Bild „in der Szene“).
        zu, zv = spec["ziel"]
        strahl = Vector(((zu - 0.5) * breite_m, abstand, (0.5 - zv) * hoehe_m)).normalized()
        # von vorn: Zielpunkt knapp vor der Figur (Arm seitlich und leicht zur Kamera, wie beim Zielen im Bild);
        # von hinten: in der Szene hinter der Figur
        punkt = cam.location + strahl * abstand * (1.7 if spec.get("ansicht") == "hinten" else 0.85)
        info["ziel"] = [zu, zv]
        info["arm"] = _ziele(fig, p, (r or {}).get("hand", "r"), punkt)
    if r and os.path.exists(r["gltf"]):
        seite = r.get("hand", "r")
        teil = fig.teile[f"arm_{seite}"]
        m = teil.matrix_world @ mfigur._beuge_matrix(f"arm_{seite}", fig.beugung[f"arm_{seite}"])
        rot = m.to_3x3().normalized()
        lauf = (rot @ Vector((0, 0, -1))).normalized()  # Unterarm-Richtung = Lauf
        oben = (rot @ Vector((0, -1, 0)))  # Vorderseite des hängenden Arms = oben, wenn er nach vorn zeigt
        oben = (oben - lauf * oben.dot(lauf)).normalized()
        quer = oben.cross(lauf).normalized()
        leer = _requisit(r["gltf"], r.get("knoten"), r.get("laenge_px", 9) * mfigur.PX)
        leer.matrix_world = Matrix.Translation(fig.hand(seite) + lauf * 0.6 * mfigur.PX + oben * 0.8 * mfigur.PX) @ Matrix((lauf, quer, oben)).transposed().to_4x4()
        info["requisit"] = r["gltf"]

    # Freunde: an der Stelle weiterer Personen der Vorlage oder daneben. Die Größe ergibt sich aus der
    # Entfernung: halb so großer Kopf = doppelt so weit weg, auf dem Sehstrahl durch die Kopfmitte im Bild
    haupt_anteil = spec.get("kopf_anteil", 0.4)
    for i, fr in enumerate(spec.get("freunde") or []):
        f = mfigur.baue_figur(f"freund{i}", fr["skin"], slim=fr.get("slim"))
        roh_f = fr.get("pose", "neutral")
        pf = {k: (dict(w) if isinstance(w, dict) else w) for k, w in (roh_f if isinstance(roh_f, dict) else POSEN.get(roh_f, POSEN["neutral"])).items()}
        pf["blick"] = fr.get("blick", pf.get("blick", 0))
        if fr.get("ansicht") == "hinten":
            pf = mszene._spiegeln(pf)
            pf["blick"] = 180 - pf.get("blick", 0)
        mfigur.pose(f, pf)
        fu, fv = fr.get("kopf", [0.5, 0.3])
        tiefe = abstand * haupt_anteil / max(0.05, fr.get("kopf_anteil", haupt_anteil))
        ziel_kopf = cam.location + Vector(((fu - 0.5) * breite_m / abstand, 1, (0.5 - fv) * hoehe_m / abstand)) * tiefe
        f.wurzel.location = ziel_kopf - f.kopf_mitte()
        bpy.context.view_layer.update()
        info.setdefault("freunde", []).append({"kopf": [fu, fv], "tiefe": round(tiefe, 2)})

    # Licht wie in der Vorlage: warmes Key-Licht von der Lichtseite, kühle Füllung, helle Randkante
    for name, ort, energie, groesse, farbe in (
        ("key", Vector((s * 1.4, -1.3, 1.1)), 120, 1.6, (1.0, 0.86, 0.66)),
        ("fuell", Vector((-s * 1.3, -1.2, 0.1)), 22, 2.2, (0.75, 0.82, 1.0)),
        ("rand", Vector((s * 0.9, 1.2, 0.7)), 220, 0.7, (1.0, 0.9, 0.72)),
    ):
        l = bpy.data.lights.new(name, "AREA")
        l.energy, l.size, l.color = energie, groesse, farbe
        o = bpy.data.objects.new(name, l)
        scene.collection.objects.link(o)
        o.location = kopf + ort
        o.rotation_euler = (kopf - o.location).to_track_quat("-Z", "Y").to_euler()
        o.visible_camera = False
    welt = bpy.data.worlds.new("welt")
    scene.world = welt
    welt.use_nodes = True
    welt.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.3, 0.25, 1)
    welt.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5

    scene.render.engine = "CYCLES"
    mlook.gpu_einrichten(scene, spec.get("geraet", "CPU"))
    scene.cycles.samples = spec.get("samples", 64)
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -0.1
    bpy.context.view_layer.update()
    from bpy_extras.object_utils import world_to_camera_view

    ecken = [world_to_camera_view(scene, cam, c) for c in fig.kopf_ecken()]
    info["kopf_box"] = [min(e.x for e in ecken), 1 - max(e.y for e in ecken), max(e.x for e in ecken), 1 - min(e.y for e in ecken)]
    if spec.get("maske") and os.path.exists(spec["maske"]):
        info["deckung"] = _deckung(scene, cam, spec["maske"])
    if spec.get("nur_pruefen"):
        ausgabe = None  # Vorabprüfung: nur messen, nicht rendern
    if ausgabe:
        scene.render.filepath = ausgabe
        bpy.ops.render.render(write_still=True)
    if bericht:
        import json

        with open(bericht, "w", encoding="utf-8") as fh:
            json.dump(info, fh, ensure_ascii=False, indent=1)
    return info
