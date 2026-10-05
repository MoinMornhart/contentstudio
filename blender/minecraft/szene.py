"""Szenen-Bauer (ROADMAP 4): baut aus einer Szenenbeschreibung (JSON) das Bild nach dem Stilbuch.

Beschreibung (alle Längen in Blöcken, Winkel in Grad):
{
  "welt": {"art": "wiese" | "klippe" | "meeresklippe" | "schlucht" | "dorf" | "hoehle" | "nether" (mit "biom": oede | karmesin | wirr | seelensand | basalt), "kante": 0, "tiefe": 20, "seed": 7,
           "grund": "lava" | "water" | null},
  "himmel": "tag" | "abend" | "nacht",
  "figuren": [{"id": "ich", "skin": "<pfad>", "slim": null, "pose": "zeigen", "posen_korrektur": {…},
               "position": [x, y], "blick": 0, "item": {"name": "diamond_sword", "hand": "l", "winkel": 40}}],
  "mobs": [{"art": "zombie", "position": [x, y], "hoehe": 0, "blick": 0 | "<figur-id>", "groesse": 1, "pose": "stand" | "angriff"}],
  "kamera": {"hoehe": 10 (optional, Grad), "linse": 24 (optional), "modus": "nah", "seite": "links", "thema": [x, y, z], "ueber_abgrund": false},
  "render": {"breite": 1280, "hoehe": 720, "samples": 48, "blende": 4}
}
Die erste Figur ist die Hauptfigur (Hauptfigur); die Kamera rahmt ihren Kopf.
"""
import json
import math
import os

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix as mathutils_Matrix, Vector

from . import figur as mfigur
from . import himmel as mhimmel
from . import items as mitems
from . import kamera as mkamera
from . import look as mlook
from . import mimik as mmimik
from . import mobs as mmobs
from . import welt as mwelt
from . import bloecke
from .bloecke import BLOCK
from .posen import POSEN


def _mische(basis, korrektur):
    neu = {k: (dict(v) if isinstance(v, dict) else v) for k, v in basis.items()}
    for k, v in (korrektur or {}).items():
        if isinstance(v, dict):
            neu.setdefault(k, {}).update(v)
        else:
            neu[k] = v
    return neu


def _spiegeln(p):
    """Pose seitenverkehrt: für Figuren, die nach −X schauen (Gegner rechts im Bild). Links und rechts tauschen,
    Drehungen und seitliche Neigungen umkehren – so bleibt die Waffe in der kameranahen Hand."""
    neu = {}
    for k, v in p.items():
        ziel = k.replace("_r", "_X").replace("_l", "_r").replace("_X", "_l") if k[-2:] in ("_r", "_l") else k
        if isinstance(v, dict):
            v = {n: (-w if n in ("drehen", "neigen") else w) for n, w in v.items()}
        elif k == "kippen_seite":
            v = -v
        neu[ziel] = v
    return neu


def _welt(w, texturen, himmel="tag"):
    art = w.get("art", "wiese")
    bloecke.DUNST.update(farbe=mhimmel.VARIANTEN.get(himmel, {}).get("dunst", (0.42, 0.66, 1.0)), halbwert=160.0)
    seed = w.get("seed", 7)
    aend = w.get("bloecke")  # frei gesetzte oder weggenommene Blöcke (Wand, Grube, Säulen …)
    if art == "wiese":
        return mwelt.baue_klippe(texturen, aend, seed=seed, kante=200, tiefe=6, gegenseite=True)
    if art == "meeresklippe":
        return mwelt.baue_klippe(texturen, aend, seed=seed, kante=w.get("kante", 0), tiefe=w.get("tiefe", 20), gegenseite=False)
    if art in ("klippe", "schlucht"):
        return mwelt.baue_klippe(texturen, aend, seed=seed, kante=w.get("kante", 0), tiefe=w.get("tiefe", 20), gegenseite=True)
    if art == "dorf":
        return mwelt.baue_dorf(texturen, aend, seed=seed, haeuser=w.get("haeuser", 5))
    if art == "end":
        bloecke.DUNST.update(farbe=(0.06, 0.03, 0.09), halbwert=120.0)
        return mwelt.baue_endwelt(texturen, aend, seed=seed)
    if art in ("lavameer", "meer"):
        if art == "lavameer":
            bloecke.DUNST.update(farbe=(0.9, 0.35, 0.08), halbwert=90.0)
        return mwelt.baue_meerwelt(texturen, "lava" if art == "lavameer" else "water", aend)
    if art == "nether":
        # Nether nach den Biom-Daten des Spiels: offene Riesenhöhle, Lavameer, heller Dunst in Biomfarbe
        b = mwelt.NETHER_BIOME[mwelt.nether_biom(w.get("biom"))]
        bloecke.DUNST.update(farbe=b["dunst"], halbwert=75.0)
        return mwelt.baue_nether(texturen, aend, biom=w.get("biom"), seed=seed)
    if art in mwelt.RAUM_ARTEN:
        # geschlossener Raum: dunkler bzw. roter Dunst statt Himmelsblau
        bloecke.DUNST.update({"hoehle": {"farbe": (0.015, 0.02, 0.03), "halbwert": 70.0},
                              "nether": {"farbe": (0.30, 0.05, 0.02), "halbwert": 45.0}}[art])
        return mwelt.baue_raum(texturen, art, aend, seed=seed, grund=w.get("grund", "lava"))
    raise ValueError(f"Unbekannte Welt-Art „{art}“ (bekannt: wiese, klippe, meeresklippe, schlucht, dorf, lavameer, meer, end, "
                     f"{', '.join(mwelt.RAUM_ARTEN)})")


def _objekte(liste, texturen):
    """Frei platzierte Einzelblöcke (fliegendes TNT, herumliegende Blöcke): {"block": "tnt", "position": [x, y, z],
    "drehung": [rx, ry, rz], "groesse": 1, "schwebt": false}. Position in Blöcken (Mitte des Blocks), Drehung in Grad.
    Ohne „schwebt“ und ohne Drehung liegt der Block auf dem Boden darunter (Test 02.10.: Seelenlaternen hingen in der
    Luft über dem Kopf)."""
    import math as _m
    tex = bloecke.Texturen(texturen)
    scene = bpy.context.scene
    for i, o in enumerate(liste or []):
        halb = 0.5 * BLOCK
        x, y, z = o.get("position", (3, 3, 2))
        if not o.get("schwebt") and not any(o.get("drehung") or ()):
            bpy.context.view_layer.update()
            treffer, ort, normale, *_ = scene.ray_cast(bpy.context.evaluated_depsgraph_get(), Vector((x * BLOCK, y * BLOCK, z * BLOCK - halb + 0.01)), Vector((0, 0, -1)))
            boden = ort.z if treffer and normale.z > 0.5 else None
            if boden is not None and z * BLOCK - halb > boden + 0.05:
                print("CS_OBJEKT_GEERDET", o["block"], round(z, 2), "->", round(boden / BLOCK + 0.5, 2))
                z = boden / BLOCK + 0.5
        ob = bloecke.baue({(0, 0, 1): o["block"]}, tex, f"objekt{i}", versatz=(-halb, -halb, -halb))
        ob.location = (x * BLOCK, y * BLOCK, z * BLOCK)
        ob.rotation_euler = [_m.radians(g) for g in o.get("drehung", (0, 0, 0))]
        s = o.get("groesse", 1.0)
        ob.scale = (s, s, s)


def _randlicht(scene, figur, cam, seite="links", staerke=650, farbe=(1.0, 1.0, 1.0)):
    """Randlicht hinter der Figur, von der Kamera aus gesehen, leicht zur Außenseite versetzt
    (Stilbuch 6: helle Kante an Kopf und Schulter, die die Figur vom Hintergrund löst)."""
    rand = bpy.data.lights.new("rand", "AREA")
    rand.energy = staerke
    rand.size = 1.0
    rand.color = farbe
    ro = bpy.data.objects.new("rand", rand)
    scene.collection.objects.link(ro)
    ro.visible_camera = False
    kopf = figur.kopf_mitte()
    von_kamera = kopf - cam.matrix_world.translation
    von_kamera.z = 0
    von_kamera.normalize()
    rechts = Vector((von_kamera.y, -von_kamera.x, 0))  # Bild-rechts aus Kamerasicht
    aussen = -rechts if seite == "links" else rechts
    ro.location = kopf + von_kamera * 2.2 + aussen * 1.3 + Vector((0, 0, 1.2))
    ro.rotation_euler = (kopf - ro.location).to_track_quat("-Z", "Y").to_euler()


def _pflanzen_vor_kamera_weg(cam, ziel, abstand=0.8):
    """Gras und Blumen direkt vor der Linse entfernen: unscharf werden sie zu Flecken über dem Gesicht."""
    ob = bpy.data.objects.get("pflanzen")
    if not ob:
        return
    import bmesh
    von = cam.matrix_world.translation
    grenze = (ziel - von).length * abstand
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    weg = [f for f in bm.faces if (ob.matrix_world @ f.calc_center_median() - von).length < grenze]
    bmesh.ops.delete(bm, geom=weg, context="FACES")
    bm.to_mesh(ob.data)
    bm.free()


