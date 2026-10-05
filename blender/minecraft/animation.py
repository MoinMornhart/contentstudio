# Herkunft: MoinStudio blender/moin/animation.py (MIT), v0.44.0.
"""Animation: kurze bewegte Szenen mit dem Skin des Creators – Intro-Sting, Endcard, Grafik-Clips.

Die Figur hat kein Rig mit Knochen: Ellbogen und Knie verformen das Netz direkt (figur._beuge). Deshalb wird Bild für
Bild gearbeitet: Zwischenpose ausrechnen (weich zwischen Schlüsselposen), setzen, Kamera setzen, rendern. So nutzt die
Animation genau die Posen, Mimiken, Skins und Welten der Thumbnails.

Beschreibung (JSON):
{
  "breite": 1920, "hoehe": 1080, "fps": 30, "dauer": 2.0,
  "hintergrund": "transparent" | "welt",          # transparent: Video mit Alphakanal für den Schnitt
  "welt": {...}, "himmel": "tag",                   # nur bei "welt" (wie im Thumbnail)
  "figuren": [{"id": "ich", "skin": "...png", "slim": null,
               "schluessel": [{"zeit": 0.0, "pose": "neutral", "posen_korrektur": {...}, "position": [x, y, z],
                               "blick": 0, "mimik": "freude"}]}],
  "kamera": {"schluessel": [{"zeit": 0.0, "position": [x, y, z], "ziel": [x, y, z], "linse": 35}]},
  "licht": {"rand": [0.3, 0.85, 1.0], "staerke": 1.0},
  "samples": 16, "geraet": "CPU"
}
Positionen in Blöcken wie im Thumbnail. Ausgabe: <ordner>/bild_0001.png … (RGBA bei transparent).
"""
import math
import os

import bpy
from mathutils import Vector

from . import figur as mfigur
from . import himmel as mhimmel
from . import look as mlook
from . import mimik as mmimik
from .bloecke import BLOCK
from .posen import POSEN


def weich(t):
    """Ease-in-out (Smootherstep): Bewegungen beschleunigen und bremsen wie von Hand animiert."""
    t = min(1.0, max(0.0, t))
    return t * t * t * (t * (t * 6 - 15) + 10)


def _pose_von(s):
    p = POSEN.get(s.get("pose", "neutral"), POSEN["neutral"]) if isinstance(s.get("pose", "neutral"), str) else s["pose"]
    neu = {k: (dict(v) if isinstance(v, dict) else v) for k, v in p.items()}
    for k, v in (s.get("posen_korrektur") or {}).items():
        if isinstance(v, dict):
            neu.setdefault(k, {}).update(v)
        else:
            neu[k] = v
    if "blick" in s:
        neu["blick"] = s["blick"]
    return neu


def mische_pose(a, b, t):
    """Zwischenpose: jede Zahl linear zwischen a und b (fehlende Werte gelten als 0)."""
    neu = {}
    for k in set(a) | set(b):
        va, vb = a.get(k), b.get(k)
        if isinstance(va, dict) or isinstance(vb, dict):
            neu[k] = mische_pose(va or {}, vb or {}, t)
        elif isinstance(va, (int, float)) or isinstance(vb, (int, float)):
            x, y = float(va or 0), float(vb or 0)
            neu[k] = x + (y - x) * t
        else:
            neu[k] = vb if t >= 0.5 else va
    return neu


def zwischen(schluessel, zeit):
    """(vorher, nachher, t) für einen Zeitpunkt – t schon weich gemacht."""
    s = sorted(schluessel, key=lambda k: k.get("zeit", 0))
    if zeit <= s[0].get("zeit", 0):
        return s[0], s[0], 0.0
    for a, b in zip(s, s[1:]):
        if a.get("zeit", 0) <= zeit <= b.get("zeit", 0):
            dauer = max(1e-6, b["zeit"] - a["zeit"])
            return a, b, weich((zeit - a["zeit"]) / dauer)
    return s[-1], s[-1], 0.0


def _vek(a, b, t, schluessel, standard):
    va, vb = Vector(a.get(schluessel, standard)), Vector(b.get(schluessel, standard))
    if len(va) == 2:
        va = Vector((va.x, va.y, 0))
    if len(vb) == 2:
        vb = Vector((vb.x, vb.y, 0))
    return va.lerp(vb, t)


