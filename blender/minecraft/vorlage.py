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
    # Lauf/Klinge = längste Achse des Modells, auf +X drehen (Test Red Dead: das Gewehr von Poly Haven liegt längs Y
    # bzw. Z und ragte dann senkrecht aus der Hand)
    ecken = [o.matrix_world @ Vector(c) for o in behalten for c in o.bound_box]
    ausdehnung = [max(e[i] for e in ecken) - min(e[i] for e in ecken) for i in range(3)]
    achse = ausdehnung.index(max(ausdehnung))
    if achse != 0:
        dreh = Matrix.Rotation(math.radians(-90), 4, "Z") if achse == 1 else Matrix.Rotation(math.radians(90), 4, "Y")
        for o in behalten:
            o.matrix_world = dreh @ o.matrix_world
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


def _haende_hin(scene, cam, fig, p, ziele):
    """Hände genau an die Stellen im Bild, an denen die Person ihre Hände hat [[u, v], …] (Klettern, Greifen, Ausholen –
    Winkel aus der Beschreibung trafen das kaum, Chained Together 01.10.). Zuordnung im Bild: die linke Zielhand bekommt
    der Arm, dessen Schulter im Bild links liegt. Gesucht werden heben, drehen und beugen; bewertet wird der Abstand der
    Faust zur Zielstelle im Bild."""
    from bpy_extras.object_utils import world_to_camera_view

    def uv(punkt):
        q = world_to_camera_view(scene, cam, punkt)
        return q.x, 1 - q.y

    ergebnis = {}
    # Gesichtsfeld im Bild: der Arm darf nicht davor liegen (Chained Together 01.10.: unerreichbares Ziel → Arm quer
    # über dem Gesicht)
    kopf_uv = [uv(e) for e in fig.kopf_ecken()]
    g0, g1 = min(k[0] for k in kopf_uv), max(k[0] for k in kopf_uv)
    h0, h1 = min(k[1] for k in kopf_uv), max(k[1] for k in kopf_uv)
    rand = (g1 - g0) * 0.15

    def im_gesicht(pt):
        return g0 + rand < pt[0] < g1 - rand and h0 + rand < pt[1] < h1 - rand

    schulter_uv = {s_: uv(fig.teile[f"arm_{s_}"].matrix_world.translation) for s_ in ("r", "l")}

    def kreuzt(s_, z):
        """Geht die Linie Schulter → Ziel durchs Gesicht?"""
        a_ = schulter_uv[s_]
        return any(im_gesicht((a_[0] + (z[0] - a_[0]) * t / 10, a_[1] + (z[1] - a_[1]) * t / 10)) for t in range(1, 10))

    def kosten(zuordnung):
        return sum((3.0 if kreuzt(s_, z) else 0.0) + math.hypot(z[0] - schulter_uv[s_][0], z[1] - schulter_uv[s_][1]) for s_, z in zuordnung)

    # Zuordnung Arm ↔ Zielhand: die Variante, bei der kein Arm übers Gesicht greifen muss, sonst die kürzere
    if len(ziele) == 1:
        moeglich = [[("r", ziele[0])], [("l", ziele[0])]]
    else:
        moeglich = [[("r", ziele[0]), ("l", ziele[1])], [("l", ziele[0]), ("r", ziele[1])]]
    zuordnung = min(moeglich, key=kosten)
    schultern, ziele = [s_ for s_, _ in zuordnung], [z for _, z in zuordnung]

    for seite, (zu, zv) in zip(schultern, ziele):
        arm = f"arm_{seite}"

        def fehler(heben, drehen, beugen):
            q = dict(p)
            q[arm] = {**p.get(arm, {}), "heben": heben, "drehen": drehen, "seitlich": 0, "beugen": beugen}
            mfigur.pose(fig, q)
            hand = fig.hand(seite)
            hu, hv = uv(hand)
            ellbogen = fig.teile[arm].matrix_world @ Vector((0, 0, 0))
            mitte = (hand + ellbogen) / 2
            vor_gesicht = 0.0 if im_gesicht((zu, zv)) else sum(1 for pt in (uv(ellbogen), uv(mitte), (hu, hv)) if im_gesicht(pt)) * 0.5
            return math.hypot(hu - zu, hv - zv) + vor_gesicht

        beste = min((fehler(h, d, b), h, d, b) for h in range(0, 181, 15) for d in range(-100, 101, 20) for b in (0, 30, 60, 90, 120))
        _, h0, d0, b0 = beste
        beste = min((fehler(h, d, b), h, d, b) for h in range(h0 - 10, h0 + 11, 5) for d in range(d0 - 12, d0 + 13, 6) for b in (max(0, b0 - 15), b0, min(140, b0 + 15)))
        p[arm] = {**p.get(arm, {}), "heben": beste[1], "drehen": beste[2], "seitlich": 0, "beugen": beste[3]}
        mfigur.pose(fig, p)
        ergebnis[seite] = {"ziel": [zu, zv], "abstand": round(beste[0], 3)}
    print("CS_HAENDE", ergebnis)
    return ergebnis