def _markierungen(scene, liste):
    """Leuchtende Rahmen auf dem Boden (BastiGHG 05/09: rotes Quadrat um die Challenge-Zone): [{"von": [x, y],
    "bis": [x, y], "farbe": "rot"}] in Blöcken. Der Rahmen folgt dem Gelände (je Randstück auf der Bodenhöhe)."""
    farben = {"rot": (1.0, 0.05, 0.05), "gelb": (1.0, 0.8, 0.0), "gruen": (0.1, 1.0, 0.2), "blau": (0.1, 0.4, 1.0), "weiss": (1, 1, 1)}
    for n, m in enumerate(liste or []):
        (x0, y0), (x1, y1) = m.get("von", (-3, -3)), m.get("bis", (3, 3))
        x0, x1 = sorted((float(x0), float(x1)))
        y0, y1 = sorted((float(y0), float(y1)))
        mat = bpy.data.materials.new(f"markierung{n}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        farbe = farben.get(m.get("farbe", "rot"), farben["rot"])
        bsdf.inputs["Base Color"].default_value = (*farbe, 1)
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*farbe, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 2.5
        breite = 0.28 * BLOCK
        schritt = 0.5
        stuecke = []
        for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            laenge = max(abs(bx - ax), abs(by - ay))
            for i in range(max(1, int(laenge / schritt))):
                t0, t1 = i / max(1, int(laenge / schritt)), (i + 1) / max(1, int(laenge / schritt))
                px, py = ax + (bx - ax) * (t0 + t1) / 2, ay + (by - ay) * (t0 + t1) / 2
                z = _boden_hoehe(scene, px * BLOCK, py * BLOCK)
                stuecke.append(((px * BLOCK, py * BLOCK, z + 0.02 * BLOCK), abs(bx - ax) * (t1 - t0) * BLOCK + breite, abs(by - ay) * (t1 - t0) * BLOCK + breite))
        import bmesh
        bm = bmesh.new()
        for (cx, cy, cz), sx, sy in stuecke:
            erg = bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=(sx, sy, 0.04 * BLOCK), verts=erg["verts"])
            bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=erg["verts"])
        me = bpy.data.meshes.new(f"markierung{n}")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(f"markierung{n}", me)
        scene.collection.objects.link(ob)


def _boden_hoehe(scene, x, y, von=60.0, platz=2.0, nah_an=0.0):
    """Bodenfläche unter (x, y) in Metern: nach oben zeigende Fläche mit mindestens `platz` Metern Luft darüber
    (in Höhlen also der Boden, nicht das Dach). Bei mehreren die, die `nah_an` am nächsten liegt."""
    bpy.context.view_layer.update()
    tiefe = bpy.context.evaluated_depsgraph_get()
    treffer_liste, z = [], von
    for _ in range(40):
        treffer, ort, normale, *_ = scene.ray_cast(tiefe, Vector((x, y, z)), Vector((0, 0, -1)))
        if not treffer:
            break
        treffer_liste.append((ort.z, normale.z))
        z = ort.z - 1e-3
    boeden = []
    for i, (hz, nz) in enumerate(treffer_liste):
        oben_frei = hz + platz <= (treffer_liste[i - 1][0] if i > 0 else von) + 1e-6
        if nz > 0.5 and oben_frei and (i == 0 or treffer_liste[i - 1][1] < -0.5):
            boeden.append(hz)
    if not boeden:
        return nah_an
    naechster = min(boeden, key=lambda b: abs(b - nah_an))
    # über einem Abgrund (kein Boden in Reichweite): auf Höhe der Kante bleiben statt in die Tiefe zu fallen
    return naechster if abs(naechster - nah_an) < 3.0 else nah_an


def _auf_den_boden(scene, fig, hoehe=None):
    """Füße auf den Boden (Ausfallschritt und Kippen heben sie sonst an); `hoehe` in Blöcken = in der Luft."""
    bpy.context.view_layer.update()
    tief = min((o.matrix_world @ Vector(c)).z for o in fig.teile.values() for c in o.bound_box)
    w = fig.wurzel.location
    for o in fig.teile.values():  # die eigene Figur nicht als Boden treffen
        o.hide_viewport = True
    boden = _boden_hoehe(scene, w.x, w.y, nah_an=w.z)
    for o in fig.teile.values():
        o.hide_viewport = False
    ziel = boden + (hoehe or 0) * BLOCK
    fig.wurzel.location.z += ziel - tief
    bpy.context.view_layer.update()


def _mob_auf_die_buehne(scene, haupt, mobs, thema, getragen=frozenset()):
    """Wie bei BastiGHG, GommeHD und Paluten: Der Mob, um den es geht, steht groß und nah neben der Hauptfigur, nicht klein im
    Hintergrund (Vergleich mit 56 Vorbildern, 30.09.). Ein Thema-Mob am Boden, der weiter als 4,5 Blöcke von die Hauptfigur weg
    steht, rückt auf 3,5 Blöcke heran; kleine Mobs (Huhn, Frosch, Schleim) werden auf mindestens 1,3 Blöcke Höhe vergrößert.
    Schwebende Mobs, Riesen und Mobs, auf denen jemand sitzt, bleiben, wie sie sind."""
    for i, (m, mob) in enumerate(mobs):
        if not (thema == f"mob:{i}" or thema == m["art"]) or f"mob:{i}" in getragen or m["art"] in getragen:
            continue
        bpy.context.view_layer.update()
        punkte = [o.matrix_world @ Vector(c) for o in mob.teile.values() for c in o.bound_box]
        if not punkte:
            continue
        hoehe = max(p.z for p in punkte) - min(p.z for p in punkte)
        schwebt = m.get("hoehe", 0) > 1.5 or (len(m.get("position", ())) > 2 and m["position"][2] > 1.5)
        if schwebt or hoehe > 3.0 * BLOCK:
            continue
        if hoehe < 1.3 * BLOCK:
            f = min(2.5, 1.3 * BLOCK / max(hoehe, 1e-3))
            mob.wurzel.scale = tuple(s * f for s in mob.wurzel.scale)
            print("CS_BUEHNE", m["art"], "vergrößert", round(f, 2))
        weg = mob.wurzel.location - haupt.wurzel.location
        weg.z = 0
        # wie bei den Vorbildern fast auf gleicher Tiefe neben der Hauptfigur: Abstand nach hinten (y) stauchen, höchstens 2,8 Blöcke
        flach = Vector((weg.x, weg.y * 0.45, 0))
        if flach.length < 0.3 * BLOCK:  # genau hinter der Hauptfigur: nach rechts (Gegner-Seite)
            flach = Vector((1.0, 0.3, 0)) * BLOCK
        if weg.length > 2.8 * BLOCK or abs(weg.y) > 1.5 * BLOCK:
            neu = haupt.wurzel.location + flach.normalized() * min(2.8 * BLOCK, max(2.2 * BLOCK, flach.length))
            for o in mob.teile.values():  # den Mob selbst nicht als Boden treffen
                o.hide_viewport = True
            boden = _boden_hoehe(scene, neu.x, neu.y, nah_an=mob.wurzel.location.z)
            for o in mob.teile.values():
                o.hide_viewport = False
            mob.wurzel.location = (neu.x, neu.y, boden)
            print("CS_BUEHNE", m["art"], "herangeholt von", round(weg.length / BLOCK, 1), "neben der Hauptfigur")
    bpy.context.view_layer.update()


def _gegner_auf_die_buehne(scene, haupt, figuren, thema):
    """Kampf/Duell (MoinStudio, 30.09.: „es soll aufhören, mich immer in den Vordergrund zu packen bei einem Kampf“): Der Gegner
    steht wie bei GommeHD-Duellen auf gleicher Tiefe neben der Hauptfigur, beide gleich groß im Bild – nicht klein hinten.
    Steht die Thema-Figur mehr als 1,2 Blöcke weiter hinten oder mehr als 3,6 Blöcke entfernt, rückt sie heran."""
    for f, fig in figuren:
        if fig is haupt or f.get("auf") or not (thema == f["id"] or thema in ("gegner", None) and f.get("id") != "ich"):
            continue
        weg = fig.wurzel.location - haupt.wurzel.location
        weg.z = 0
        if abs(weg.y) <= 1.2 * BLOCK and weg.length <= 3.6 * BLOCK:
            continue
        seite = 1 if weg.x >= 0 else -1
        neu = haupt.wurzel.location + Vector((seite * 2.8 * BLOCK, max(-0.6, min(0.6, weg.y / BLOCK * 0.2)) * BLOCK, 0))
        for o in _alle_objekte(fig):
            o.hide_viewport = True
        boden = _boden_hoehe(scene, neu.x, neu.y, nah_an=fig.wurzel.location.z)
        for o in _alle_objekte(fig):
            o.hide_viewport = False
        fig.wurzel.location = (neu.x, neu.y, boden + (f.get("hoehe") or 0) * BLOCK)
        print("CS_BUEHNE Gegner", f["id"], "herangeholt von", round(weg.length / BLOCK, 1), "neben der Hauptfigur")
        break
    bpy.context.view_layer.update()


def _gegner_zur_kamera(fig, haupt, cam):
    """Die Thema-Figur (Gegner, Freund) nach der Kamerawahl so drehen, dass sie zwischen Hauptfigur und Kamera schaut:
    Gesicht im Dreiviertelprofil sichtbar, trotzdem der Hauptfigur zugewandt. Die Kamera kann nicht beide Gesichter frei wählen –
    stand sie vor der Hauptfigur, zeigte sie den Gegner im Profil von der Haarseite (Test 01.10.: „ich gegen meinen Freund“)."""
    if fig is None or getattr(fig, "auf_etwas", False):
        return
    kopf = fig.kopf_mitte()
    zu_cam = cam.matrix_world.translation - kopf
    zu_haupt = haupt.kopf_mitte() - kopf
    zu_cam.z = zu_haupt.z = 0
    if zu_cam.length < 1e-3 or zu_haupt.length < 1e-3:
        return
    zu_cam.normalize()
    zu_haupt.normalize()
    jetzt = fig.gesicht_richtung()
    jetzt.z = 0
    if jetzt.length < 1e-3 or jetzt.normalized().dot(zu_cam) >= 0.55:
        return
    jetzt.normalize()
    wunsch = (zu_cam * 0.6 + zu_haupt * 0.4).normalized()
    delta = math.atan2(jetzt.x * wunsch.y - jetzt.y * wunsch.x, jetzt.dot(wunsch))
    fig.wurzel.rotation_euler.z += delta
    bpy.context.view_layer.update()
    print("CS_BUEHNE Gegner zur Kamera gedreht um", round(math.degrees(delta)), "Grad")


