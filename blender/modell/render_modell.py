"""3D-Modell des Nutzers rendern (ROADMAP 4.3): VTuber, Spiel-Avatare anderer Spiele, Maskottchen als GLB/glTF/VRM/FBX.

Aufruf: blender -b --factory-startup --python blender/modell/render_modell.py -- <spec.json> <ausgabe.png> <bericht.json>
spec:
{
  "modell": "<pfad>", "pose": "neutral" | "zeigen" | "jubeln" | "winken" | "nachdenken" | "schreck",
  "kopf": {"drehen": 20, "neigen": 8, "nicken": 0}, "blick": 25 (Körperdrehung zur Bildmitte, Grad),
  "kamera": "nah" | "brust" | "ganz", "seite": "links" | "rechts",
  "licht": "studio" | "dramatisch" | "weich", "randlicht": "#66ccff",
  "breite": 1280, "hoehe": 720, "samples": 32, "geraet": "CPU"
}
Rendert die Figur mit transparentem Hintergrund (für das Compositing auf Hintergrund und Text) und schreibt in den
Bericht Figur- und Kopfbox (Bildanteile) sowie Warnungen. Knochen werden über gängige Namen gefunden (VRM, Mixamo,
Unity/Unreal-Humanoid); ohne passendes Skelett bleibt die Figur in ihrer Grundhaltung.
"""
import json
import math
import os
import shutil
import sys
import tempfile
import traceback

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

KNOCHEN = {
    "kopf": ["head", "j_bip_c_head", "mixamorig:head", "bip01_head", "bip001 head", "head_jnt"],
    "hals": ["neck", "j_bip_c_neck", "mixamorig:neck"],
    "brust": ["chest", "upperchest", "upper_chest", "spine2", "j_bip_c_upperchest", "j_bip_c_chest", "mixamorig:spine2", "spine_03", "spine1"],
    "huefte": ["hips", "pelvis", "j_bip_c_hips", "mixamorig:hips", "root"],
    "oberarm_l": ["leftupperarm", "upperarm_l", "upper_arm.l", "j_bip_l_upperarm", "mixamorig:leftarm", "leftarm", "l_upperarm", "arm_l"],
    "oberarm_r": ["rightupperarm", "upperarm_r", "upper_arm.r", "j_bip_r_upperarm", "mixamorig:rightarm", "rightarm", "r_upperarm", "arm_r"],
    "unterarm_l": ["leftlowerarm", "lowerarm_l", "forearm.l", "j_bip_l_lowerarm", "mixamorig:leftforearm", "leftforearm", "l_forearm"],
    "unterarm_r": ["rightlowerarm", "lowerarm_r", "forearm.r", "j_bip_r_lowerarm", "mixamorig:rightforearm", "rightforearm", "r_forearm"],
}

# Zielrichtungen der Oberarme im Figurraum (x = zur Figur-Linken, y = nach vorn (zur Kamera), z = oben) und Ellbogen
POSEN = {
    "neutral": {"oberarm_l": (0.25, 0.05, -1), "oberarm_r": (-0.25, 0.05, -1)},
    "zeigen": {"oberarm_r": (-0.25, 0.05, -1), "oberarm_l": (0.9, 0.5, 0.15)},
    "jubeln": {"oberarm_l": (0.5, 0.1, 1), "oberarm_r": (-0.5, 0.1, 1), "ellbogen": 20},
    "winken": {"oberarm_r": (-0.25, 0.05, -1), "oberarm_l": (0.8, 0.2, 0.6), "ellbogen_l": 70},
    "nachdenken": {"oberarm_l": (0.25, 0.05, -1), "oberarm_r": (0.2, 0.6, -0.5), "ellbogen_r": 130},
    "schreck": {"oberarm_l": (0.6, 0.5, 0.3), "oberarm_r": (-0.6, 0.5, 0.3), "ellbogen": 60},
}


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def importiere(pfad):
    endung = os.path.splitext(pfad)[1].lower()
    vorher = set(bpy.data.objects)
    if endung in (".glb", ".gltf", ".vrm"):
        ziel = pfad
        if endung == ".vrm":  # VRM ist glTF-Binärformat: als .glb importieren
            ziel = os.path.join(tempfile.mkdtemp(), "modell.glb")
            shutil.copyfile(pfad, ziel)
        bpy.ops.import_scene.gltf(filepath=ziel)
    elif endung == ".fbx":
        if hasattr(bpy.ops.wm, "fbx_import"):
            bpy.ops.wm.fbx_import(filepath=pfad)
        else:
            bpy.ops.import_scene.fbx(filepath=pfad)
    else:
        raise ValueError(f"Format {endung} wird nicht unterstützt (GLB, glTF, VRM, FBX)")
    return [o for o in bpy.data.objects if o not in vorher]


