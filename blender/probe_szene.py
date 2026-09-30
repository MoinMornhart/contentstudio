"""Probe für ROADMAP 4.3/4.4: Figur an der Klippe mit echter Blockwelt, Minecraft-Wolken und Stilbuch-Licht.

blender -b --factory-startup --python blender/probe_szene.py -- <skin.png> <texturen-ordner> <ausgabe.png> [pose]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from minecraft import figur as mfigur  # noqa: E402
from minecraft import welt as mwelt  # noqa: E402
from minecraft import kamera as mkamera  # noqa: E402
from minecraft.bloecke import BLOCK  # noqa: E402
from minecraft.posen import POSEN  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
skin, tex, out = args[0], args[1], args[2]
pose_name = args[3] if len(args) > 3 else "blick_zum_ding"
env = os.environ.get

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

fig = mfigur.baue_figur("ich", skin)
mfigur.pose(fig, POSEN[pose_name])
mwelt.baue_klippe(tex, kante=int(env("CS_KANTE", "2")), tiefe=int(env("CS_TIEFE", "20")), gegenseite=env("CS_GEGENSEITE", "1") == "1")
mwelt.wolken(tex)

# Himmel mit Wolken und Sonne (Stilbuch 6/7.2)
from minecraft import himmel as mhimmel  # noqa: E402
mhimmel.baue(scene, env("CS_HIMMEL_ART", "tag"))

# Randlicht hinten auf der abgewandten Seite
rand = bpy.data.lights.new("rand", "AREA")
rand.energy = 520
rand.size = 1.2
ro = bpy.data.objects.new("rand", rand)
scene.collection.objects.link(ro)
ro.location = (-1.8, 2.2, 2.6)
ro.rotation_euler = (Vector((0, 0, 1.6)) - ro.location).to_track_quat("-Z", "Y").to_euler()

# Kamera: Nahaufnahme, Figur links am Rand, Blick leicht von oben in den Abgrund rechts
kopf = fig.kopf_mitte()
cam_data = bpy.data.cameras.new("kamera")
cam = bpy.data.objects.new("kamera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
kante, tiefe = int(env("CS_KANTE", "2")), int(env("CS_TIEFE", "20"))
# Thema: ein Punkt unten im Abgrund, knapp hinter der Kante
thema = Vector(((kante + float(env("CS_TX", "10"))) * BLOCK, float(env("CS_TY", "9")) * BLOCK, -tiefe * float(env("CS_TZ", "0.7")) * BLOCK))
oben, unten = fig.kopf_punkte()
fehler = mkamera.rahme(scene, cam, oben, unten, thema, env("CS_MODUS", "gefahr"), seite=env("CS_SEITE", "links"), gesicht=fig.gesicht_richtung(),
                       erlaubt=(lambda p: p.x > (kante + 2.5) * BLOCK) if env("CS_MODUS") == "abgrund" else None)
print("CS_KAMERA", round(fehler, 4))
cam_data.dof.aperture_fstop = float(env("CS_BLENDE", "4"))
cam_data.clip_end = 5000

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(env("CS_SAMPLES", "48"))
scene.cycles.use_denoising = True
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
# Dunst in der Tiefe (Stilbuch 6): leichter Nebel über die Welt-Volumen wäre teuer – Mist-Pass fehlt noch, später
try:
    scene.view_settings.view_transform = env("CS_VIEW", "Standard")
    scene.view_settings.look = env("CS_LOOK", "Medium High Contrast")
except TypeError:
    pass
scene.view_settings.exposure = float(env("CS_BELICHTUNG", "-0.3"))
scene.render.filepath = out
if env("CS_NUR_KAMERA"):
    sys.exit(0)
bpy.ops.render.render(write_still=True)
print("CS_OK", out)
