"""Probe für ROADMAP 4.1/4.2: eine Figur in einer Stilbuch-Pose, Nahaufnahme mit Stilbuch-Licht.

blender -b --factory-startup --python blender/probe_figur.py -- <skin.png> <ausgabe.png> <pose> [kamera: nah|brust|ganz|schraeg]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from minecraft import figur as mfigur  # noqa: E402
from minecraft.posen import POSEN  # noqa: E402
from minecraft import items as mitems  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
skin, out, pose_name = args[0], os.path.abspath(args[1]), args[2]  # Blender deutet relative Pfade anders
modus = args[3] if len(args) > 3 else "nah"

# leere Szene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

fig = mfigur.baue_figur("ich", skin)
mfigur.pose(fig, POSEN[pose_name])

# Boden (neutral), damit Schatten und Umgebungsverdeckung sichtbar sind
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
boden = bpy.context.active_object
bm = bpy.data.materials.new("boden")
bm.use_nodes = True
bm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.45, 0.22, 1)
bm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
boden.data.materials.append(bm)

# Himmel: kräftiges Cyan-Blau (Stilbuch 6/7.2) als Umgebungslicht
world = bpy.data.worlds.new("himmel")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.10, 0.42, 1.0, 1)
bg.inputs["Strength"].default_value = float(os.environ.get("CS_HIMMEL", "1.1"))

# Sonne: 35–55° hoch, Winkel 2–6°, von vorn-seitlich
sonne = bpy.data.lights.new("sonne", "SUN")
sonne.energy = 5.0
sonne.angle = math.radians(4)
sonne.color = (1.0, 0.95, 0.86)
so = bpy.data.objects.new("sonne", sonne)
scene.collection.objects.link(so)
so.rotation_euler = (math.radians(46), 0, math.radians(38))  # von vorn und von der Themenseite (+X): Gesicht am hellsten

# Randlicht von hinten oben (1,5–3-fach der Sonne auf der Kante, Stilbuch 6)
rand = bpy.data.lights.new("rand", "AREA")
rand.energy = 520
rand.size = 1.2
rand.color = (1.0, 0.97, 0.92)
ro = bpy.data.objects.new("rand", rand)
scene.collection.objects.link(ro)
ro.location = (-1.8, 2.2, 2.6)  # hinten auf der abgewandten Seite: helle Kante an Hinterkopf und Schulter
ro.rotation_euler = (Vector((0, 0, 1.6)) - ro.location).to_track_quat("-Z", "Y").to_euler()

# Kamera nach Stilbuch-Modus
kopf = fig.kopf_mitte()
cam_data = bpy.data.cameras.new("kamera")
cam = bpy.data.objects.new("kamera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
if modus == "nah":
    cam_data.lens = 24
    ziel = kopf + Vector((0.35, 0, -0.18))
    cam.location = kopf + Vector((0.55, -1.25, -0.12))
elif modus == "brust":
    cam_data.lens = 35
    ziel = kopf + Vector((0.25, 0, -0.45))
    cam.location = kopf + Vector((0.5, -2.3, -0.3))
elif modus == "schraeg":  # Dreiviertel von der Seite: gebeugte Beine (Sitzen, Knien, Klettern) frontal verkürzt
    cam_data.lens = 50
    ziel = Vector((0, 0, 0.8))
    cam.location = Vector((3.9, -3.9, 1.6))
else:
    cam_data.lens = 50
    ziel = Vector((0, 0, 0.95))
    cam.location = Vector((0.6, -5.2, 1.1))
cam.rotation_euler = (ziel - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_data.dof.use_dof = True
cam_data.dof.focus_distance = (kopf - cam.location).length
cam_data.dof.aperture_fstop = 2.8

# gehaltenes Item (Stilbuch 4), erst nach der Kamera ausrichten
if os.environ.get("CS_ITEM"):
    it = mitems.baue_item(os.environ["CS_ITEM"], os.environ["CS_TEX"])
    mitems.in_die_hand(it, fig, os.environ.get("CS_HAND", "r"), cam)

# Render: Cycles, AgX mit mittelhohem Kontrast
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(os.environ.get("CS_SAMPLES", "48"))
scene.cycles.use_denoising = True
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.film_transparent = False
try:
    scene.view_settings.view_transform = os.environ.get("CS_VIEW", "AgX")
    scene.view_settings.look = os.environ.get("CS_LOOK", "AgX - Punchy")
except TypeError:
    pass
scene.view_settings.exposure = float(os.environ.get("CS_BELICHTUNG", "0"))
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("CS_OK", out)
