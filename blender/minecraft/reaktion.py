"""Reaction- und Gaming-Thumbnails (Stilbuch 14, Vorbilder: BastiGHGs Zweitkanal „Bastian“, zarbexLIVE, Mr. Geil).

Aufbau in einer Blender-Szene, ein Render:
- Das Original (oder Spielmotiv) füllt als Bildfläche das ganze Bild, leicht abgedunkelt und durch die Tiefenschärfe
  weich (Stilbuch 14.9).
- der echte Skin (nie gezeichnet) steht in einer Bildhälfte, auf Brusthöhe angeschnitten, Kopf 55–65 % der
  Bildhöhe, 15–35° zum Inhalt gedreht, mit Mimik und wechselnder Pose (14.1–14.4).
- Genau ein Wort groß auf der Inhaltsseite (14.5), höchstens ein roter gebogener Pfeil zum Detail (14.6),
  optional ein Logo in der unteren Ecke gegenüber der Figur (14.7).
- Weiches Key-Licht von vorn oben, dünne helle Randkante, kein Glow (14.8).
"""
import math
import os

import bpy
from mathutils import Vector

from . import figur as mfigur
from . import look as mlook
from . import mimik as mmimik
from . import szene as mszene
from . import textlook as mtext
from .posen import POSEN

BREITE, HOEHE = 1280, 720
ROT = (0.745, 0.007, 0.012)  # #E0141E linear


def _bildflaeche(pfad, cam, abstand, name="hintergrund", helligkeit=0.85):
    """Bild als Fläche, die das Kamerabild in `abstand` genau füllt (cover), leicht abgedunkelt."""
    img = bpy.data.images.load(pfad, check_existing=True)
    fov = cam.data.angle_x
    breite = 2 * abstand * math.tan(fov / 2)
    hoehe = breite * HOEHE / BREITE
    iw, ih = img.size
    # „cover“: Bildseitenverhältnis erhalten, überstehenden Teil abschneiden
    if iw / ih > BREITE / HOEHE:
        b, h = hoehe * iw / ih, hoehe
    else:
        b, h = breite, breite * ih / iw
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-b / 2, 0, -h / 2), (b / 2, 0, -h / 2), (b / 2, 0, h / 2), (-b / 2, 0, h / 2)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="uv")
    for i, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[i].uv = (u, v)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = helligkeit
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    richtung = cam.matrix_world.to_3x3() @ Vector((0, 0, -1))
    ob.location = cam.matrix_world.translation + richtung * abstand
    ob.rotation_euler = cam.matrix_world.to_euler()
    ob.rotation_euler.x -= math.radians(90)  # Fläche liegt in XZ, Kamera schaut entlang −Z
    ob.visible_shadow = False
    return ob


def _textobjekt(text, schrift, hoehe_m, farbe, kontur=(0.02, 0.02, 0.02)):
    """Wort als 3D-Text mit dunkler Kontur (dahinterliegende, dickere Kopie) – ohne Glow."""
    daten = bpy.data.curves.new("wort", "FONT")
    daten.body = text
    daten.align_x = "CENTER"
    daten.align_y = "CENTER"
    if schrift and os.path.exists(schrift):
        daten.font = bpy.data.fonts.load(schrift, check_existing=True)
    daten.size = hoehe_m
    daten.extrude = hoehe_m * 0.04
    ob = bpy.data.objects.new("wort", daten)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new("wort")
    mat.use_nodes = True
    em = mat.node_tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*farbe, 1)
    mat.node_tree.links.new(em.outputs["Emission"], mat.node_tree.nodes["Material Output"].inputs["Surface"])
    daten.materials.append(mat)
    rand = ob.copy()
    rand.data = daten.copy()
    rand.data.offset = hoehe_m * 0.045
    rmat = bpy.data.materials.new("wort_rand")
    rmat.use_nodes = True
    rem = rmat.node_tree.nodes.new("ShaderNodeEmission")
    rem.inputs["Color"].default_value = (*kontur, 1)
    rmat.node_tree.links.new(rem.outputs["Emission"], rmat.node_tree.nodes["Material Output"].inputs["Surface"])
    rand.data.materials.clear()
    rand.data.materials.append(rmat)
    bpy.context.scene.collection.objects.link(rand)
    rand.parent = ob
    rand.location = (hoehe_m * 0.03, -hoehe_m * 0.02, -hoehe_m * 0.02)  # weicher Schatten nach unten rechts
    return ob


