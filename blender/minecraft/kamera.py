"""Kamera nach Stilbuch (ROADMAP 4.5): Die Kamera wird nicht geraten, sondern so gesucht, dass Kopf und Thema dort im
Bild landen, wo die Vorbilder sie haben.

Stilbuch 5 (K1 Nahaufnahme am Rand): 20–28 mm, Kopf 35–55 % der Bildhöhe, Figur am Rand, das Thema in der anderen
Bildhälfte, nie exakt frontal auf Augenhöhe; Gefahr/Abgrund mit Aufsicht, Held mit leichter Untersicht.
"""
import math

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

# Modi: Brennweite, Kopfanteil an der Bildhöhe, Kopf-Lage (u, v; 0,0 = unten links), Wunschlage des Themas,
# Höhenwinkel (positiv = Kamera höher als der Kopf, schaut hinab)
# Brennweiten nach Recherche (30.09.): Nahaufnahme lang, damit Gesicht und nahe Dinge nicht verzerren (Kinoregel
# 85–100 mm, hier 50 mm als Mittelweg mit etwas Minecraft-Dynamik), halbe Figur ~45 mm, ganze Figur ~30 mm.
# Luftaufnahmen über Abgründen (tiefe, abgrund, klippe_wand) bleiben weitwinklig.
MODI = {
    # Kopf höchstens gut ein Drittel der Bildhöhe (Vergleich mit BastiGHG 30.09.: 42 % wirkte erdrückend, Gesicht oft angeschnitten)
    "nah": {"linse": 50, "kopf_anteil": 0.34, "kopf_uv": (0.27, 0.58), "thema_uv": (0.72, 0.45), "hoehe": 10},
    # 40 statt 30 mm und etwas kleiner: der Weitwinkel blähte zur Kamera gestreckte Arme riesig auf, und die Gefahr selbst
    # (Lava, Abgrund) braucht Platz im Bild (Freiform-Pilot 05.10.)
    "gefahr": {"linse": 40, "kopf_anteil": 0.27, "kopf_uv": (0.24, 0.62), "thema_uv": (0.70, 0.30), "hoehe": 18},
    "tiefe": {"linse": 22, "kopf_anteil": 0.13, "kopf_uv": (0.32, 0.72), "thema_uv": (0.60, 0.20), "hoehe": 42},
    "klippe": {"linse": 32, "kopf_anteil": 0.30, "kopf_uv": (0.26, 0.66), "thema_uv": (0.72, 0.30), "hoehe": 4},
    "klippe_wand": {"linse": 22, "kopf_anteil": 0.18, "kopf_uv": (0.30, 0.74), "thema_uv": (0.58, 0.28), "hoehe": 12},
    "abgrund": {"linse": 20, "kopf_anteil": 0.13, "kopf_uv": (0.40, 0.78), "thema_uv": (0.52, 0.16), "hoehe": 26},
    # von unten mit längerer Brennweite: 22 mm nah von unten bläst die Beine auf (MoinStudio, 30.09.)
    "held": {"linse": 35, "kopf_anteil": 0.30, "kopf_uv": (0.30, 0.62), "thema_uv": (0.72, 0.50), "hoehe": -5},
    # Kampf/Duell (GommeHD-Duelle; MoinStudio, 30.09.: nicht immer er riesig vorn): beide gleich groß auf gleicher Höhe,
    # längere Brennweite gegen perspektivisches Aufblähen, Kamera fast auf Augenhöhe
    "kampf": {"linse": 45, "kopf_anteil": 0.17, "kopf_uv": (0.30, 0.42), "thema_uv": (0.70, 0.42), "hoehe": 2},
    "brust": {"linse": 45, "kopf_anteil": 0.26, "kopf_uv": (0.30, 0.68), "thema_uv": (0.70, 0.45), "hoehe": 5},
    # Mob als Thema (BastiGHG, Paluten): Figur halbnah links, Mob groß rechts auf Augenhöhe – statt Riesenkopf mit winzigem Mob
    "mob": {"linse": 45, "kopf_anteil": 0.17, "kopf_uv": (0.30, 0.44), "thema_uv": (0.68, 0.46), "hoehe": 3},
    # Ganze Figur mit Umgebung (Freiform-Test): für besondere Orte und Körperhaltungen (Yoga, Handstand, Klettern, Surfen),
    # damit Ort und Handlung zu sehen sind statt nur ein großer Kopf
    # 35 statt 30 mm: Weitwinkel bläst die Beine am unteren Bildrand auf (Noob/Pro, 01.10.)
    "ganz": {"linse": 35, "kopf_anteil": 0.12, "kopf_uv": (0.30, 0.72), "thema_uv": (0.70, 0.42), "hoehe": 10},
}

# Dreiviertelprofil: Winkel zwischen Blickrichtung des Gesichts und Richtung zur Kamera (Stilbuch: 20–45°)
PROFIL_GRAD = 32

