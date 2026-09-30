"""Baut den GLB-Test-Avatar für die 3D-Modell-Engine (ROADMAP 4.3): einfache Figur aus Quadern mit Skelett
(Mixamo-Namen) in T-Pose, Gesicht nach −Y. Keine fremden Inhalte – alles hier erzeugt.

blender -b --factory-startup --python tests/fixtures/avatar_bauen.py -- <ziel.glb>
"""
import sys

import bpy
from mathutils import Vector

ziel = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, farbe):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*farbe, 1)
    return m


HAUT = material("Haut", (0.9, 0.66, 0.52))
SHIRT = material("Shirt", (0.1, 0.45, 0.9))
HOSE = material("Hose", (0.12, 0.12, 0.18))
AUGE = material("Auge", (0.02, 0.02, 0.03))
HAAR = material("Haar", (0.35, 0.18, 0.06))

arm_d = bpy.data.armatures.new("Skelett")
arm = bpy.data.objects.new("Avatar", arm_d)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
KNOCHEN = {
    "Hips": ((0, 0, 0.95), (0, 0, 1.1), None),
    "Spine2": ((0, 0, 1.1), (0, 0, 1.45), "Hips"),
    "Neck": ((0, 0, 1.45), (0, 0, 1.55), "Spine2"),
    "Head": ((0, 0, 1.55), (0, 0, 1.8), "Neck"),
    "LeftArm": ((0.2, 0, 1.42), (0.48, 0, 1.42), "Spine2"),
    "LeftForeArm": ((0.48, 0, 1.42), (0.75, 0, 1.42), "LeftArm"),
    "RightArm": ((-0.2, 0, 1.42), (-0.48, 0, 1.42), "Spine2"),
    "RightForeArm": ((-0.48, 0, 1.42), (-0.75, 0, 1.42), "RightArm"),
    "LeftUpLeg": ((0.1, 0, 0.95), (0.1, 0, 0.5), "Hips"),
    "RightUpLeg": ((-0.1, 0, 0.95), (-0.1, 0, 0.5), "Hips"),
    "LeftLeg": ((0.1, 0, 0.5), (0.1, 0, 0.05), "LeftUpLeg"),
    "RightLeg": ((-0.1, 0, 0.5), (-0.1, 0, 0.05), "RightUpLeg"),
}
for name, (kopf, schwanz, eltern) in KNOCHEN.items():
    b = arm_d.edit_bones.new(name)
    b.head, b.tail = kopf, schwanz
    if eltern:
        b.parent = arm_d.edit_bones[eltern]
bpy.ops.object.mode_set(mode="OBJECT")


def quader(name, mitte, groesse, mat, knochen):
    bpy.ops.mesh.primitive_cube_add(size=1, location=mitte)
    o = bpy.context.active_object
    o.name = name
    o.scale = groesse
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    # an den Knochen hängen (Weltlage bleibt)
    mw = o.matrix_world.copy()
    o.parent = arm
    o.parent_type = "BONE"
    o.parent_bone = knochen
    bpy.context.view_layer.update()
    o.matrix_world = mw
    return o


quader("Rumpf", (0, 0, 1.25), (0.42, 0.22, 0.45), SHIRT, "Spine2")
quader("Becken", (0, 0, 1.0), (0.4, 0.22, 0.16), HOSE, "Hips")
quader("Kopf", (0, 0, 1.68), (0.26, 0.26, 0.3), HAUT, "Head")
quader("Haar", (0, 0.02, 1.84), (0.28, 0.28, 0.06), HAAR, "Head")
quader("AugeL", (0.06, -0.131, 1.7), (0.04, 0.01, 0.04), AUGE, "Head")
quader("AugeR", (-0.06, -0.131, 1.7), (0.04, 0.01, 0.04), AUGE, "Head")
quader("Mund", (0, -0.131, 1.6), (0.08, 0.01, 0.015), AUGE, "Head")
quader("OberarmL", (0.34, 0, 1.42), (0.28, 0.1, 0.1), SHIRT, "LeftArm")
quader("UnterarmL", (0.62, 0, 1.42), (0.28, 0.09, 0.09), HAUT, "LeftForeArm")
quader("OberarmR", (-0.34, 0, 1.42), (0.28, 0.1, 0.1), SHIRT, "RightArm")
quader("UnterarmR", (-0.62, 0, 1.42), (0.28, 0.09, 0.09), HAUT, "RightForeArm")
quader("OberschenkelL", (0.1, 0, 0.72), (0.15, 0.15, 0.45), HOSE, "LeftUpLeg")
quader("OberschenkelR", (-0.1, 0, 0.72), (0.15, 0.15, 0.45), HOSE, "RightUpLeg")
quader("UnterschenkelL", (0.1, 0, 0.28), (0.13, 0.13, 0.45), HOSE, "LeftLeg")
quader("UnterschenkelR", (-0.1, 0, 0.28), (0.13, 0.13, 0.45), HOSE, "RightLeg")

bpy.ops.export_scene.gltf(filepath=ziel, export_format="GLB")
print("CS_OK", ziel)