def _ziele(fig, p, seite, punkt):
    """Waffenarm leicht gebeugt aufs Ziel; die zweite Hand greift von unten an die Waffenhand (beidhändig)."""
    waffe = _richte(fig, p, seite, punkt, beugen=10)
    andere = "l" if seite == "r" else "r"
    stuetze = _richte(fig, p, andere, fig.hand(seite) - Vector((0, 0, 1.5 * mfigur.PX)), beugen=35)
    return {"waffe": waffe, "stuetze": stuetze}


def _gesicht_zur_kamera(p, grenze=50):
    """Von vorn gesehene Figuren: Körper, Rumpf und Kopf zusammen höchstens ~50° gedreht – sonst steht die Figur im
    Profil und man sieht vor allem Haare (007-Vorlage 01.10.: blick 60 plus Kopfdrehung). Gekürzt wird zuerst blick."""
    gesamt = p.get("blick", 0) + (p.get("koerper") or {}).get("drehen", 0) + (p.get("kopf") or {}).get("drehen", 0)
    if abs(gesamt) > grenze:
        p = dict(p)
        p["blick"] = p.get("blick", 0) - (gesamt - math.copysign(grenze, gesamt))
    # Kopf nicht weiter als 20° nach unten nicken (plus Oberkörper vor): sonst sieht man nur Haare und Scheitel
    # (Chained Together 01.10.: Freund mit Kopf „stark nach vorn gekippt“)
    kopf = p.get("kopf") or {}
    vor = (p.get("koerper") or {}).get("vor", 0)
    nicken = kopf.get("nicken", 0)
    if nicken + vor > 20 or nicken < -25:
        p = dict(p)
        p["kopf"] = {**kopf, "nicken": max(-25, min(nicken, 20 - max(0, vor)))}
    return p


def _objekte_von(fig):
    """Alle Objekte einer Figur (Teile samt Kindern: Überzug-Ebene, Augen …)."""
    raus, offen = set(), [fig.wurzel]
    while offen:
        o = offen.pop()
        raus.add(o.name)
        offen.extend(o.children)
    return raus


def _bild_box(scene, cam, fig):
    """Umriss der Figur im Bild [x0, y0, x1, y1] (0–1, oben links = 0,0)."""
    from bpy_extras.object_utils import world_to_camera_view

    ecken = [world_to_camera_view(scene, cam, o.matrix_world @ Vector(c)) for n in _objekte_von(fig) for o in [bpy.data.objects[n]] if o.type == "MESH" for c in o.bound_box]
    if not ecken:
        return None
    return [min(e.x for e in ecken), 1 - max(e.y for e in ecken), max(e.x for e in ecken), 1 - min(e.y for e in ecken)]


def _skaliere_um_kopf(fig, faktor):
    """Figur größer/kleiner machen, der Kopf bleibt an seiner Stelle im Bild."""
    vorher = fig.kopf_mitte().copy()
    fig.wurzel.scale = fig.wurzel.scale * faktor
    bpy.context.view_layer.update()
    fig.wurzel.location += vorher - fig.kopf_mitte()
    bpy.context.view_layer.update()