# nach rahme(): die besten verschiedenen Kamera-Vorschläge (Abweichung, Linse, Matrix, Azimut, Höhe)
KANDIDATEN = []


def _blick_matrix(pos, richtung):
    """Kameramatrix an `pos`, schaut entlang `richtung` (Hochachse bleibt oben)."""
    rot = richtung.to_track_quat("-Z", "Y").to_matrix().to_4x4()
    return Matrix.Translation(pos) @ rot


def _bewerte(scene, cam, pos, ziel, kopf, kopf_oben, kopf_unten, thema, m, kopf_uv, thema_uv, seite, gesicht, thema_gesicht=None):
    cam.matrix_world = _blick_matrix(pos, ziel - pos)
    pk = world_to_camera_view(scene, cam, kopf)
    pt = world_to_camera_view(scene, cam, thema)
    if pk.z <= 0 or pt.z <= 0:
        return None
    po = world_to_camera_view(scene, cam, kopf_oben)
    pu = world_to_camera_view(scene, cam, kopf_unten)
    fehler = ((pk.x - kopf_uv[0]) ** 2 + (pk.y - kopf_uv[1]) ** 2) * 4
    # Thema: muss in seiner Bildhälfte liegen (Bereich statt Punkt), sanft zur Wunschstelle gezogen
    tx0, tx1 = (0.55, 0.95) if seite == "links" else (0.05, 0.45)
    raus = max(0.0, tx0 - pt.x) + max(0.0, pt.x - tx1) + max(0.0, 0.08 - pt.y) + max(0.0, pt.y - 0.75)
    # das Thema ist der Grund des Bildes: liegt es außerhalb seines Bereichs, muss das mehr kosten als ein nicht ganz
    # perfekter Gesichtswinkel (Test 30.09.: Riesen-Creeper am Rand, weil 5 % daneben nur 0,02 kostete)
    fehler += raus * 30 + raus * raus * 40 + ((pt.x - thema_uv[0]) ** 2 + (pt.y - thema_uv[1]) ** 2) * 0.15
    fehler += ((po.y - pu.y) - m["kopf_anteil"]) ** 2 * 3
    if gesicht is not None:
        d = gesicht.dot((pos - kopf).normalized())
        fehler += (d - math.cos(math.radians(PROFIL_GRAD))) ** 2 * 3 + (10 if d < 0.2 else 0)
        # Das Gesicht schaut zur Bildmitte (zum Thema), nie aus dem Bild hinaus
        rechts = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
        zur_mitte = gesicht.dot(rechts) * (1 if seite == "links" else -1)
        fehler += 6 if zur_mitte < 0.05 else 0
    if thema_gesicht is not None:
        # Ist das Thema eine Figur (Duell, „ich gegen meinen Freund“), muss auch ihr Gesicht zu sehen sein – sonst stand die
        # Kamera vor der Hauptfigur und zeigte den Gegner von hinten (Test 01.10.)
        d2 = thema_gesicht.dot((pos - thema).normalized())
        fehler += max(0.0, 0.45 - d2) ** 2 * 12 + (8 if d2 < 0.1 else 0)
    return fehler, (round(pk.x, 2), round(pk.y, 2)), (round(pt.x, 2), round(pt.y, 2)), round(po.y - pu.y, 2)


def _rand_strafe(scene, cam, ecken, rand=0.05):
    """Wie weit Punkte (z. B. die Kopf-Ecken) aus dem Bild ragen: 0, wenn alle mit Abstand `rand` drin sind."""
    strafe = 0.0
    for p in ecken:
        v = world_to_camera_view(scene, cam, p)
        strafe += max(0.0, rand - v.x) + max(0.0, v.x - (1 - rand)) + max(0.0, rand - v.y) + max(0.0, v.y - (1 - rand))
    return strafe