def vrm0(pfad):
    """VRM 0.x schaut in glTF nach −Z (also in Blender nach +Y) und muss für die Kamera umgedreht werden."""
    if not pfad.lower().endswith(".vrm"):
        return False
    try:
        with open(pfad, "rb") as fh:
            kopf = fh.read(20)
            laenge = int.from_bytes(kopf[12:16], "little")
            meta = json.loads(fh.read(laenge))
        return "VRM" in meta.get("extensions", {}) and "VRMC_vrm" not in meta.get("extensions", {})
    except Exception:
        return False


def finde_knochen(arm):
    namen = {b.name.lower().replace(" ", ""): b.name for b in arm.pose.bones}
    gefunden = {}
    for rolle, kandidaten in KNOCHEN.items():
        for k in kandidaten:
            if k.replace(" ", "") in namen:
                gefunden[rolle] = arm.pose.bones[namen[k.replace(" ", "")]]
                break
    return gefunden


def richte_aus(arm, pb, ziel_welt):
    """Dreht einen Knochen so, dass er in Richtung `ziel_welt` zeigt (im Armature-Raum gerechnet)."""
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    ist = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    ziel = (arm.matrix_world.to_3x3().inverted() @ Vector(ziel_welt)).normalized()
    rot = ist.rotation_difference(ziel).to_matrix().to_4x4()
    kopf = m.translation.copy()
    pb.matrix = Matrix.Translation(kopf) @ rot @ Matrix.Translation(-kopf) @ m


def beuge(pb, grad):
    if not pb or not grad:
        return
    pb.rotation_mode = "XYZ"
    pb.rotation_euler.x += math.radians(grad)


def drehe_lokal(arm, pb, achse_welt, grad):
    if not pb or not grad:
        return
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    achse = (arm.matrix_world.to_3x3().inverted() @ Vector(achse_welt)).normalized()
    rot = Matrix.Rotation(math.radians(grad), 4, achse)
    kopf = m.translation.copy()
    pb.matrix = Matrix.Translation(kopf) @ rot @ Matrix.Translation(-kopf) @ m


def pose_setzen(arm, spec, vorne):
    k = finde_knochen(arm)
    if not k:
        return ["Kein bekanntes Skelett gefunden – Figur bleibt in ihrer Grundhaltung"]
    pose = POSEN.get(spec.get("pose", "neutral"), POSEN["neutral"])
    if spec.get("seite") == "rechts":
        # Figur rechts im Bild: Gesten zur Bildmitte gehen mit dem anderen Arm (spiegeln)
        tausch = {"oberarm_l": "oberarm_r", "oberarm_r": "oberarm_l", "ellbogen_l": "ellbogen_r", "ellbogen_r": "ellbogen_l"}
        pose = {tausch.get(k, k): ((-v[0], v[1], v[2]) if isinstance(v, tuple) else v) for k, v in pose.items()}
    # Figurraum → Welt: x zur Figur-Linken, y nach vorn (zur Kamera = −Y in Blender, bei gedrehten Modellen gespiegelt)
    # Schaut die Figur nach −Y (zur Kamera), liegt ihre linke Hand bei +X
    welt = lambda v: Vector((-vorne * v[0], v[1] * vorne, v[2]))
    for rolle in ("oberarm_l", "oberarm_r"):
        if rolle in k and rolle in pose:
            richte_aus(arm, k[rolle], welt(pose[rolle]))
    beuge(k.get("unterarm_l"), pose.get("ellbogen_l", pose.get("ellbogen", 15)))
    beuge(k.get("unterarm_r"), pose.get("ellbogen_r", pose.get("ellbogen", 15)))
    kopf = spec.get("kopf") or {}
    ziel = k.get("kopf") or k.get("hals")
    drehe_lokal(arm, ziel, (0, 0, 1), kopf.get("drehen", 0))
    drehe_lokal(arm, ziel, (0, vorne, 0), kopf.get("neigen", 0))
    drehe_lokal(arm, ziel, (1, 0, 0), kopf.get("nicken", 0))
    bpy.context.view_layer.update()
    return [] if len(k) >= 4 else ["Skelett nur teilweise erkannt – Pose vereinfacht"]