def _einpassen(scene, cam, fig, person, maske, name):
    """Figur in den Umriss der Person einpassen, die sie ersetzt (MoinStudio, 30.09.: Freund winzig, alte Person als Geist
    sichtbar). Solange sie die Person zu wenig abdeckt oder deutlich kürzer ist als sie, wird sie um den Kopf herum
    größer – höchstens dreimal, zusammen höchstens 1,8-fach. Ist die Person unten angeschnitten, muss die Figur es auch sein."""
    schritte = []
    gesamt = 1.0
    for _ in range(4):
        deck = _deckung(scene, cam, maske, nur=_objekte_von(fig)) if maske and os.path.exists(maske) else 1.0
        box = _bild_box(scene, cam, fig)
        ziel_h = (person.get("box") or [0, 0, 0, 0])
        soll = (ziel_h[3] - ziel_h[1]) * 0.85 if person.get("box") else 0
        ist = (box[3] - box[1]) if box else 1
        unten_fehlt = person.get("unten_angeschnitten") and box and box[3] < 0.97
        faktor = 1.0
        # Maßstab ist die Größe der Person: so hoch wie sie (85 %), höchstens 12 % höher – Minecraft-Figuren mit ihrem
        # großen Kopf wirken sonst riesig (Test 30.09.: Kletterer nach Deckungs-Regel 40 % zu groß). Die Deckung zählt
        # nur, wenn sie wirklich schlecht ist (schräge Posen decken einen menschlichen Umriss nie ganz).
        if soll and ist < soll:
            faktor = max(faktor, soll / max(ist, 0.01))
        if deck < 0.42:
            faktor = max(faktor, math.sqrt(0.5 / max(deck, 0.05)))
        if unten_fehlt:
            faktor = max(faktor, 1.08)
        kopf_soll = person.get("kopf_hoehe")
        # Nur Teil der Person sichtbar (unten angeschnitten, Brustbild, sitzt im Topf, hinter Deckung: unter 4,5
        # Kopfhöhen – ein ganzer Mensch hat ~7): die Körperhöhe taugt nicht als Maßstab, sonst schrumpft die ganze
        # Figur auf Brustbild-Größe (GTA-Collage, Getting Over It, It Takes Two, 01.10.)
        teilweise = person.get("unten_angeschnitten") or (kopf_soll and person.get("hoehe", 1) / kopf_soll < 4.5)
        nach_kopf = bool(teilweise and kopf_soll)
        if soll and not nach_kopf:
            faktor = min(faktor, soll / 0.85 * 1.12 / max(ist, 0.01))
        if nach_kopf:
            # Körperhöhe sagt bei unten angeschnittenen Personen nichts (sie misst auch, was unter dem Bildrand liegt) –
            # Maßstab ist der Kopf, Minecraft-Köpfe dürfen etwas größer sein. In beide Richtungen: Red Dead war 1,5-mal
            # zu groß, die 007-Nahaufnahme deckte nur 20 % (01.10.)
            from bpy_extras.object_utils import world_to_camera_view
            ys = [world_to_camera_view(scene, cam, e).y for e in fig.kopf_ecken()]
            kopf_ist = max(ys) - min(ys)
            if kopf_ist > kopf_soll * 1.45:
                faktor = max(0.6, kopf_soll * 1.25 / kopf_ist)
            elif kopf_ist < kopf_soll * 0.95:
                faktor = max(faktor, kopf_soll * 1.1 / max(kopf_ist, 0.01))
            elif faktor > 1.0:
                faktor = min(faktor, kopf_soll * 1.45 / max(kopf_ist, 0.01))
        faktor = min(faktor, (2.6 if nach_kopf else 1.8) / gesamt, 1.45)
        schritte.append({"deckung": round(deck, 3), "hoehe": round(ist, 3), "soll": round(soll, 3), "faktor": round(faktor, 3)})
        if 0.97 < faktor < 1.03:
            break
        _skaliere_um_kopf(fig, faktor)
        # der Kopf muss ganz im Bild bleiben (Test Red Dead: Kopf oben abgeschnitten) – sonst zurück und aufhören
        from bpy_extras.object_utils import world_to_camera_view
        ecken = [world_to_camera_view(scene, cam, e) for e in fig.kopf_ecken()]
        z_vorher = fig.wurzel.location.z
        # stößt nur der Scheitel oben an, rutscht die Figur nach unten (Person unten angeschnitten: die Figur ragt dann
        # ebenfalls unten hinaus, statt klein zu bleiben – A Way Out 01.10.)
        for _schritt in range(12 if person.get("unten_angeschnitten") else 0):
            if max(e.y for e in ecken) <= 0.985 or min(e.y for e in ecken) < 0.1:
                break
            fig.wurzel.location.z -= 0.25 * mfigur.PX * fig.wurzel.scale.z * 4
            bpy.context.view_layer.update()
            ecken = [world_to_camera_view(scene, cam, e) for e in fig.kopf_ecken()]
        if not all(0.015 < e.x < 0.985 and 0.015 < e.y < 0.985 for e in ecken):  # etwas Luft: Haare kleben sonst am Rand (A Way Out)
            fig.wurzel.location.z = z_vorher
            _skaliere_um_kopf(fig, 1 / faktor)
            schritte[-1]["faktor"] = 1.0
            break
        gesamt *= faktor
    print("CS_EINPASSEN", name, schritte)
    return {"schritte": schritte, "faktor": round(gesamt, 3), "deckung": schritte[-1]["deckung"]}