def _pfeil(von, nach, dicke, farbe=ROT):
    """Gebogener Pfeil (Bezier mit Rundprofil) plus Spitze, rot mit dünnem weißem Rand."""
    kurve = bpy.data.curves.new("pfeil", "CURVE")
    kurve.dimensions = "3D"
    kurve.bevel_depth = dicke / 2
    kurve.bevel_resolution = 3
    sp = kurve.splines.new("BEZIER")
    sp.bezier_points.add(1)
    mitte = (von + nach) / 2
    quer = (nach - von).cross(Vector((0, 1, 0))).normalized() * (nach - von).length * 0.35
    a, b = sp.bezier_points
    a.co, b.co = von, nach
    a.handle_right = mitte + quer
    b.handle_left = mitte + quer
    a.handle_left = von - (mitte + quer - von)
    b.handle_right = nach + (nach - (mitte + quer))
    ob = bpy.data.objects.new("pfeil", kurve)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new("pfeil")
    mat.use_nodes = True
    em = mat.node_tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*farbe, 1)
    mat.node_tree.links.new(em.outputs["Emission"], mat.node_tree.nodes["Material Output"].inputs["Surface"])
    kurve.materials.append(mat)
    # Spitze als Kegel in Richtung der Kurve am Ende
    richtung = (nach - b.handle_left).normalized()
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=dicke * 1.7, depth=dicke * 3.2, location=nach + richtung * dicke * 1.2)
    spitze = bpy.context.active_object
    spitze.rotation_euler = richtung.to_track_quat("Z", "Y").to_euler()
    spitze.data.materials.append(mat)
    return ob