def welt_box(objekte):
    pkt = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objekte:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        schritt = max(1, len(me.vertices) // 4000)
        pkt += [mw @ me.vertices[i].co for i in range(0, len(me.vertices), schritt)]
        ev.to_mesh_clear()
    if not pkt:
        raise ValueError("Das Modell enthält keine sichtbaren Flächen")
    lo = Vector((min(p.x for p in pkt), min(p.y for p in pkt), min(p.z for p in pkt)))
    hi = Vector((max(p.x for p in pkt), max(p.y for p in pkt), max(p.z for p in pkt)))
    return lo, hi, pkt


def licht(szene, art, randfarbe, vorne):
    welt = bpy.data.worlds.new("Welt")
    szene.world = welt
    welt.use_nodes = True
    welt.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35 if art != "dramatisch" else 0.15
    def lampe(name, energie, pos, farbe=(1, 1, 1), groesse=2.0):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energie
        d.color = farbe
        d.size = groesse
        o = bpy.data.objects.new(name, d)
        szene.collection.objects.link(o)
        o.location = pos
        o.rotation_euler = (Vector((0, 0, 1.2)) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        return o
    staerke = {"studio": 1.0, "weich": 0.8, "dramatisch": 1.3}.get(art, 1.0)
    lampe("Key", 150 * staerke, (1.6, 2.6 * vorne, 2.6))
    lampe("Fill", 55 * staerke * (0.4 if art == "dramatisch" else 1), (-2.2, 2.0 * vorne, 1.6), groesse=3)
    lampe("Rand", 260 * staerke, (-1.2, -2.4 * vorne, 2.4), hex_rgb(randfarbe or "#ffffff"), 1.0)


def baue(spec, ausgabe, bericht_pfad):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    szene = bpy.context.scene
    neu = importiere(spec["modell"])
    warnungen = []
    # Blickrichtung: glTF/FBX schauen nach −Y; VRM 0.x nach +Y
    vorne = 1 if vrm0(spec["modell"]) else -1
    arm = next((o for o in neu if o.type == "ARMATURE"), None)
    if arm:
        warnungen += pose_setzen(arm, spec, vorne)
    else:
        warnungen.append("Modell ohne Skelett – keine Pose möglich")
    # Körperdrehung zur Bildmitte (Figur links schaut nach rechts)
    wurzel = [o for o in neu if o.parent is None]
    blick = float(spec.get("blick", 20)) * (1 if spec.get("seite", "links") == "links" else -1)
    for o in wurzel:
        o.rotation_euler.z += math.radians(blick) * (-vorne)
    bpy.context.view_layer.update()

    lo, hi, pkt = welt_box(neu)
    hoehe = hi.z - lo.z
    mitte = (lo + hi) / 2
    # Kopf: Kopfknochen, sonst oberstes Achtel
    kopf_z = hi.z - hoehe * 0.07
    if arm:
        k = finde_knochen(arm)
        if "kopf" in k:
            kopf_z = (arm.matrix_world @ k["kopf"].head).z + hoehe * 0.05
    art = spec.get("kamera", "brust")
    # Sichtbarer Ausschnitt und Blickpunkt je Kameraart
    ausschnitt = {"nah": 0.32, "brust": 0.58, "ganz": 1.08}.get(art, 0.58) * hoehe
    ziel = Vector((mitte.x, mitte.y, kopf_z - ausschnitt * (0.28 if art != "ganz" else 0.45)))
    cam_d = bpy.data.cameras.new("Kamera")
    cam_d.lens = {"nah": 50, "brust": 40, "ganz": 35}.get(art, 40)
    cam = bpy.data.objects.new("Kamera", cam_d)
    szene.collection.objects.link(cam)
    szene.camera = cam
    W, H = int(spec.get("breite", 1280)), int(spec.get("hoehe", 720))
    szene.render.resolution_x, szene.render.resolution_y = W, H
    # Abstand, damit der Ausschnitt die Bildhöhe füllt (Sensor 36 mm, Querformat: vertikaler Winkel aus dem Seitenverhältnis)
    vfov = 2 * math.atan(36 / 2 / cam_d.lens * H / W)
    abstand = ausschnitt / 2 / math.tan(vfov / 2)
    # Leicht von unten (Heldenperspektive) und leicht seitlich
    cam.location = ziel + Vector((0.12 * abstand * (1 if spec.get("seite", "links") == "links" else -1), abstand * vorne, 0.06 * abstand))
    cam.rotation_euler = (ziel - cam.location).to_track_quat("-Z", "Y").to_euler()
    # Figur auf die gewünschte Bildseite: Kamera seitlich verschieben
    verschiebung = {"links": 0.22, "rechts": -0.22, "mitte": 0.0}.get(spec.get("seite", "links"), 0.22)
    cam_d.shift_x = verschiebung
    licht(szene, spec.get("licht", "studio"), spec.get("randlicht"), vorne)

    szene.render.engine = "CYCLES"
    szene.cycles.samples = int(spec.get("samples", 32))
    szene.cycles.use_denoising = True
    try:
        szene.cycles.device = "GPU" if spec.get("geraet", "CPU") != "CPU" else "CPU"
    except Exception:
        pass
    szene.render.film_transparent = True
    szene.render.image_settings.file_format = "PNG"
    szene.render.image_settings.color_mode = "RGBA"
    szene.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in type(szene.view_settings).bl_rna.properties["view_transform"].enum_items] else "Filmic"
    szene.render.filepath = ausgabe
    bpy.ops.render.render(write_still=True)

    # Bericht: Figur- und Kopfbox in Bildanteilen (oben links = 0,0)
    def auf_bild(p):
        v = world_to_camera_view(szene, cam, p)
        return v.x, 1 - v.y
    xy = [auf_bild(p) for p in pkt]
    box = [min(x for x, _ in xy), min(y for _, y in xy), max(x for x, _ in xy), max(y for _, y in xy)]
    kopf_pkt = [auf_bild(p) for p in pkt if p.z >= kopf_z - hoehe * 0.1]
    kb = [min(x for x, _ in kopf_pkt), min(y for _, y in kopf_pkt), max(x for x, _ in kopf_pkt), max(y for _, y in kopf_pkt)] if kopf_pkt else box
    if kb[1] < 0 or kb[0] < 0 or kb[2] > 1:
        warnungen.append("Kopf angeschnitten")
    bericht = {"figuren": {"ich": {"box": [round(v, 4) for v in box], "kopf_box": [round(v, 4) for v in kb], "gesicht": True}}, "warnungen": warnungen}
    with open(bericht_pfad, "w", encoding="utf-8") as fh:
        json.dump(bericht, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    spec_pfad, ausgabe, bericht_pfad = args[:3]
    try:
        with open(spec_pfad, encoding="utf-8") as fh:
            spec = json.load(fh)
        baue(spec, ausgabe, bericht_pfad)
        print("CS_OK", ausgabe)
    except Exception as err:
        with open(bericht_pfad, "w", encoding="utf-8") as fh:
            json.dump({"fehler": str(err), "spur": traceback.format_exc()}, fh, ensure_ascii=False, indent=1)
        print("CS_FEHLER", err)
        sys.exit(1)
