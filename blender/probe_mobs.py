"""Prüfbogen aller Mobs (MoinStudio, 30.09.: „Mobs nochmal anschauen, dass da keine Grafikfehler entstehen, auch nicht wie
beim Piglin die Ohren fehlen“): jeder Mob einzeln, schräg von vorn vor neutralem Grund, als Kachel. Daraus setzt
das Test-Skript Bogen zusammen.

blender -b --factory-startup --python blender/probe_mobs.py -- <mob_tabelle.json> <texturen> <ausgabeordner> [von] [bis]
Schreibt <ausgabeordner>/<art>.png (512×512) und CS_MOB <art> <ok|fehler> je Mob.
"""
import math
import os
import sys
import traceback

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from minecraft import mobs as mmobs  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
tabelle_pfad, texturen, aus = args[0], args[1], os.path.abspath(args[2])  # Blender deutet relative Pfade anders
von = int(args[3]) if len(args) > 3 else 0
bis = int(args[4]) if len(args) > 4 else 9999
os.makedirs(aus, exist_ok=True)
tab = mmobs.tabelle(tabelle_pfad)
arten = sorted(tab)[von:bis]


def szene_leeren():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.film_transparent = False
    welt = bpy.data.worlds.new("welt")
    scene.world = welt
    welt.use_nodes = True
    bg = welt.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.62, 0.7, 1)
    bg.inputs["Strength"].default_value = 1.0
    sonne = bpy.data.lights.new("sonne", "SUN")
    sonne.energy = 3.5
    o = bpy.data.objects.new("sonne", sonne)
    o.rotation_euler = (math.radians(50), 0, math.radians(-30))
    scene.collection.objects.link(o)
    return scene


for art in arten:
    try:
        scene = szene_leeren()
        mob = mmobs.baue_mob(art, tab[art], texturen, name=art)
        bpy.context.view_layer.update()
        punkte = [ob.matrix_world @ Vector(c) for ob in mob.teile.values() for c in ob.bound_box]
        if not punkte:
            raise RuntimeError("keine Teile")
        lo = Vector((min(p.x for p in punkte), min(p.y for p in punkte), min(p.z for p in punkte)))
        hi = Vector((max(p.x for p in punkte), max(p.y for p in punkte), max(p.z for p in punkte)))
        mitte = (lo + hi) / 2
        groesse = max((hi - lo).length, 0.3)
        cam_d = bpy.data.cameras.new("kamera")
        cam_d.lens = 50
        cam = bpy.data.objects.new("kamera", cam_d)
        scene.collection.objects.link(cam)
        scene.camera = cam
        # schräg von vorn (Mobs schauen nach −Y), leicht von oben
        richtung = Vector((math.sin(math.radians(-35)), -math.cos(math.radians(-35)), 0.35)).normalized()
        cam.location = mitte + richtung * groesse * 1.9
        cam.rotation_euler = (mitte - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(aus, f"{art}.png")
        bpy.ops.render.render(write_still=True)
        print("CS_MOB", art, "ok", flush=True)
    except Exception as fehler:
        print("CS_MOB", art, "fehler", str(fehler).replace("\n", " ")[:200], flush=True)
        traceback.print_exc()