def _alle_objekte(fig):
    raus, offen = [], [fig.wurzel]
    while offen:
        o = offen.pop()
        raus.append(o)
        offen.extend(o.children)
    return raus


def _riesen_zurueck(haupt, mobs, thema, getragen=frozenset()):
    """Riesige Mobs (Ghast, 10-fache Mobs) passen nur ins Bild, wenn sie weit genug hinten stehen – wie die
    Riesenspinne bei Paluten. Ist ein Mob das Kamera-Thema und höher als 60 % seines Abstands zur Hauptfigur, wird er
    auf der Linie Figur → Mob nach hinten geschoben, bis es passt."""
    for i, (m, mob) in enumerate(mobs):
        if not (thema == f"mob:{i}" or thema == m["art"]) or f"mob:{i}" in getragen or m["art"] in getragen:
            continue
        bpy.context.view_layer.update()
        punkte = [o.matrix_world @ Vector(c) for o in mob.teile.values() for c in o.bound_box]
        hoehe = max(p.z for p in punkte) - min(0.0, min(p.z for p in punkte))
        kopf = haupt.kopf_mitte()
        weg = mob.wurzel.location - kopf
        weg.z = 0
        abstand = weg.length
        noetig = hoehe / 0.6
        if abstand < 1e-3 or abstand >= noetig:
            continue
        verschiebung = weg.normalized() * (noetig - abstand)
        mob.wurzel.location += verschiebung
        print("CS_RIESE", m["art"], "um", round(verschiebung.length, 1), "m nach hinten")
    bpy.context.view_layer.update()


def _im_bild(box):
    """Anteil einer Bildbox (x0, y0, x1, y1), der im Bild liegt."""
    x0, y0, x1, y1 = box
    flaeche = max(1e-6, (x1 - x0) * (y1 - y0))
    sichtbar = max(0.0, min(1, x1) - max(0, x0)) * max(0.0, min(1, y1) - max(0, y0))
    return sichtbar / flaeche


def _bildpunkt(scene, cam, p):
    v = world_to_camera_view(scene, cam, p)
    return [round(v.x, 3), round(1 - v.y, 3)]  # Bildkoordinaten: 0,0 oben links


def _arm_blockiert(arm):
    """Arm an Kopf oder Brust: Hand am Kopf (Kopfkratzen, Panik) oder verschränkt (Held, genervt, nachdenken). Ein
    Werkzeug in dieser Hand steckt im Kopf oder quer vor der Brust."""
    arm = arm or {}
    am_kopf = arm.get("heben", 0) >= 100 and arm.get("beugen", 0) >= 90
    verschraenkt = arm.get("seitlich", 0) <= -15 and arm.get("heben", 0) + arm.get("beugen", 0) >= 80
    return am_kopf or verschraenkt


def _werkzeughand(p, item):
    """Werkzeug nie in einer Hand, die die Pose an Kopf oder Brust legt (Test 01.10.: Schaufel hinter dem Kopf beim
    Kopfkratzen, Axt am Gesicht in der Heldenpose). Ist die andere Hand frei, wandert das Werkzeug dorthin, sonst hält
    der Werkzeugarm es locker vor dem Körper."""
    seite = item.get("hand", "l")
    arm, anderer = f"arm_{seite}", "arm_" + ("r" if seite == "l" else "l")
    if not _arm_blockiert(p.get(arm)):
        return p
    if not _arm_blockiert(p.get(anderer)):
        item["hand"] = "r" if seite == "l" else "l"
        return p
    p = dict(p)
    p[arm] = {"heben": 35, "seitlich": 12, "drehen": 0, "beugen": 45}
    return p


def _items_anhaengen(figuren, texturen, cam, k):
    gehalten = {}
    for f, fig in figuren:
        it = f.get("item")
        if it:
            # Kampf: Waffen nah an der Kamera übergroß wie bei GommeHD (1,3–1,6-fach)
            # bei weiten Einstellungen wirkt ein maßstabsgetreues Werkzeug winzig (Test 30.09.: Goldaxt ein paar Pixel) –
            # die Vorbilder übertreiben es dann wie im Kampf
            # Haltung und Größe wie im Spiel (display.thirdperson aus der Modellkette), nur bei weiten Einstellungen etwas
            # übertrieben wie bei den Vorbildern (sonst ist das Werkzeug dort ein paar Pixel groß)
            # Werkzeuggrößen wie in v0.39 (nah und halbnah wie im Spiel, weite Einstellungen größer);
            # flache Items (Fackel, Brot: im Spiel 0,55) wären sonst kaum zu sehen und bekommen noch 1,3 dazu
            groesse = it.get("groesse", {"kampf": 1.25, "ganz": 1.4, "tiefe": 1.4, "abgrund": 1.4, "klippe_wand": 1.3, "mob": 1.15}.get(k.get("modus"), 1.0))
            seite = it.get("hand", "l")
            name = it["name"]
            # Bogen beim Zielen: gespannt (Spieltextur bow_pulling_2), aufrecht mit der Fläche zur Kamera und in der Mitte
            # gegriffen wie bei den Vorbildern – in Spielhaltung sah man ihn nur von der Kante (Nether-Test 02.10.)
            zielt = name == "bow" and "bogen" in str(f.get("pose", ""))
            if zielt:
                try:
                    ob = mitems.baue_item("bow_pulling_2", texturen, pixel=mfigur.PX)
                except Exception:
                    ob = mitems.baue_item(name, texturen, pixel=mfigur.PX)
            else:
                ob = mitems.baue_item(name, texturen, pixel=mfigur.PX)
            anzeige = mitems.haltung(name, texturen, seite)
            flach = anzeige["scale"][0] < 0.7  # „generated“: Fackel, Brot, Blumen …
            if "groesse" not in it and flach:
                groesse *= 1.3
            mitems.mc_halten(ob, fig, seite, ob["pixel"], anzeige, groesse)
            if cam is not None and zielt:
                mitems.aufrichten(ob, fig, seite, cam, griff=0.5)
                # vors Gesicht geschoben? zur Seite der Hand hin vom Kopf weg, bis das Gesicht frei ist (Test: 60 %)
                rechts = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
                weg = rechts if (fig.hand(seite) - fig.kopf_mitte()).dot(rechts) >= 0 else -rechts
                for _ in range(8):
                    if _gesicht_sichtbar(bpy.context.scene, cam, fig) >= 0.8:
                        break
                    ob.matrix_world = mathutils_Matrix.Translation(weg * 1.5 * mfigur.PX) @ ob.matrix_world
                    bpy.context.view_layer.update()
            elif cam is not None and flach:
                mitems.aufrichten(ob, fig, seite, cam)
            elif cam is not None:
                mitems.handgelenk_drehen(ob, fig, seite, cam)
            gehalten[f["id"]] = ob
    bpy.context.view_layer.update()
    return gehalten


def _gesicht_sichtbar(scene, cam, fig, raster=5):
    """Anteil der Gesichtsfläche, den die Kamera wirklich sieht: Strahlen auf ein Punktraster der Vorderseite des
    Kopfes. Ein Punkt zählt, wenn das Gesicht zur Kamera zeigt und der Strahl zuerst den eigenen Kopf trifft."""
    tiefe = bpy.context.evaluated_depsgraph_get()
    kopf = fig.teile["kopf"]
    mw = kopf.matrix_world
    von = cam.matrix_world.translation
    normale = (mw.to_3x3() @ Vector((0, -1, 0))).normalized()
    treffer = 0
    for a in range(raster):
        for b in range(raster):
            x = (-3.2 + 6.4 * a / (raster - 1)) * mfigur.PX
            z = (-3.2 + 6.4 * b / (raster - 1)) * mfigur.PX
            p = mw @ Vector((x, -4.05 * mfigur.PX, z))
            zur_kamera = von - p
            if normale.dot(zur_kamera) <= 0:
                continue
            richtung = (p - von)
            abstand = richtung.length
            ok, _, _, _, ob, _ = scene.ray_cast(tiefe, von, richtung.normalized(), distance=abstand + 0.05)
            if ok and ob is not None and ob.name.startswith(f"{fig.name}.kopf"):
                treffer += 1
    return treffer / (raster * raster)


def _mob_sichtbar(scene, cam, mob):
    """Anteil der Mob-Punkte im Bild, die die Kamera wirklich sieht (Strahl trifft zuerst den Mob selbst)."""
    tiefe = bpy.context.evaluated_depsgraph_get()
    von = cam.matrix_world.translation
    vorsilbe = mob.wurzel.name[: -len(".wurzel")] + "."
    im_bild = treffer = 0
    for o in mob.teile.values():
        ecken = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mitte = sum(ecken, Vector()) / 8
        for p in [mitte] + [mitte + (e - mitte) * 0.7 for e in ecken]:
            v = world_to_camera_view(scene, cam, p)
            if v.z <= 0 or not (0 <= v.x <= 1 and 0 <= v.y <= 1):
                continue
            im_bild += 1
            richtung = p - von
            ok, _, _, _, ob, _ = scene.ray_cast(tiefe, von, richtung.normalized(), distance=richtung.length + 0.05)
            if ok and ob is not None and ob.name.startswith(vorsilbe):
                treffer += 1
    return treffer / im_bild if im_bild else 1.0  # ganz außerhalb: das meldet die Prüfung „kaum sichtbar“