def rahme(scene, cam, kopf_oben, kopf_unten, thema, modus="nah", seite="links", gesicht=None, erlaubt=None, kopf_ecken=None, still=False, anpassung=None, thema_gesicht=None):
    """Sucht Brennweite, Position und Blickrichtung. `seite`: wo die Figur im Bild steht (das Thema gegenüber).
    `gesicht`: Blickrichtung des Kopfes (Weltvektor); die Kamera sieht das Gesicht im Dreiviertelprofil, nie von
    hinten. `erlaubt(pos)`: optionale Vorgabe, wo die Kamera stehen darf (z. B. über dem Abgrund).
    `kopf_ecken`: Weltpunkte des Kopfes – der ganze Kopf muss im Bild bleiben (nie am Rand angeschnitten).
    Gibt die Abweichung (0 = perfekt) zurück."""
    m = dict(MODI[modus], **(anpassung or {}))  # z. B. {"hoehe": 12} für mehr Aufsicht in einer Szene
    kopf_uv = m["kopf_uv"] if seite == "links" else (1 - m["kopf_uv"][0], m["kopf_uv"][1])
    thema_uv = m["thema_uv"] if seite == "links" else (1 - m["thema_uv"][0], m["thema_uv"][1])
    kopf = (kopf_oben + kopf_unten) / 2
    kopf_h = (kopf_oben - kopf_unten).length
    richtung = (thema - kopf).normalized()
    gesicht = gesicht.normalized() if gesicht is not None else None
    thema_gesicht = thema_gesicht.normalized() if thema_gesicht is not None else None
    sensor_h = cam.data.sensor_width * scene.render.resolution_y / scene.render.resolution_x
    beste = None
    alle = []
    bpy.context.view_layer.update()
    tiefe = bpy.context.evaluated_depsgraph_get()
    for linse in sorted({max(18, m["linse"] - 4), m["linse"], m["linse"] + 4}):
        cam.data.lens = linse
        vfov = 2 * math.atan(sensor_h / 2 / linse)
        abstand = kopf_h / m["kopf_anteil"] / (2 * math.tan(vfov / 2))
        for az_deg in range(-180, 180, 6):
            az = math.radians(az_deg)
            for dh in (-6, -3, 0, 3, 6):
                el = math.radians(m["hoehe"] + dh)
                pos = kopf + Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))) * abstand
                if erlaubt and not erlaubt(pos):
                    continue
                # freie Sicht auf den Kopf? Mit längeren Brennweiten steht die Kamera weiter weg (Nahaufnahme ~3 Blöcke) –
                # in Höhlen, Häusern und Wäldern darf sie nicht in einer Wand stecken
                strahl = kopf - pos
                versperrt, *_ = scene.ray_cast(tiefe, pos, strahl.normalized(), distance=max(0.0, strahl.length - 0.35))
                wand = 20.0 if versperrt else 0.0
                for i in range(16):  # Blickziel: 0–3 m vom Kopf Richtung Thema
                    ziel = kopf + richtung * (i * 0.2)
                    r = _bewerte(scene, cam, pos, ziel, kopf, kopf_oben, kopf_unten, thema, m, kopf_uv, thema_uv, seite, gesicht, thema_gesicht)
                    if r and kopf_ecken:
                        r = (r[0] + 25.0 * _rand_strafe(scene, cam, kopf_ecken),) + tuple(r[1:])
                    if r and wand:
                        r = (r[0] + wand,) + tuple(r[1:])
                    if r:
                        alle.append((r[0], linse, az_deg, m["hoehe"] + dh, i))
                    if r and (beste is None or r[0] < beste[0]):
                        beste = (r[0], cam.matrix_world.copy(), linse, r[1], r[2], r[3], az_deg, m["hoehe"] + dh)
    # Weitere gute, deutlich verschiedene Vorschläge für die Bildprüfung (Schwert im Bild, Gesichter frei)
    KANDIDATEN.clear()
    for f, linse, az_deg, el_deg, i in sorted(alle):
        if len(KANDIDATEN) >= 6 or f > beste[0] + 0.6:
            break
        if any(abs(az_deg - a) < 12 and abs(el_deg - e) < 4 for _, _, _, a, e in KANDIDATEN):
            continue
        cam.data.lens = linse
        vfov = 2 * math.atan(sensor_h / 2 / linse)
        abstand = kopf_h / m["kopf_anteil"] / (2 * math.tan(vfov / 2))
        az, el = math.radians(az_deg), math.radians(el_deg)
        pos = kopf + Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))) * abstand
        KANDIDATEN.append((f, linse, _blick_matrix(pos, kopf + richtung * (i * 0.2) - pos), az_deg, el_deg))
    # Thema (z. B. Riesen-Creeper) passt nicht ins Bild: mit kleinerem Kopf, also weiter weg, noch einmal suchen –
    # höchstens zweimal (Test 30.09.: „Level 19 – Riesen-Creeper“ lag bei 104 % der Bildbreite, der Creeper fehlte)
    tu, tv = beste[4]
    stufe = (anpassung or {}).get("_weiter", 0)
    if (tu < 0.03 or tu > 0.97 or tv < 0.03 or tv > 0.97) and stufe < 2:
        weiter = dict(anpassung or {}, kopf_anteil=m["kopf_anteil"] * 0.72, _weiter=stufe + 1)
        return rahme(scene, cam, kopf_oben, kopf_unten, thema, modus, seite, gesicht, erlaubt, kopf_ecken, still, weiter, thema_gesicht)
    cam.data.lens = beste[2]
    cam.matrix_world = beste[1]
    if not still:
        print("CS_RAHMEN linse", beste[2], "kopf", beste[3], "thema", beste[4], "kopfanteil", beste[5], "azimut", beste[6], "hoehe", beste[7])
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (kopf - cam.matrix_world.translation).length
    bpy.context.view_layer.update()
    return beste[0]