def baue(beschreibung, texturen, ordner):
    """Rendert alle Bilder der Animation nach `ordner`. Gibt die Bildanzahl zurück."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    d = beschreibung
    scene.render.resolution_x = d.get("breite", 1920)
    scene.render.resolution_y = d.get("hoehe", 1080)
    fps = d.get("fps", 30)
    bilder = max(1, round(d.get("dauer", 2.0) * fps))
    transparent = d.get("hintergrund", "transparent") == "transparent"

    if not transparent and d.get("welt"):
        from . import szene as mszene
        mszene._welt(d["welt"], texturen, d.get("himmel", "tag"))
    mhimmel.baue(scene, d.get("himmel", "tag"))
    scene.render.film_transparent = transparent

    figuren = []
    for f in d.get("figuren", []):
        fig = mfigur.baue_figur(f["id"], f["skin"], slim=f.get("slim"))
        figuren.append((f, fig))

    cam_data = bpy.data.cameras.new("kamera")
    cam = bpy.data.objects.new("kamera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.clip_end = 5000

    # Licht: Gesicht von vorn, farbiges Randlicht von hinten (wie im Thumbnail)
    licht = d.get("licht", {})
    rand = bpy.data.lights.new("rand", "AREA")
    rand.energy = 650 * licht.get("staerke", 1.0)
    rand.size = 1.2
    rand.color = tuple(licht.get("rand", (0.3, 0.85, 1.0)))
    rand_ob = bpy.data.objects.new("rand", rand)
    rand_ob.visible_camera = False
    scene.collection.objects.link(rand_ob)
    gesicht = None

    scene.render.engine = "CYCLES"
    mlook.gpu_einrichten(scene, d.get("geraet", "CPU"))
    scene.cycles.samples = d.get("samples", 16)
    scene.cycles.use_denoising = True
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        pass
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    os.makedirs(ordner, exist_ok=True)

    mimik_jetzt = {}
    for nr in range(bilder):
        zeit = nr / fps
        for f, fig in figuren:
            a, b, t = zwischen(f["schluessel"], zeit)
            mfigur.pose(fig, mische_pose(_pose_von(a), _pose_von(b), t))
            pos = _vek(a, b, t, "position", (0, 0, 0)) * BLOCK
            fig.wurzel.location = pos
            mimik = (b if t >= 0.5 else a).get("mimik")
            if mimik != mimik_jetzt.get(f["id"]):
                for ob in [o for o in bpy.data.objects if o.name.startswith(f"{f['id']}.") and ".mimik" in o.name]:
                    bpy.data.objects.remove(ob, do_unlink=True)
                if mimik:
                    mmimik.setze_mimik(fig, mimik)
                mimik_jetzt[f["id"]] = mimik
        ka, kb, kt = zwischen(d["kamera"]["schluessel"], zeit)
        cam.location = _vek(ka, kb, kt, "position", (0, -6, 2)) * BLOCK
        ziel = _vek(ka, kb, kt, "ziel", (0, 0, 1.5)) * BLOCK
        cam.rotation_euler = (ziel - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam_data.lens = ka.get("linse", 35) + (kb.get("linse", 35) - ka.get("linse", 35)) * kt
        bpy.context.view_layer.update()
        if figuren:
            haupt = figuren[0][1]
            kopf = haupt.kopf_mitte()
            hinten = (kopf - cam.location).normalized()
            rand_ob.location = kopf + hinten * 2.2 + Vector((0, 0, 1.2))
            rand_ob.rotation_euler = (kopf - rand_ob.location).to_track_quat("-Z", "Y").to_euler()
            if gesicht is not None:
                bpy.data.objects.remove(gesicht, do_unlink=True)
            gesicht = mlook.gesichtslicht(scene, cam, kopf, 40.0 * licht.get("staerke", 1.0))
        scene.frame_set(nr + 1)
        scene.render.filepath = os.path.join(ordner, f"bild_{nr + 1:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"CS_BILD {nr + 1}/{bilder}", flush=True)
    return bilder


def drehung_um(winkel_grad, abstand, hoehe, ziel=(0, 0, 1.5)):
    """Kamerapunkt auf einem Kreis um `ziel` (Blöcke) – für Kamerafahrten im Sting."""
    w = math.radians(winkel_grad)
    return [ziel[0] + math.sin(w) * abstand, ziel[1] - math.cos(w) * abstand, ziel[2] + hoehe]