def _sicht_versperrt(scene, cam, haupt, raster=12):
    """Anteil des Bildes, in dem Welt oder Objekte näher an der Kamera sind als 70 % des Abstands zur Hauptfigur
    (Figuren, Items und Mobs zählen nicht: die gehören ins Bild)."""
    tiefe = bpy.context.evaluated_depsgraph_get()
    von = cam.matrix_world.translation
    grenze = (haupt.kopf_mitte() - von).length * 0.7
    frame = [cam.matrix_world @ v for v in cam.data.view_frame(scene=scene)]  # oben rechts, unten rechts, unten links, oben links
    gesperrt = 0
    for a in range(raster):
        for b in range(raster):
            u, v = (a + 0.5) / raster, (b + 0.5) / raster
            oben = frame[3].lerp(frame[0], u)
            unten = frame[2].lerp(frame[1], u)
            p = oben.lerp(unten, v)
            ok, ort, _, _, ob, _ = scene.ray_cast(tiefe, von, (p - von).normalized(), distance=grenze)
            if ok and ob is not None and ob.name.split(".")[0] in ("klippe", "dorf", "meerwelt", "endwelt", "hoehle", "nether") or (ok and ob is not None and ob.name.startswith("objekt")):
                gesperrt += 1
    return gesperrt / (raster * raster)