def _punkt(fig, teil):
    """Befestigungspunkt an der Figur: huefte, hand_r, hand_l, hals, fuss_r, fuss_l."""
    if teil in ("hand_r", "hand_l"):
        return fig.hand(teil[-1])
    if teil == "hals":
        return fig.kopf_mitte() - Vector((0, 0, 5 * mfigur.PX * fig.wurzel.scale.z))
    if teil in ("fuss_r", "fuss_l"):
        bein = fig.teile[f"bein_{teil[-1]}"]
        return bein.matrix_world @ Vector((0, 0, -12 * mfigur.PX))
    return fig.teile["koerper"].matrix_world.translation.copy()  # Hüfte


def _deckung(scene, cam, maske_pfad, raster=(64, 36), nur=None):
    """Wie viel der entfernten Person verdecken die Figuren (Hauptfigur, Freunde, Gegenstand)? Sichtstrahlen durch ein
    Punktraster der Personenmaske; Treffer auf etwas anderes als die Hintergrundfläche zählen als verdeckt. Liegt der
    Wert niedrig, bleibt der aufgefüllte Umriss der alten Person sichtbar („Geist“). `nur`: nur Treffer auf diese
    Objekte zählen (eine Figur je Person)."""
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
            if ok and ob is not None and ob.name != "hintergrund" and (nur is None or ob.name in nur):
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
    if spec.get("ansicht") != "hinten":
        p = _gesicht_zur_kamera(p)
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
    # weit hinten, damit auch kleinere (fernere) Freunde davor stehen
    _bildflaeche(spec["hintergrund"], cam, abstand * 14, helligkeit=spec.get("hintergrund_hell", 1.0))

    info = {"kopf_faktor": kopf_faktor}
    # Die Hauptfigur in den Umriss der Person einpassen, die er ersetzt (eigene Maske je Person aus freistellen.py) – vor dem
    # Gegenstand, damit der in der Hand der fertigen Figur sitzt
    if spec.get("person"):
        info["einpassen"] = _einpassen(scene, cam, fig, spec["person"], spec["person"].get("maske"), "ich")
    if spec.get("haende"):
        info["haende"] = _haende_hin(scene, cam, fig, p, spec["haende"])
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
    elif r and r.get("zielen") and spec.get("ansicht") != "hinten":
        # Schusswaffe ohne Zielpunkt: zielt wie auf Waffen-Thumbnails nach vorn zum Betrachter (Test Red Dead: sonst
        # folgt das Gewehr dem gebeugten Unterarm und ragt senkrecht nach oben). Zielpunkt zwischen Hand und Kamera,
        # leicht zur Bildmitte, damit der Lauf schräg zur Kamera zeigt und nicht genau in die Linse
        seite = r.get("hand", "r")
        # Lauf etwa 50° neben der Linse zur Bildmitte und leicht nach unten: genau zur Kamera verkürzt er sich zu einem
        # Strich vor dem Gesicht (Red Dead 01.10.); so zeigt er seine Länge wie auf Waffen-Covern
        from bpy_extras.object_utils import world_to_camera_view
        hand = fig.hand(seite)
        achsen = cam.matrix_world.to_3x3()
        rechts, hoch = achsen @ Vector((1, 0, 0)), achsen @ Vector((0, 1, 0))
        zur_mitte = 1.0 if world_to_camera_view(scene, cam, hand).x < 0.5 else -1.0
        richtung = ((cam.location - hand).normalized() * 0.85 + rechts * zur_mitte * 0.6 - hoch * 0.25).normalized()
        punkt = hand + richtung * 1.2
        info["ziel"] = "kamera"
        info["arm"] = _ziele(fig, p, seite, punkt)
    if r and os.path.exists(r["gltf"]):
        seite = r.get("hand", "r")
        teil = fig.teile[f"arm_{seite}"]
        m = teil.matrix_world @ mfigur._beuge_matrix(f"arm_{seite}", fig.beugung[f"arm_{seite}"])
        rot = m.to_3x3().normalized()
        lauf = (rot @ Vector((0, 0, -1))).normalized()  # Unterarm-Richtung = Lauf
        oben = (rot @ Vector((0, -1, 0)))  # Vorderseite des hängenden Arms = oben, wenn er nach vorn zeigt
        oben = (oben - lauf * oben.dot(lauf)).normalized()
        quer = oben.cross(lauf).normalized()
        g = fig.wurzel.scale.x  # eingepasste Figur: Gegenstand wächst mit
        leer = _requisit(r["gltf"], r.get("knoten"), r.get("laenge_px", 9) * mfigur.PX * g)
        leer.matrix_world = Matrix.Translation(fig.hand(seite) + (lauf * 0.6 + oben * 0.8) * mfigur.PX * g) @ Matrix((lauf, quer, oben)).transposed().to_4x4()
        info["requisit"] = r["gltf"]

    # Freunde: an der Stelle weiterer Personen der Vorlage oder daneben. Die Größe ergibt sich aus der
    # Entfernung: halb so großer Kopf = doppelt so weit weg, auf dem Sehstrahl durch die Kopfmitte im Bild
    haupt_anteil = spec.get("kopf_anteil", 0.4)
    freund_figuren = []
    for i, fr in enumerate(spec.get("freunde") or []):
        f = mfigur.baue_figur(f"freund{i}", fr["skin"], slim=fr.get("slim"))
        roh_f = fr.get("pose", "neutral")
        pf = {k: (dict(w) if isinstance(w, dict) else w) for k, w in (roh_f if isinstance(roh_f, dict) else POSEN.get(roh_f, POSEN["neutral"])).items()}
        pf["blick"] = fr.get("blick", pf.get("blick", 0))
        if fr.get("ansicht") != "hinten":
            pf = _gesicht_zur_kamera(pf)
        if fr.get("ansicht") == "hinten":
            pf = mszene._spiegeln(pf)
            pf["blick"] = 180 - pf.get("blick", 0)
        mfigur.pose(f, pf)
        fu, fv = fr.get("kopf", [0.5, 0.3])
        tiefe = abstand * haupt_anteil / max(0.05, fr.get("kopf_anteil", haupt_anteil))
        ziel_kopf = cam.location + Vector(((fu - 0.5) * breite_m / abstand, 1, (0.5 - fv) * hoehe_m / abstand)) * tiefe
        f.wurzel.location = ziel_kopf - f.kopf_mitte()
        bpy.context.view_layer.update()
        freund_figuren.append(f)
        eintrag = {"kopf": [fu, fv], "tiefe": round(tiefe, 2)}
        if fr.get("person"):
            eintrag["einpassen"] = _einpassen(scene, cam, f, fr["person"], fr["person"].get("maske"), f"freund{i}")
        if fr.get("haende"):
            eintrag["haende"] = _haende_hin(scene, cam, f, pf, fr["haende"])
        info.setdefault("freunde", []).append(eintrag)

    # Verbindungen zwischen den Figuren wie in der Vorlage (Kette bei Chained Together, Seil, Leine)
    alle = {"ich": fig, **{f"freund{i}": f for i, f in enumerate(freund_figuren)}}
    for n, vb in enumerate(spec.get("verbindungen") or []):
        a, b = alle.get(vb.get("von")), alle.get(vb.get("zu"))
        art = vb.get("art", "kette")
        if not a or not b or art not in mszene.VERBINDUNGEN:
            print("CS_WARNUNG Verbindung übersprungen", vb)
            continue
        pa, pb = _punkt(a, vb.get("von_punkt", "huefte")), _punkt(b, vb.get("zu_punkt", "huefte"))
        mszene._verbindung(pa, pb, art, spec.get("texturen", ""), f"verbindung{n}.{art}")
        info.setdefault("verbindungen", []).append(vb)

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