def baue_reaktion(spec, ausgabe, bericht=None):
    """spec: {hintergrund, skin, slim, seite: links|rechts, mimik, pose, wort, wort_farbe, schrift,
    pfeil_ziel: [u, v] (0..1, oben links = 0,0), logo, samples}"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = BREITE, HOEHE
    seite = spec.get("seite", "links")
    s = -1 if seite == "links" else 1  # Figur bei −X (links) oder +X (rechts); Inhalt auf der anderen Seite

    fig = mfigur.baue_figur("ich", spec["skin"], slim=spec.get("slim"))
    cam_daten = bpy.data.cameras.new("kamera")
    cam_daten.lens = 45
    cam = bpy.data.objects.new("kamera", cam_daten)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def stelle(posen_name, anteil=None):
        """Pose setzen und Kamera rahmen: Kopf ~42 % der Bildhöhe, Figur in ihrer Bildhälfte (Stilbuch 14.1–14.4)."""
        roh = posen_name if isinstance(posen_name, dict) else POSEN.get(posen_name, POSEN["neutral"])
        p = {k: (dict(v) if isinstance(v, dict) else v) for k, v in roh.items()}
        if s > 0:  # Inhalt links: Pose seitenverkehrt, damit Zeigen und Gesten zum Inhalt gehen
            p = mszene._spiegeln(p)
        # Kopf 15–35° zum Inhalt (Stilbuch 14.2); Blick der Figur leicht zum Inhalt
        p["blick"] = -s * spec.get("koerper_drehung", 18)
        p.setdefault("kopf", {})
        p["kopf"]["drehen"] = p["kopf"].get("drehen", 0) * 0.3 - s * spec.get("kopf_drehung", 14)
        p["kopf"]["neigen"] = p["kopf"].get("neigen", 0) - s * 6
        mfigur.pose(fig, p)
        kopf = fig.kopf_mitte()
        kopf_h = 8 * mfigur.PX * 1.06
        vfov = 2 * math.atan(cam_daten.sensor_width * HOEHE / BREITE / 2 / cam_daten.lens)
        abstand = kopf_h / (anteil or spec.get("kopf_anteil", 0.42)) / (2 * math.tan(vfov / 2))
        breite_m = 2 * abstand * math.tan(cam_daten.angle_x / 2)
        hoehe_m = breite_m * HOEHE / BREITE
        # Kopf bei 22 % (bzw. 78 %) der Breite und auf halber Höhe, Figur nah am Rand (Wunsch: „etwas weniger vom Skin“)
        ziel = kopf + Vector((-s * (0.5 - (0.32 if spec.get("freunde") else 0.22)) * breite_m, 0, -(0.5 - 0.5) * hoehe_m))
        cam.location = ziel + Vector((0, -abstand, 0))
        cam.rotation_euler = (math.radians(90), 0, 0)
        bpy.context.view_layer.update()
        return kopf, abstand

    from bpy_extras.object_utils import world_to_camera_view

    inhalt_u = 0.70 if seite == "links" else 0.30

    def bild(punkt):
        p = world_to_camera_view(scene, cam, punkt)
        return p.x, 1 - p.y

    def hand_im_text():
        """Liegt eine Hand im Bereich von Wort und Pfeilanfang (Inhaltsseite, obere 40 %)?"""
        for h in ("r", "l"):
            u, v = bild(fig.hand(h))
            if abs(u - inhalt_u) < 0.27 and v < 0.42:
                return True
        return False

    pose_name = spec.get("pose", "neutral")
    kopf, abstand = stelle(pose_name)
    # Gesicht muss ganz frei bleiben und keine Hand darf in Wort oder Pfeil ragen, sonst gilt die Pose ohne Hände
    sicht = mszene._gesicht_sichtbar(scene, cam, fig)
    # Wunsch-Pose (die Hauptfigur beschreibt sie selbst) bleibt, solange das Gesicht noch gut zu sehen ist
    grenze = 0.5 if spec.get("pose_fest") else 0.96
    if pose_name != "neutral" and (sicht < grenze or (not spec.get("pose_fest") and spec.get("wort") and hand_im_text())):
        pose_name = "neutral"
        kopf, abstand = stelle(pose_name)
        sicht = mszene._gesicht_sichtbar(scene, cam, fig)
    # Liegt der wichtige Punkt hinter der Figur, rückt die Figur zum Rand (Kopf bleibt ganz im Bild);
    # reicht der Platz nicht, wird die Figur schrittweise kleiner (Kopf 42 → 31 % der Bildhöhe)
    if spec.get("pfeil_ziel") and not spec.get("freunde"):  # mit Freunden steht die Gruppe fest (Kopf bei 30 %)
        zu = spec["pfeil_ziel"][0]
        start = spec.get("kopf_anteil", 0.42)
        for anteil in (start, start * 0.87, start * 0.74):
            if anteil != start:
                kopf, abstand = stelle(pose_name, anteil)
            ecken = [bild(c) for c in fig.kopf_ecken()]
            k0, k1 = min(e[0] for e in ecken), max(e[0] for e in ecken)
            noetig = (zu + 0.1 - k0) if seite == "rechts" else (k1 + 0.1 - zu)
            platz = (0.99 - k1) if seite == "rechts" else (k0 - 0.01)
            schub = max(0.0, min(noetig, platz))
            breite_m = 2 * abstand * math.tan(cam_daten.angle_x / 2)
            cam.location.x -= (schub if seite == "rechts" else -schub) * breite_m
            bpy.context.view_layer.update()
            if noetig <= platz:
                break
    if spec.get("mimik"):
        mmimik.setze_mimik(fig, spec["mimik"])
    # Freunde („wenn ich mit einem anderen ein Video aufnehme, muss er mit aufs Thumbnail“):
    # neben der Hauptfigur zur Randseite hin, etwas weiter hinten (kleiner, leicht unscharf), gleiche Stimmung; die Hauptfigur rückt
    # dafür etwas zur Mitte (Kopf bei 30 % statt 22 % der Breite)
    freunde = []
    richtung = 1 if seite == "links" else -1  # Inhaltsseite im Bild
    u_haupt, v_haupt = bild(kopf)
    for i, fr in enumerate(spec.get("freunde") or []):
        f = mfigur.baue_figur(f"freund{i}", fr["skin"], slim=fr.get("slim"))
        roh = fr.get("pose", "neutral")
        pf = {k: (dict(v) if isinstance(v, dict) else v) for k, v in (roh if isinstance(roh, dict) else POSEN.get(roh, POSEN["neutral"])).items()}
        if s > 0:
            pf = mszene._spiegeln(pf)
        pf["blick"] = -s * 14  # leicht zu der Hauptfigur und zum Inhalt gedreht
        mfigur.pose(f, pf)
        tiefe = abstand * (1.12 + 0.1 * i)
        u_f = u_haupt - richtung * (0.23 + 0.16 * i)  # zur Randseite, damit der Inhalt frei bleibt
        breite_t = 2 * tiefe * math.tan(cam_daten.angle_x / 2)
        ziel_kopf = cam.location + Vector(((u_f - 0.5) * breite_t, tiefe, (0.5 - (v_haupt - 0.02)) * breite_t * HOEHE / BREITE))
        f.wurzel.location = ziel_kopf - f.kopf_mitte()
        bpy.context.view_layer.update()
        if spec.get("mimik"):
            mmimik.setze_mimik(f, spec["mimik"])
        freunde.append(f)
    cam_daten.dof.use_dof = True
    cam_daten.dof.focus_distance = abstand
    cam_daten.dof.aperture_fstop = 4.0 if freunde else 2.8

    # Hintergrund weit hinten (Tiefenschärfe macht ihn weich, Stilbuch 14.9)
    hinten = abstand * 9
    _bildflaeche(spec["hintergrund"], cam, hinten, helligkeit=spec.get("hintergrund_hell", 0.85))
    farben = mtext.BildFarben(spec["hintergrund"])

    # Licht: weiches Key-Licht vorn oben, Fülllicht, dünne Randkante (Stilbuch 14.8)
    for name, ort, energie, groesse in (("key", Vector((s * 0.9, -1.6, 1.0)), 90, 1.4), ("fuell", Vector((-s * 1.2, -1.2, 0.2)), 25, 2.0), ("rand", Vector((-s * 0.8, 1.2, 0.6)), 160, 0.6)):
        l = bpy.data.lights.new(name, "AREA")
        l.energy = energie
        l.size = groesse
        o = bpy.data.objects.new(name, l)
        scene.collection.objects.link(o)
        o.location = kopf + ort
        o.rotation_euler = (kopf - o.location).to_track_quat("-Z", "Y").to_euler()
        o.visible_camera = False
    welt = bpy.data.worlds.new("welt")
    scene.world = welt
    welt.use_nodes = True
    welt.node_tree.nodes["Background"].inputs["Color"].default_value = (0.3, 0.3, 0.32, 1)
    welt.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6

    # Bildkoordinaten → Punkt in einer Ebene vor der Kamera (für Wort und Pfeil)
    ebene = abstand * 0.8
    b_e = 2 * ebene * math.tan(cam_daten.angle_x / 2)
    h_e = b_e * HOEHE / BREITE

    def punkt(u, v):
        return cam.location + Vector(((u - 0.5) * b_e, ebene, (0.5 - v) * h_e))

    info = {"wort": None, "pfeil": None, "pose": pose_name, "gesicht_sichtbar": round(sicht, 2)}
    rng = mtext.zufall(spec)
    if spec.get("wort"):
        wort = spec["wort"].upper()
        # Figur-Bereich: die Hauptfigur und alle Freunde (Text nie über einem Kopf oder Körper)
        ecken_k = [bild(c) for g in [fig, *freunde] for c in g.kopf_ecken()]
        f0, f1 = min(e[0] for e in ecken_k) - 0.03, max(e[0] for e in ecken_k) + 0.03
        f_oben = min(e[1] for e in ecken_k) - 0.03
        ziel = spec.get("pfeil_ziel")
        haende = [bild(g.hand(h)) for g in [fig, *freunde] for h in ("r", "l")]
        sperren = spec.get("sperren") or []  # Titel, Logos, Gesichter im Original (von Claude)

        def frei_fuer(anteil, halb_b, mit_sperren=True):
            def frei(u, v):
                if u - halb_b < 0.01 or u + halb_b > 0.99:
                    return False
                if u + halb_b > f0 and u - halb_b < f1 and v + anteil / 2 > f_oben:
                    return False  # über der Figur
                if ziel and abs(ziel[0] - u) < halb_b + 0.04 and abs(ziel[1] - v) < anteil / 2 + 0.06:
                    return False  # über dem wichtigen Detail
                if any(abs(hu - u) < halb_b + 0.07 and abs(hv - v) < anteil / 2 + 0.07 for hu, hv in haende):
                    return False  # über der Hauptfigur Hand
                if mit_sperren and any(u + halb_b > b[0] and u - halb_b < b[2] and v + anteil / 2 > b[1] and v - anteil / 2 < b[3] for b in sperren):
                    return False  # über Titel, Logo oder Gesicht im Original
                return True
            return frei

        # Oben zuerst (unten sitzen in Originalen oft Logos), dann unten; passt nichts, wird das Wort kleiner
        wahl = None
        stufen = [(spec.get("wort_anteil", 0.2) * f, True) for f in (1.0, 0.85, 0.72, 0.6)]
        stufen += [(spec.get("wort_anteil", 0.2) * f, False) for f in (0.85, 0.6)]  # zur Not über Hintergrund-Deko
        for anteil, mit_sperren in stufen:
            halb_b = min(0.46, len(wort) * anteil * 0.8 * HOEHE / BREITE / 2)  # Arial Black: Zeichen ≈ 0,8 × Höhe
            frei = frei_fuer(anteil, halb_b, mit_sperren)
            for vs in ((0.12, 0.17, 0.22), (0.8, 0.86)):
                plaetze = [[u, v] for v in vs for u in (inhalt_u - 0.12, inhalt_u - 0.06, inhalt_u, inhalt_u + 0.06, inhalt_u + 0.12)]
                if any(frei(*k) for k in plaetze):
                    wahl = (mtext.waehle_platz(plaetze, frei, rng), anteil, halb_b)
                    break
            if wahl:
                break
        if not wahl:  # Notfall: kleinste Größe, oben auf der Inhaltsseite, am Rand gehalten
            halb_b = min(0.46, len(wort) * anteil * 0.8 * HOEHE / BREITE / 2)
            wahl = ([min(max(inhalt_u, halb_b + 0.01), 0.99 - halb_b), 0.14], anteil, halb_b)
        (u_t, v_t), anteil, halb_b = wahl
        grund = farben.mittel(u_t - halb_b, v_t - anteil / 2, u_t + halb_b, v_t + anteil / 2)
        farbname = spec.get("wort_farbe") or mtext.waehle_farbe(grund, rng, ohne=("rot",) if ziel else ())
        t = _textobjekt(wort, spec.get("schrift"), h_e * anteil, mtext.linear(mtext.PALETTE.get(farbname, (1, 1, 1))))
        t.location = punkt(u_t, v_t)
        kipp = mtext.neigung(rng)
        t.rotation_euler = (math.radians(90), math.radians(kipp), 0)
        info["wort"] = {"platz": [round(u_t, 3), round(v_t, 3)], "neigung": round(kipp, 1), "farbe": farbname}
    else:
        u_t, v_t, halb_b = inhalt_u, 0.16, 0.0
    if spec.get("pfeil_ziel"):
        zu, zv = spec["pfeil_ziel"]
        # Pfeil beginnt am Rand des Worts, auf der Seite zum Ziel
        v_start = v_t + (0.14 if zv > v_t else -0.14)
        if not 0.06 < v_start < 0.94:  # Ziel auf Höhe des Worts: seitlich am Wort starten
            v_start = v_t
            u_t = u_t + (halb_b + 0.03 if zu > u_t else -halb_b - 0.03) if spec.get("wort") else u_t
        start = punkt(u_t + (0.0 if abs(zu - u_t) > 0.1 else -0.08), v_start)
        ende = punkt(zu, zv - 0.06 if zv > v_start else zv + 0.06)
        _pfeil(start, ende, h_e * 0.03)
        info["pfeil"] = [zu, zv]
    if spec.get("spiel"):
        # Spielname als Logo in der unteren Ecke gegenüber der Figur, 12–20 % der Bildbreite (Stilbuch 14.7)
        name = _textobjekt(spec["spiel"].upper(), spec.get("schrift"), h_e * 0.075, (1, 0.85, 0.2))
        name.location = punkt(0.84 if seite == "links" else 0.16, 0.9)
        name.rotation_euler = (math.radians(90), 0, 0)
        info["spiel"] = spec["spiel"]
    if spec.get("logo") and os.path.exists(spec["logo"]):
        logo = _bildflaeche(spec["logo"], cam, ebene, name="logo", helligkeit=1.0)
        logo.scale = (0.16, 0.16, 0.16)
        logo.location = punkt(0.86 if seite == "links" else 0.14, 0.86)

    scene.render.engine = "CYCLES"
    mlook.gpu_einrichten(scene, spec.get("geraet", "CPU"))
    scene.cycles.samples = spec.get("samples", 48)
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -0.2
    mlook.farbkorrektur(scene, 1.05, 1.04, 0.35)
    bpy.context.view_layer.update()
    ecken = [world_to_camera_view(scene, cam, c) for c in fig.kopf_ecken()]
    info["kopf_box"] = [min(e.x for e in ecken), 1 - max(e.y for e in ecken), max(e.x for e in ecken), 1 - min(e.y for e in ecken)]
    if ausgabe:
        scene.render.filepath = ausgabe
        bpy.ops.render.render(write_still=True)
    if bericht:
        import json

        with open(bericht, "w", encoding="utf-8") as fh:
            json.dump(info, fh, ensure_ascii=False, indent=1)
    return info