def _messen(scene, cam, szene, figuren, mobs, gehalten, fehler):
    """Bildbericht mit Warnungen für die Selbstprüfung: Köpfe, Items, Mobs im Bild, keine verdeckten Gesichter."""
    info = {"kamera_abweichung": round(fehler, 4), "linse": cam.data.lens, "figuren": {}, "items": {}}
    bpy.context.view_layer.update()
    for f, fig in figuren:
        o, u = fig.kopf_punkte()
        ecken = [_bildpunkt(scene, cam, p) for p in fig.kopf_ecken()]
        koerper = [_bildpunkt(scene, cam, ob.matrix_world @ Vector(c)) for ob in fig.teile.values() for c in ob.bound_box]
        info["figuren"][f["id"]] = {"kopf": _bildpunkt(scene, cam, (o + u) / 2), "kopf_oben": _bildpunkt(scene, cam, o), "kopf_unten": _bildpunkt(scene, cam, u),
                                    "kopf_box": [min(e[0] for e in ecken), min(e[1] for e in ecken), max(e[0] for e in ecken), max(e[1] for e in ecken)],
                                    # ganze Figur (für den Textsatz: Text nie über dem Skin)
                                    "box": [min(e[0] for e in koerper), min(e[1] for e in koerper), max(e[0] for e in koerper), max(e[1] for e in koerper)]}
    info["mobs"] = []
    for m, mob in mobs:
        pts = [o.matrix_world @ Vector(c) for o in mob.teile.values() for c in o.bound_box]
        xs = [_bildpunkt(scene, cam, p) for p in pts]
        if not xs:  # Entity ohne Geometrie (z. B. fireball): nicht messbar, aber kein Absturz
            continue
        info["mobs"].append({"art": m["art"], "box": [min(p[0] for p in xs), min(p[1] for p in xs), max(p[0] for p in xs), max(p[1] for p in xs)]})
    # Objekte, um die es geht (Kamera-Thema oder „wichtig“), müssen im Bild sein – Deko darf angeschnitten sein
    info["objekte"] = []
    thema = szene.get("kamera", {}).get("thema")
    for i, o in enumerate(szene.get("objekte") or []):
        ob = bpy.data.objects.get(f"objekt{i}")
        if not ob or not (o.get("wichtig") or thema == f"objekt:{i}"):
            continue
        xs = [_bildpunkt(scene, cam, ob.matrix_world @ Vector(c)) for c in ob.bound_box]
        info["objekte"].append({"nr": i, "block": o.get("block"), "box": [min(p[0] for p in xs), min(p[1] for p in xs), max(p[0] for p in xs), max(p[1] for p in xs)]})
    for fid, ob in gehalten.items():
        pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
        xs = [_bildpunkt(scene, cam, p) for p in pts[:: max(1, len(pts) // 60)]]
        info["items"][fid] = {"box": [min(p[0] for p in xs), min(p[1] for p in xs), max(p[0] for p in xs), max(p[1] for p in xs)]}
    # Warnungen für die Selbstprüfung: Wichtiges muss im Bild sein
    warnungen = []
    for fid, f in info["figuren"].items():
        if fid == szene["figuren"][0]["id"] and (_im_bild(f["kopf_box"]) < 0.999 or min(f["kopf_box"][0], f["kopf_box"][1]) < 0.02 or max(f["kopf_box"][2], f["kopf_box"][3]) > 0.98):
            warnungen.append(f"Kopf von {fid} am Bildrand angeschnitten")
        elif _im_bild(f["kopf_box"]) < 0.6:
            warnungen.append(f"Kopf von {fid} kaum sichtbar")
        elif (szene.get("kamera", {}).get("modus") == "kampf" and fid != szene["figuren"][0]["id"]
              and f["kopf_box"][3] - f["kopf_box"][1] < 0.14):
            # Recherche: der Gegner füllt 45–70 % der Bildhöhe, sein Kopf also mindestens etwa 14 %
            warnungen.append(f"Gegner {fid} zu klein im Bild")
    # Hauptfigur groß und nicht in die Ecke gequetscht (Test 02.10.: Hauptfigur winzig unten links, Vorbilder füllen mit
    # ihm ein Drittel bis die Hälfte des Bildes); weite Einstellungen (ganz, tiefe, abgrund, klippe) dürfen kleiner sein
    haupt_id = szene["figuren"][0]["id"]
    hk = info["figuren"].get(haupt_id, {}).get("kopf_box")
    weit = szene.get("kamera", {}).get("modus") in ("ganz", "tiefe", "abgrund", "klippe", "klippe_wand")
    if hk and _im_bild(hk) >= 0.6:
        mitte_x = (hk[0] + hk[2]) / 2
        if not weit and hk[3] - hk[1] < 0.10:
            warnungen.append(f"Kopf von {haupt_id} zu klein im Bild ({int((hk[3] - hk[1]) * 100)} % der Bildhöhe) – Kamera näher, Hauptfigur groß wie bei den Vorbildern")
        if mitte_x < 0.13 or mitte_x > 0.87:
            warnungen.append(f"Kopf von {haupt_id} klebt am Bildrand ({int(mitte_x * 100)} % von links) – Hauptfigur aufs linke oder rechte Drittel")
    for fid, it in info["items"].items():
        if _im_bild(it["box"]) < 0.9:
            warnungen.append(f"Item von {fid} kaum sichtbar ({int(_im_bild(it['box']) * 100)} % im Bild)")
    def ueberlappung(a, b):
        """Anteil von Box b, den Box a verdeckt."""
        w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
        h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
        return w * h / max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))
    # Echte Sichtprüfung: Strahlen von der Kamera auf das Gesicht – verdeckt ein Arm, ein Schwert oder ein Mob?
    for i, (f, fig) in enumerate(figuren):
        anteil = _gesicht_sichtbar(scene, cam, fig)
        info["figuren"][f["id"]]["gesicht_sichtbar"] = round(anteil, 2)
        # gesicht_frei: false = gewollt verdeckt (Hände vors Gesicht, Facepalm)
        if anteil < (0.75 if i == 0 else 0.5) and f.get("gesicht_frei", True):
            warnungen.append(f"Gesicht von {f['id']} verdeckt oder abgewandt ({int(anteil * 100)} % sichtbar)")
    # Versperrt etwas die Sicht? Strahlen durch ein Bildraster: trifft ein Strahl Welt oder Objekt deutlich vor der
    # Hauptfigur, steht es zwischen Kamera und Szene (z. B. ein Block direkt vor der Linse)
    verdeckt = _sicht_versperrt(scene, cam, figuren[0][1])
    info["sicht_versperrt"] = round(verdeckt, 2)
    if verdeckt > 0.12:
        warnungen.append(f"Etwas versperrt die Sicht ({int(verdeckt * 100)} % des Bildes liegen vor der Hauptfigur)")
    # Verdeckte Mobs (Freiform-Test: Wölfe hinter der Hauptfigur und seinem Schwert): je Mob-Art zählt der am besten sichtbare
    beste = {}
    for m, mob in mobs:
        beste[m["art"]] = max(beste.get(m["art"], 0.0), _mob_sichtbar(scene, cam, mob))
    for art, anteil in beste.items():
        if anteil < 0.25:
            warnungen.append(f"Mob {art} verdeckt ({int(anteil * 100)} % sichtbar) – vor der Hauptfigur oder daneben stellen")
    for m in info["mobs"]:
        b = m["box"]
        sichtbar = max(0.0, min(1, b[2]) - max(0, b[0])) * max(0.0, min(1, b[3]) - max(0, b[1]))
        # sichtbar = zur Hälfte im Bild, oder (Riesenmob, angeschnitten wie bei den Vorbildern) füllt mindestens 12 % des Bildes
        # Viel größer als das Bild: der Mob steht direkt vor der Linse (Freiform-Lauf 05.10.: Spinne als unscharfer
        # brauner Block über dem halben Bild – „kaum sichtbar“ allein half der Korrektur nicht)
        if (b[2] - b[0]) > 1.0 or (b[3] - b[1]) > 1.15:
            warnungen.append(f"Mob {m['art']} zu nah an der Kamera ({(b[2] - b[0]):.1f}-mal so breit wie das Bild) – weiter von der Kamera weg und näher zur Hauptfigur stellen oder kleiner machen")
        elif _im_bild(b) < 0.5 and sichtbar < 0.12:
            raus = [r for r, ja in (("links", b[0] < 0), ("rechts", b[2] > 1), ("oben", b[1] < 0), ("unten", b[3] > 1)) if ja]
            wohin = f" – ragt {' und '.join(raus)} aus dem Bild, weiter zur Bildmitte stellen (niedriger bzw. näher an die Hauptfigur)" if raus else ""
            warnungen.append(f"Mob {m['art']} kaum sichtbar{wohin}")
        elif sichtbar < 0.12 and (b[0] < 0 or b[2] > 1 or b[1] < 0 or b[3] > 1):
            # kleine Mobs gehören ganz ins Bild (Riesenmobs dürfen angeschnitten sein wie bei den Vorbildern)
            warnungen.append(f"Mob {m['art']} am Bildrand angeschnitten – weiter zur Mitte oder näher an der Hauptfigur stellen")
    # Thema-Mob groß wie bei den Vorbildern (Mob nimmt dort 30–60 % der Bildhöhe ein)
    t_thema = szene.get("kamera", {}).get("thema")
    for i, m in enumerate(info["mobs"]):
        if t_thema in (f"mob:{i}", m["art"]):
            b = m["box"]
            sichtbar_h = max(0.0, min(1, b[3]) - max(0, b[1]))
            if 0 < sichtbar_h < 0.28:
                warnungen.append(f"Mob {m['art']} zu klein im Bild ({int(sichtbar_h * 100)} % der Bildhöhe) – näher an der Hauptfigur und die Kamera, wie bei BastiGHG groß neben ihm")
            break
    for o in info["objekte"]:
        if _im_bild(o["box"]) < 0.8 or o["box"][0] < 0 or o["box"][2] > 1:
            warnungen.append(f"Objekt {o['block']} (objekt:{o['nr']}) nicht ganz im Bild ({int(_im_bild(o['box']) * 100)} %) – näher an der Hauptfigur und zur Bildmitte")
    if fehler > 0.1:
        warnungen.append(f"Kamera trifft das Stilbuch nicht (Abweichung {fehler:.2f}) – Thema näher an die Figur legen")
    info["warnungen"] = warnungen
    return info


def _nether_himmel(szene):
    """Im Nether gibt es keinen Himmel: Tag/Nacht/Blutrot werden durch die Stimmung des Bioms ersetzt."""
    w = szene.get("welt", {})
    if w.get("art") != "nether":
        return
    name = mwelt.nether_biom(w.get("biom"))
    b = mwelt.NETHER_BIOME[name]
    schluessel = f"nether_{name}"
    mhimmel.VARIANTEN[schluessel] = {"oben": tuple(c * 0.25 for c in b["dunst"]), "horizont": b["dunst"], "wolken": b["dunst"],
                                     "staerke": 0.6, "sonne": 0.0, "sonne_farbe": (1, 1, 1), "sonne_hoehe": 60,
                                     # Mob von vorn neutral hell, Gegenlicht in Biomfarbe nur halb so stark: sonst wurde
                                     # der weiße Ghast ganz orange (Nether-Test 02.10.)
                                     "rand": b["rand"], "gesicht": 34.0, "mob_licht": True, "mob_licht_faktor": 0.3, "mob_rand_faktor": 0.4,
                                     "dunst": b["dunst"], "ohne_wolken": True}
    szene["himmel"] = schluessel


def baue(szene, texturen, ausgabe=None, bericht=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _nether_himmel(szene)
    scene = bpy.context.scene
    r = szene.get("render", {})
    scene.render.resolution_x = r.get("breite", 1280)
    scene.render.resolution_y = r.get("hoehe", 720)

    _welt(szene.get("welt", {}), texturen, szene.get("himmel", "tag"))
    _objekte(szene.get("objekte"), texturen)
    _markierungen(scene, szene.get("markierungen"))
    mhimmel.baue(scene, szene.get("himmel", "tag"))

    figuren = []
    for f in szene["figuren"]:
        fig = mfigur.baue_figur(f["id"], f["skin"], slim=f.get("slim"))
        x, y, *z = f.get("position", (0, 0))
        if z and "hoehe" not in f:  # [x, y, z]: dritter Wert ist die Höhe
            f["hoehe"] = z[0]
        fig.wurzel.location = (x * BLOCK, y * BLOCK, 0)
        p = _mische(POSEN[f.get("pose", "neutral")], f.get("posen_korrektur"))
        blick = f.get("blick", p.get("blick", 0))
        # Blick nach −X (Gegner rechts, schaut zum Helden): Pose spiegeln, damit Brust, Kopf und Waffe zur Kamera zeigen
        if f.get("spiegeln", isinstance(blick, (int, float)) and blick < -30):
            p = _spiegeln(p)
        p["blick"] = 0 if blick == "auto" else blick
        if f.get("item"):
            p = _werkzeughand(p, f["item"])
        mfigur.pose(fig, p)
        if f.get("mimik"):
            mmimik.setze_mimik(fig, f["mimik"])
        if f.get("kopf"):
            _kopf_block(fig, f["kopf"], texturen)
        if f.get("elytra"):
            _elytra(fig, f["elytra"], texturen)
        _auf_den_boden(scene, fig, f.get("hoehe"))
        figuren.append((f, fig))
    haupt = figuren[0][1]

    mobs = []
    if szene.get("mobs"):
        tab = mmobs.tabelle(szene.get("mob_tabelle"))
        for i, m in enumerate(szene["mobs"]):
            art = m["art"]
            if art not in tab:
                raise ValueError(f"Unbekannter Mob „{art}“ (bekannt: {', '.join(k for k in tab if not k.startswith('_'))})")
            mob = mmobs.baue_mob(art, tab[art], texturen, groesse=m.get("groesse", 1.0), pose=m.get("pose", "stand"), name=f"{art}{i}")
            x, y, *z = m.get("position", (4, 2))
            if z and "hoehe" not in m:  # [x, y, z]: dritter Wert ist die Höhe
                m["hoehe"] = z[0]
            z = m["hoehe"] * BLOCK if "hoehe" in m else _boden_hoehe(scene, x * BLOCK, y * BLOCK)
            mob.wurzel.location = (x * BLOCK, y * BLOCK, z)
            blick = m.get("blick", 0)
            if isinstance(blick, str):  # zu einer Figur schauen
                ziel = next((fig for f, fig in figuren if f["id"] == blick), haupt).kopf_mitte()
                d = ziel - mob.wurzel.location
                blick = math.degrees(math.atan2(d.x, -d.y))
            mob.wurzel.rotation_euler = (0, 0, math.radians(blick))
            mobs.append((m, mob))

    # „auf“: Figur steht, sitzt oder macht Handstand auf einem Mob oder Objekt – ContentStudio rechnet die Lage selbst aus
    for f, fig in figuren:
        if f.get("auf"):
            _auf_etwas(fig, f["auf"], mobs, f.get("hoehe") or 0)

    k = szene.get("kamera", {})
    # Mobs, auf denen jemand steht, sitzt oder reitet, bleiben unter der Figur
    getragen = {f.get("auf") for f, _ in figuren if isinstance(f.get("auf"), str)}
    _mob_auf_die_buehne(scene, haupt, mobs, k.get("thema"), getragen)
    if k.get("modus") in ("kampf", "mob"):
        _gegner_auf_die_buehne(scene, haupt, figuren, k.get("thema"))
    _riesen_zurueck(haupt, mobs, k.get("thema"), getragen)
    cam_data = bpy.data.cameras.new("kamera")
    cam = bpy.data.objects.new("kamera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.clip_end = 5000
    oben, unten = haupt.kopf_punkte()
    t = k.get("thema", (8, 6, 0))
    if isinstance(t, str) and (t.startswith("mob:") or any(m["art"] == t for m, _ in mobs)):
        # Thema ist ein Mob: Mitte seiner echten Ausdehnung (große oder schwebende Mobs wie Ghast, Riesenspinne)
        mob = mobs[int(t[4:])][1] if t.startswith("mob:") else next(mb for m, mb in mobs if m["art"] == t)
        punkte = [o.matrix_world @ Vector(c) for o in mob.teile.values() for c in o.bound_box]
        thema = sum(punkte, Vector()) / len(punkte)
    elif isinstance(t, str) and t.startswith("objekt:") and bpy.data.objects.get(f"objekt{t[7:]}"):
        # Thema ist ein Objekt (Diamantblock, TNT …): seine Mitte
        bpy.context.view_layer.update()
        ob = bpy.data.objects[f"objekt{t[7:]}"]
        punkte = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        thema = sum(punkte, Vector()) / len(punkte)
    elif isinstance(t, str):  # Thema ist eine Figur (Gegner): ihr Kopf
        thema = next((fig for f, fig in figuren if f["id"] == t), haupt).kopf_mitte()
    else:
        thema = Vector([c * BLOCK for c in t])
    kante = szene.get("welt", {}).get("kante", 0)
    erlaubt = (lambda pos: pos.x > (kante + 2.5) * BLOCK) if k.get("ueber_abgrund") else None
    if k.get("modus") == "kampf":
        # Kampf: Kamera vor beiden Gegnern (Seite −Y), nie hinter einem von ihnen
        vorn = min(fig.kopf_mitte().y for f, fig in figuren) - 0.8
        links = haupt.kopf_mitte().x - 0.3  # nicht weit links: sonst verschwindet der Gegner hinter dem Helden
        erlaubt = lambda pos: pos.y < vorn and pos.x > links

    # Hält die Hauptfigur etwas, muss die Hand mit ins Bild (Test 30.09.: Spitzhacke in der Nahaufnahme unsichtbar,
    # weil die Hand unter dem Bildrand lag) – sie zählt wie die Kopf-Ecken, dazu ein Punkt eine Werkzeuglänge weiter
    haupt_item = (szene["figuren"][0].get("item") or {})

    probe_item = {}

    def wichtige_punkte():
        punkte = list(haupt.kopf_ecken())
        if haupt_item.get("name"):
            # Probe-Gegenstand in Spiel-Haltung (hängt nur am Arm, nicht an der Kamera): seine Ecken müssen ins Bild –
            # sonst ragte z. B. das Schwert beim Hieb oben hinaus (Test 30.09.)
            seite = haupt_item.get("hand", "l")
            try:
                if "ob" not in probe_item:
                    probe_item["ob"] = mitems.baue_item(haupt_item["name"], texturen, pixel=mfigur.PX)
                    probe_item["anzeige"] = mitems.haltung(haupt_item["name"], texturen, seite)
                ob = probe_item["ob"]
                mitems.mc_halten(ob, haupt, seite, ob["pixel"], probe_item["anzeige"])
                punkte += [ob.matrix_world @ Vector(c) for c in ob.bound_box]
            except Exception as fehler:  # unbekanntes Item: dann wenigstens die Hand
                print("CS_WARNUNG Probe-Item", fehler)
                punkte.append(haupt.hand(seite))
        # Objekte, um die es geht („wichtig“ oder Kamera-Thema), gehören ins Bild – die Kamera kannte sie bisher nicht,
        # die Prüfung meldete sie nur hinterher als angeschnitten (Test „Welt wird größer“, 01.10.). Die Kanten zählen
        # zu 70 %, damit ein großer Block knapp am Rand nicht die ganze Einstellung verschiebt.
        for i, o in enumerate(szene.get("objekte") or []):
            ob = bpy.data.objects.get(f"objekt{i}")
            if ob and (o.get("wichtig") or k.get("thema") == f"objekt:{i}"):
                ecken = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
                mitte_o = sum(ecken, Vector()) / 8
                punkte += [mitte_o + (e - mitte_o) * 0.7 for e in ecken]
        return punkte

    thema_figur = next((fig for f, fig in figuren if fig is not haupt and f.get("id") == k.get("thema")), None)

    def rahmen(still=False):
        o, u = haupt.kopf_punkte()
        return mkamera.rahme(scene, cam, o, u, thema, k.get("modus", "nah"), seite=k.get("seite", "links"),
                             gesicht=haupt.gesicht_richtung(), erlaubt=erlaubt, kopf_ecken=wichtige_punkte(), still=still,
                             thema_gesicht=thema_figur.gesicht_richtung() if thema_figur else None,
                             anpassung={n: tuple(k[n]) if n.endswith("_uv") else k[n] for n in ("hoehe", "linse", "kopf_anteil", "kopf_uv", "thema_uv") if n in k})

    if szene["figuren"][0].get("blick") == "auto":
        # Wie ein Thumbnail-Künstler: die Figur so drehen, dass Gesicht (Dreiviertelprofil) und Thema zusammen passen
        versuche = []
        for grad in range(-45, 91, 15):
            haupt.wurzel.rotation_euler.z = math.radians(grad)
            versuche.append((rahmen(still=True), grad))
        beste_grad = min(versuche)[1]
        haupt.wurzel.rotation_euler.z = math.radians(beste_grad)
        print("CS_BLICK", beste_grad)
    fehler = rahmen()
    neigung = k.get("neigung", 8) if k.get("modus") == "kampf" else 0
    if any(f.get("item") for f in szene["figuren"]) or len(figuren) > 1:
        # Bildprüfung je Kamera-Vorschlag: der mit den wenigsten Warnungen gewinnt (Schwert im Bild, Gesichter frei)
        bewertet = []
        for kf, linse, matrix, az, el in list(mkamera.KANDIDATEN):
            cam_data.lens = linse
            cam.matrix_world = matrix @ mathutils_Matrix.Rotation(math.radians(neigung), 4, "Z")
            bpy.context.view_layer.update()
            probe = _items_anhaengen(figuren, texturen, cam, k)
            w = _messen(scene, cam, szene, figuren, mobs, probe, kf)["warnungen"]
            for ob in probe.values():
                bpy.data.objects.remove(ob, do_unlink=True)
            bewertet.append((len([x for x in w if not x.startswith("Kamera")]) + kf, kf, linse, matrix, az, w))
        if bewertet:
            _, fehler, linse, matrix, az, w = min(bewertet, key=lambda x: x[0])
            cam_data.lens = linse
            cam.matrix_world = matrix
            print("CS_KAMERA_WAHL azimut", az, "warnungen", len(w), "von", len(bewertet), "Vorschlägen")
    if "ob" in probe_item:
        bpy.data.objects.remove(probe_item["ob"], do_unlink=True)
    _gegner_zur_kamera(thema_figur, haupt, cam)
    oben, unten = haupt.kopf_punkte()
    cam_data.dof.aperture_fstop = r.get("blende", 2.0)
    _pflanzen_vor_kamera_weg(cam, (oben + unten) / 2)
    _randlicht(scene, haupt, cam, k.get("seite", "links"), r.get("randlicht", 650),
               (0.3, 0.85, 1.0) if k.get("modus") == "kampf" and szene.get("himmel") in ("blutrot", "gewitter", "nacht")
               else mhimmel.VARIANTEN.get(szene.get("himmel", "tag"), {}).get("rand", (1.0, 1.0, 1.0)))
    variante = mhimmel.VARIANTEN.get(szene.get("himmel", "tag"), {})
    if k.get("modus") == "kampf":
        # Farbduell (GommeHD): Held mit kühlem, Gegner mit warmem Randlicht; bei Tag weißes Gegenlicht
        dunkel = szene.get("himmel") in ("blutrot", "gewitter", "nacht")
        for i, (f, fig) in enumerate(figuren[1:2]):
            farbe = (1.0, 0.22, 0.10) if dunkel else (1.0, 0.95, 0.9)
            _randlicht(scene, fig, cam, "rechts", r.get("randlicht", 650) * 0.8, farbe)
        # Kamera leicht kippen (Stilbuch-Recherche: 5–15° bei dynamischen Kampfbildern)
        cam.rotation_mode = "XYZ"
        cam.matrix_world = cam.matrix_world @ mathutils_Matrix.Rotation(math.radians(neigung), 4, "Z")
        bpy.context.view_layer.update()
    # Dunkle Himmel: das Thema-Mob (Drache, Enderman, Warden …) bekommt Fülllicht und eine helle Randkante,
    # sonst verschwindet es vor dem Hintergrund
    t_mob = k.get("thema")
    licht_mob = None
    if isinstance(t_mob, str) and (t_mob.startswith("mob:") or any(m["art"] == t_mob for m, _ in mobs)):
        licht_mob = mobs[int(t_mob[4:])][1] if t_mob.startswith("mob:") else next(mb for m, mb in mobs if m["art"] == t_mob)
    elif isinstance(t_mob, (list, tuple)) and mobs:
        # Thema als Punkt (z. B. zwischen drei Ghasts): der Mob, der ihm am nächsten ist, bekommt das Licht – sonst blieb
        # der weiße Ghast im Nether-Licht lachsfarben (Test 02.10.)
        ziel = Vector([c * BLOCK for c in t_mob])

        def mitte_von(mb):
            pts = [o.matrix_world @ Vector(c) for o in mb.teile.values() for c in o.bound_box]
            return sum(pts, Vector()) / max(1, len(pts))
        licht_mob = min((mb for _, mb in mobs), key=lambda mb: (mitte_von(mb) - ziel).length)
    if (variante.get("gesicht") or variante.get("mob_licht")) and licht_mob is not None:
        mob = licht_mob
        punkte = [o.matrix_world @ Vector(c) for o in mob.teile.values() for c in o.bound_box]
        mitte = sum(punkte, Vector()) / len(punkte)
        groesse = max((p - mitte).length for p in punkte)
        for nr, (richtung, energie, farbe) in enumerate(((cam.matrix_world.translation - mitte, 600, (1.0, 1.0, 1.0)), (mitte - cam.matrix_world.translation, 3000, variante.get("rand", (1, 1, 1))))):
            l = bpy.data.lights.new(f"mob_licht{nr}", "AREA")
            # gleiche Beleuchtungsstärke für jede Mob-Größe: Abstand wächst mit der Größe, Energie mit dem Abstand²
            l.energy = energie * (max(0.5, groesse) / 3) ** 2 * variante.get("mob_licht_faktor", 1.0) * (variante.get("mob_rand_faktor", 1.0) if nr == 1 else 1.0)
            l.size = max(2.0, groesse)
            l.color = farbe
            lo = bpy.data.objects.new(l.name, l)
            scene.collection.objects.link(lo)
            lo.visible_camera = False
            d = richtung.normalized()
            lo.location = mitte + d * (groesse * 1.6) + Vector((0, 0, groesse * 0.6))
            lo.rotation_euler = (mitte - lo.location).to_track_quat("-Z", "Y").to_euler()
    staerke = r.get("gesichtslicht", variante.get("gesicht", 10.0))
    mlook.gesichtslicht(scene, cam, (oben + unten) / 2, staerke)
    for f, fig in figuren[1:]:  # Gegner und Freunde: eigenes, schwächeres Gesichtslicht
        if variante.get("gesicht"):
            mlook.gesichtslicht(scene, cam, fig.kopf_mitte(), staerke * 0.6)

    gehalten = _items_anhaengen(figuren, texturen, cam, k)
    # Das Werkzeug der Hauptfigur bekommt ein eigenes weiches Licht von vorn: das Gesichtslicht zielt auf den Kopf,
    # Bogen und Waffen in der Hand lagen sonst im Schatten (Nether-Test 02.10.: Bogen fast schwarz)
    if haupt_item.get("name") and szene["figuren"][0]["id"] in gehalten:
        ob = gehalten[szene["figuren"][0]["id"]]
        ecken = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        mlook.gesichtslicht(scene, cam, sum(ecken, Vector()) / 8, staerke * 0.5)
    _verbindungen_bauen(szene, figuren, mobs, gehalten, texturen)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    geraet = r.get("geraet", "CPU")  # aus dem Hardware-Test: OPTIX, CUDA, HIP, ONEAPI, METAL oder CPU
    if geraet != "CPU":
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = geraet
            prefs.refresh_devices() if hasattr(prefs, "refresh_devices") else prefs.get_devices()
            gefunden = False
            for d in prefs.devices:
                d.use = d.type == geraet
                gefunden = gefunden or d.use
            if gefunden:
                scene.cycles.device = "GPU"
        except (TypeError, KeyError, AttributeError):
            pass  # GPU in dieser Sitzung nicht verfügbar: CPU (funktioniert immer)
    scene.cycles.samples = r.get("samples", 48)
    scene.cycles.use_denoising = True
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        pass
    # heller, sauberer Look wie bei BastiGHG (Vergleich 30.09.: unsere Bilder zu dunkel und dunstig)
    scene.view_settings.exposure = r.get("belichtung", 0.0)
    mlook.farbkorrektur(scene, r.get("saettigung", 1.14), r.get("kontrast", 1.08), r.get("vignette", 0.22))

    info = _messen(scene, cam, szene, figuren, mobs, gehalten, fehler)
    if ausgabe:
        scene.render.filepath = ausgabe
        bpy.ops.render.render(write_still=True)
        warnung = _bild_leer(ausgabe)
        if warnung:
            info.setdefault("warnungen", []).append(warnung)
    if bericht:
        with open(bericht, "w", encoding="utf-8") as fh:
            json.dump(info, fh, ensure_ascii=False, indent=1)
    if ausgabe and r.get("maske", True):
        # Bild und Bericht sind fertig. Stürzt der Workbench-Render ohne OpenGL ab, fehlt nur die Maske.
        print("CS_BILD_OK", ausgabe, flush=True)
        vorne = [fig.wurzel for f, fig in figuren] + [mob.wurzel for m, mob in mobs] + list(gehalten.values())
        _maske(scene, vorne, os.path.splitext(ausgabe)[0] + ".maske.png")
    return info


def _elytra(fig, modus, texturen):
    """Elytra auf dem Rücken wie im Spiel (Java-Modell ElytraModel: Flügel 10×20×2 px, UV 22/0, Drehpunkt 5 px neben der
    Mitte am Hals, 2 px hinter dem Rücken). „zu“: angelegt (x 15°, z ∓15°), „offen“/true: ausgebreitet beim Gleiten
    (x 20°, z ∓90°). Textur entity/equipment/wings/elytra.png, ältere Versionen entity/elytra.png."""
    pfad = next((q for q in (os.path.join(texturen, "entity", "equipment", "wings", "elytra.png"), os.path.join(texturen, "entity", "elytra.png")) if os.path.exists(q)), None)
    if not pfad:
        print("CS_WARNUNG Elytra-Textur fehlt")
        return
    bild = bpy.data.images.load(pfad, check_existing=True)
    bild.alpha_mode = "STRAIGHT"
    mat = mmobs._material(f"{fig.name}.elytra", bild)
    offen = modus not in ("zu", "angelegt")
    x_rot, z_rot = (20.0, 90.0) if offen else (15.0, 15.0)
    # Java-Modellraum (y nach unten, z nach hinten) → Figurraum (z nach oben, y nach hinten)
    basis = mathutils_Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
    huefte = fig.gelenke["koerper"]
    for seite, vz, box in (("l", 1, {"origin": [-10, -20, 0], "size": [10, 20, 2], "uv": [22, 0], "inflate": 1.0}), ("r", -1, {"origin": [0, -20, 0], "size": [10, 20, 2], "uv": [22, 0], "inflate": 1.0, "mirror": True})):
        me = mmobs._mesh(f"{fig.name}.elytra_{seite}", [box], 64, 32, Vector((0, 0, 0)), mat)
        ob = bpy.data.objects.new(me.name, me)
        bpy.context.scene.collection.objects.link(ob)
        java = mathutils_Matrix.Rotation(math.radians(-z_rot * vz), 4, "Z") @ mathutils_Matrix.Rotation(math.radians(x_rot), 4, "X")
        ob.parent = huefte
        ob.matrix_parent_inverse = mathutils_Matrix.Identity(4)
        ob.matrix_basis = mathutils_Matrix.Translation(Vector((5 * vz, 2, 12)) * mfigur.PX) @ basis @ java @ basis.inverted()


def _kopf_block(fig, block, texturen):
    """Block auf dem Kopf (geschnitzter Kürbis, Helm aus Blöcken …): etwas größer als der Kopf, dreht mit ihm.
    Der Name beginnt mit „<figur>.kopf“, damit die Gesichtsprüfung ihn als gewollt zählt."""
    kopf = fig.teile["kopf"]
    halb = 0.5 * BLOCK
    ob = bloecke.baue({(0, 0, 1): block}, bloecke.Texturen(texturen), f"{fig.name}.kopf_block", versatz=(-halb, -halb, -halb))
    bpy.context.view_layer.update()
    s = 9.4 * mfigur.PX / BLOCK  # größer als die zweite Skin-Schicht (Haare, Hut), die sonst herausschaut
    ob.matrix_world = kopf.matrix_world @ mathutils_Matrix.Scale(s, 4)
    ob.parent = kopf
    ob.matrix_parent_inverse = kopf.matrix_world.inverted()


# Verbindungen zwischen zwei Punkten: Breite (halbe Kantenlänge in Blöcken), Durchhang (Anteil der Länge), Farbe/Textur
VERBINDUNGEN = {
    "strahl": {"breite": 0.12, "durchhang": 0.0, "textur": ("entity", "guardian", "guardian_beam.png"), "leuchten": 4.0, "tönung": (0.85, 0.73, 0.30)},
    "angelschnur": {"breite": 0.012, "durchhang": 0.12, "farbe": (0.05, 0.05, 0.05)},
    "leine": {"breite": 0.035, "durchhang": 0.08, "farbe": (0.36, 0.24, 0.12)},
    "seil": {"breite": 0.05, "durchhang": 0.1, "farbe": (0.55, 0.42, 0.26)},
    # Kette wie der Kettenblock im Spiel: zwei gekreuzte Flächen, 3 Pixel breit, Glieder abwechselnd (template_chain)
    "kette": {"breite": 1.5 / 16, "durchhang": 0.1, "textur": ("block", "iron_chain.png"), "kreuz": ((0, 3 / 16), (3 / 16, 6 / 16))},
}


def _mitte_von(ob_liste):
    punkte = [o.matrix_world @ Vector(c) for o in ob_liste for c in o.bound_box]
    return sum(punkte, Vector()) / len(punkte)


def _verbindungs_punkt(ref, figuren, mobs, gehalten):
    """„mob:0“ oder Mob-Art → Mitte des Mobs; „<id>“ → Hals der Figur; „<id>:hand“ → Spitze des gehaltenen Gegenstands
    (sonst die Faust); [x, y, z] → Punkt in Blöcken."""
    if isinstance(ref, (list, tuple)) and len(ref) >= 2:
        return Vector((ref[0] * BLOCK, ref[1] * BLOCK, (ref[2] if len(ref) > 2 else 1.0) * BLOCK))
    if not isinstance(ref, str):
        return None
    if ref.startswith("mob:") or any(m["art"] == ref for m, _ in mobs):
        try:
            mob = mobs[int(ref[4:])][1] if ref.startswith("mob:") else next(mb for m, mb in mobs if m["art"] == ref)
        except (ValueError, IndexError):
            return None
        return _mitte_von(mob.teile.values())
    fid, _, teil = ref.partition(":")
    treffer = next(((f, fig) for f, fig in figuren if f["id"] == fid), None)
    if not treffer:
        return None
    f, fig = treffer
    if teil == "hand":
        ob = gehalten.get(fid)
        faust = fig.hand((f.get("item") or {}).get("hand", "r"))
        if ob:  # Spitze: der Punkt des Gegenstands, der am weitesten von der Faust weg ist
            return max((ob.matrix_world @ Vector(c) for c in ob.bound_box), key=lambda q: (q - faust).length)
        return faust
    return fig.kopf_mitte() - Vector((0, 0, 0.45 * BLOCK))


def _verbindung(a, b, art, texturen, name):
    """Balken aus Stücken von a nach b, bei Schnur und Leine leicht durchhängend; der Strahl nutzt die echte Textur
    entity/guardian/guardian_beam.png, die sich längs wiederholt und leuchtet."""
    v = VERBINDUNGEN[art]
    d = b - a
    laenge = d.length
    if laenge < 0.05:
        return None
    stuecke = 1 if v["durchhang"] == 0 else 12
    punkte = [a + d * (i / stuecke) - Vector((0, 0, 4 * v["durchhang"] * laenge * (i / stuecke) * (1 - i / stuecke))) for i in range(stuecke + 1)]
    w = v["breite"] * BLOCK
    verts, faces, uvs = [], [], []
    gelaufen = 0.0
    for i in range(stuecke if v.get("kreuz") else 0):
        # Kette: je Stück zwei gekreuzte Flächen mit den beiden Gliederspalten der Textur (u 0–3 bzw. 3–6 Pixel)
        p0, p1 = punkte[i], punkte[i + 1]
        achse = (p1 - p0).normalized()
        quer = achse.cross(Vector((0, 0, 1)))
        if quer.length < 1e-4:
            quer = Vector((1, 0, 0))
        quer.normalize()
        hoch = quer.cross(achse).normalized()
        schritt = (p1 - p0).length / BLOCK
        for richtung, (u0, u1) in zip((quer, hoch), v["kreuz"]):
            n = len(verts)
            verts += [p0 - richtung * w, p0 + richtung * w, p1 + richtung * w, p1 - richtung * w]
            faces.append((n, n + 1, n + 2, n + 3))
            uvs += [(u0, gelaufen), (u1, gelaufen), (u1, gelaufen + schritt), (u0, gelaufen + schritt)]
        gelaufen += schritt
    for i in range(0 if v.get("kreuz") else stuecke):
        p0, p1 = punkte[i], punkte[i + 1]
        achse = (p1 - p0).normalized()
        quer = achse.cross(Vector((0, 0, 1)))
        if quer.length < 1e-4:
            quer = Vector((1, 0, 0))
        quer.normalize()
        hoch = quer.cross(achse).normalized()
        ecken = [(-quer - hoch) * w, (quer - hoch) * w, (quer + hoch) * w, (-quer + hoch) * w]
        schritt = (p1 - p0).length / BLOCK
        for j in range(4):
            e0, e1 = ecken[j], ecken[(j + 1) % 4]
            n = len(verts)
            verts += [p0 + e0, p0 + e1, p1 + e1, p1 + e0]
            faces.append((n, n + 1, n + 2, n + 3))
            uvs += [(0, gelaufen), (1, gelaufen), (1, gelaufen + schritt), (0, gelaufen + schritt)]
        gelaufen += schritt
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(x) for x in verts], [], faces)
    uv = me.uv_layers.new(name="uv")
    for loop in me.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    pfad = os.path.join(texturen, *v["textur"]) if v.get("textur") else None
    if pfad and os.path.exists(pfad):
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(pfad, check_existing=True)
        tex.interpolation = "Closest"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if v.get("kreuz"):
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            bsdf.inputs["Metallic"].default_value = 0.6
            if hasattr(mat, "blend_method"):
                mat.blend_method = "CLIP"
        if v.get("leuchten"):
            # wie im Spiel additiv: Schwarz ist durchsichtig, helle Linien leuchten in der Farbe des geladenen Strahls
            # (GuardianRenderer: Farbe wandert beim Aufladen von Lila zu Gold-Weiß; hier 80 % geladen)
            faerben = nt.nodes.new("ShaderNodeMixRGB")
            faerben.blend_type = "MULTIPLY"
            faerben.inputs[0].default_value = 1.0
            faerben.inputs[2].default_value = (*v.get("tönung", (1.0, 1.0, 1.0)), 1.0)
            nt.links.new(tex.outputs["Color"], faerben.inputs[1])
            licht = nt.nodes.new("ShaderNodeEmission")
            licht.inputs["Strength"].default_value = v["leuchten"]
            nt.links.new(faerben.outputs[0], licht.inputs["Color"])
            durch = nt.nodes.new("ShaderNodeBsdfTransparent")
            summe = nt.nodes.new("ShaderNodeAddShader")
            nt.links.new(durch.outputs[0], summe.inputs[0])
            nt.links.new(licht.outputs[0], summe.inputs[1])
            nt.links.new(summe.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
            if hasattr(mat, "blend_method"):
                mat.blend_method = "BLEND"
    else:
        bsdf.inputs["Base Color"].default_value = (*v.get("farbe", (0.1, 0.1, 0.1)), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _verbindungen_bauen(szene, figuren, mobs, gehalten, texturen):
    """„verbindungen“: [{"von", "zu", "art": strahl|angelschnur|leine}]; Kurzform am Mob: „strahl“: „<id>“ (Wächter-Laser)."""
    liste = list(szene.get("verbindungen") or [])
    for i, (m, _) in enumerate(mobs):
        if isinstance(m.get("strahl"), str):
            liste.append({"von": f"mob:{i}", "zu": m["strahl"], "art": "strahl"})
    bpy.context.view_layer.update()
    for n, vb in enumerate(liste):
        art = vb.get("art", "leine")
        if art not in VERBINDUNGEN:
            print("CS_WARNUNG unbekannte Verbindung", art)
            continue
        a = _verbindungs_punkt(vb.get("von"), figuren, mobs, gehalten)
        b = _verbindungs_punkt(vb.get("zu"), figuren, mobs, gehalten)
        if a is None or b is None:
            print("CS_WARNUNG Verbindung ohne Endpunkt", vb)
            continue
        _verbindung(a, b, art, texturen, f"verbindung{n}.{art}")


def _auf_etwas(fig, ziel, mobs, hoehe=0.0):
    """Stellt die Figur mittig auf einen Mob („mob:0“ oder Mob-Art) oder ein Objekt („objekt:0“); der tiefste Punkt der
    Figur (Füße, beim Handstand die Hände/der Kopf) liegt auf dessen Oberseite."""
    # erst aktualisieren: sonst stehen frisch platzierte Mobs und Objekte für matrix_world noch im Ursprung
    bpy.context.view_layer.update()
    punkte = []
    if isinstance(ziel, str) and ziel.startswith("objekt:"):
        ob = bpy.data.objects.get(f"objekt{int(ziel[7:])}")
        punkte = [ob.matrix_world @ Vector(c) for c in ob.bound_box] if ob else []
    elif isinstance(ziel, str):
        mob = None
        if ziel.startswith("mob:") and int(ziel[4:]) < len(mobs):
            mob = mobs[int(ziel[4:])][1]
        else:
            mob = next((mb for m, mb in mobs if m["art"] == ziel), None)
        if mob:
            punkte = [o.matrix_world @ Vector(c) for o in mob.teile.values() for c in o.bound_box]
    if not punkte:
        print("CS_WARNUNG auf: Ziel nicht gefunden", ziel)
        return
    bpy.context.view_layer.update()
    oben = max(p.z for p in punkte)
    tief = min((o.matrix_world @ Vector(c)).z for o in fig.teile.values() for c in o.bound_box)
    fig.wurzel.location.x = sum(p.x for p in punkte) / len(punkte)
    fig.wurzel.location.y = sum(p.y for p in punkte) / len(punkte)
    fig.wurzel.location.z += oben + hoehe * BLOCK - tief
    bpy.context.view_layer.update()


def _bild_leer(pfad):
    """Freiform-Test: Kamera schaut auf eine helle Fläche oder ins Leere (weißes Bild, schwebende Figur). Dann ist das
    Bild unbrauchbar, egal was die Geometrie sagt – ernste Warnung, Claude korrigiert die Szene."""
    import numpy as np

    try:
        bild = bpy.data.images.load(pfad, check_existing=False)
        w, h = bild.size
        a = np.array(bild.pixels[:], dtype=np.float32).reshape(h, w, 4)[::4, ::4, :3]
        bpy.data.images.remove(bild)
    except Exception:  # Bild nicht lesbar: keine Aussage
        return None
    hell = (a.min(axis=2) > 0.9).mean()
    gleich = (np.abs(a - np.median(a.reshape(-1, 3), axis=0)).max(axis=2) < 0.04).mean()
    if hell > 0.35:
        return f"Bild überstrahlt: {round(hell * 100)} % fast weiß – Kamera schaut auf eine helle Fläche oder ins Leere"
    if gleich > 0.55:
        return f"Bild fast leer: {round(gleich * 100)} % eine einzige Farbe – Umgebung fehlt"
    return None


def _maske(scene, vorne, pfad):
    """Figuren, Mobs und gehaltene Items weiß, alles andere schwarz, Himmel durchsichtig (ROADMAP 8.4: Ebenen für
    Photoshop). Workbench statt Cycles, dauert nur Sekunden; gleiche Kamera, also deckungsgleich mit dem Bild."""
    wichtig = set()
    for ob in vorne:
        wichtig.add(ob)
        wichtig.update(ob.children_recursive)
    for ob in bpy.data.objects:
        ob.color = (1.0, 1.0, 1.0, 1.0) if ob in wichtig else (0.0, 0.0, 0.0, 1.0)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "OBJECT"
    scene.display.render_aa = "8"
    scene.render.film_transparent = True
    scene.render.use_compositing = False
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    if scene.camera:
        scene.camera.data.dof.use_dof = False
    scene.render.filepath = pfad
    bpy.ops.render.render(write_still=True)
    try:
        _maske_durchsichtig(scene, wichtig, pfad)
    except Exception as fehler:  # ohne zweiten Durchgang bleibt die einfache Maske
        print("CS_WARNUNG Maske ohne Durchsichtigkeit", fehler)


def _maske_durchsichtig(scene, wichtig, pfad):
    """Zweiter Durchgang (M5b, 02.10.): Die Objektfarbe kennt keine durchsichtigen Texturstellen – der leere Kasten um
    die Ohren des Wardens oder die zweite Skin-Ebene zählten als Vordergrund, beim Veredeln entstand ein Rechteck.
    Nur der Vordergrund mit Texturen (Workbench beachtet deren Alpha), daraus die Deckkraft; mal der ersten Maske, die
    weiter weiß, was davor liegt."""
    import numpy as np

    versteckt = []
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob not in wichtig and not ob.hide_render:
            ob.hide_render = True
            versteckt.append(ob)
    scene.display.shading.color_type = "TEXTURE"
    alpha_pfad = os.path.splitext(pfad)[0] + ".alpha.png"
    scene.render.filepath = alpha_pfad
    bpy.ops.render.render(write_still=True)
    for ob in versteckt:
        ob.hide_render = False
    erst = bpy.data.images.load(pfad)
    zweit = bpy.data.images.load(alpha_pfad)
    a = np.empty(len(erst.pixels), dtype=np.float32)
    b = np.empty(len(zweit.pixels), dtype=np.float32)
    erst.pixels.foreach_get(a)
    zweit.pixels.foreach_get(b)
    a[3::4] *= b[3::4]
    erst.pixels.foreach_set(a)
    erst.filepath_raw = pfad
    erst.file_format = "PNG"
    erst.save()
    os.remove(alpha_pfad)
