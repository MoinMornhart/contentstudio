"""ContentStudio – Hardware-Test in Blender (läuft nur headless: blender -b --factory-startup --python bench.py -- ...).

Modi:
  devices <out.json>
      Listet Render-Engines und GPU-Rechengeräte für Cycles (OPTIX, CUDA, HIP, ONEAPI, METAL).
  render <out.json> <ENGINE> <DEVICE> <WIDTH> <HEIGHT> <image.png>
      Rendert eine kleine Testszene und misst die Zeit. ENGINE: CYCLES | EEVEE | WORKBENCH,
      DEVICE: CPU oder ein GPU-Typ (nur für CYCLES).

Jeder Lauf ist ein eigener Prozess, damit ein Treiberabsturz nur diesen Test betrifft.
"""
import json
import sys
import time

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "devices"
OUT = argv[1] if len(argv) > 1 else "bench.json"
GPU_TYPES = ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL")


def write(data):
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f)


def engine_ids():
    # Statische Engines (EEVEE) plus die per Add-on registrierten (Cycles, Workbench …)
    ids = list(bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys())
    for cls in bpy.types.RenderEngine.__subclasses__():
        if getattr(cls, "bl_idname", None) and cls.bl_idname not in ids:
            ids.append(cls.bl_idname)
    return ids


def eevee_id():
    ids = engine_ids()
    # Blender 4.2–4.5 heißt EEVEE intern BLENDER_EEVEE_NEXT, ab 5.0 wieder BLENDER_EEVEE.
    return "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in ids else "BLENDER_EEVEE"


def cycles_prefs():
    return bpy.context.preferences.addons["cycles"].preferences


def refresh(prefs):
    if hasattr(prefs, "refresh_devices"):
        prefs.refresh_devices()
    else:
        prefs.get_devices()


def list_gpu_devices():
    prefs = cycles_prefs()
    found = {}
    for kind in GPU_TYPES:
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue  # Typ in dieser Blender-Version/auf diesem System nicht vorhanden
        refresh(prefs)
        names = [d.name for d in prefs.devices if d.type == kind]
        if names:
            found[kind] = names
    return found


def build_scene(width, height):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    bpy.ops.mesh.primitive_monkey_add(location=(0, 0, 1.2))
    monkey = bpy.context.active_object
    mod = monkey.modifiers.new("sub", "SUBSURF")
    mod.levels = 2
    mod.render_levels = 2
    bpy.ops.object.shade_smooth()
    mat = bpy.data.materials.new("gold")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 0.7, 0.2, 1.0)
        bsdf.inputs["Metallic"].default_value = 0.6
    monkey.data.materials.append(mat)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.8, 0.8, 0.5))
    bpy.ops.object.light_add(type="SUN", location=(3, -3, 6))
    bpy.context.active_object.data.energy = 4.0
    bpy.ops.object.light_add(type="AREA", location=(-3, -2, 3))
    bpy.context.active_object.data.energy = 300.0
    bpy.ops.object.camera_add(location=(3.2, -6.5, 3.0))
    cam = bpy.context.active_object
    cam.data.lens = 40
    track = cam.constraints.new("TRACK_TO")
    track.target = monkey
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam
    cube_mat = bpy.data.materials.new("blau")
    cube_mat.diffuse_color = (0.15, 0.45, 1.0, 1.0)
    cube_mat.use_nodes = True
    cbsdf = cube_mat.node_tree.nodes.get("Principled BSDF")
    if cbsdf:
        cbsdf.inputs["Base Color"].default_value = (0.15, 0.45, 1.0, 1.0)
    bpy.data.objects["Cube"].data.materials.append(cube_mat)
    mat.diffuse_color = (1.0, 0.7, 0.2, 1.0)
    world = bpy.data.worlds.new("w")
    world.color = (0.2, 0.22, 0.28)
    scene.world = world
    return scene


def mean_brightness(path):
    img = bpy.data.images.load(path)
    px = list(img.pixels[:])
    n = len(px) // 4
    if n == 0:
        return 0.0
    total = 0.0
    for i in range(0, len(px), 4 * 97):  # Stichprobe reicht
        total += (px[i] + px[i + 1] + px[i + 2]) / 3.0
    return total / max(1, len(range(0, len(px), 4 * 97)))


def render(engine, device, width, height, image):
    scene = build_scene(width, height)
    if engine == "CYCLES":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 16
        scene.cycles.use_denoising = True
        if device != "CPU":
            prefs = cycles_prefs()
            prefs.compute_device_type = device
            refresh(prefs)
            for d in prefs.devices:
                d.use = d.type == device
            scene.cycles.device = "GPU"
        else:
            scene.cycles.device = "CPU"
    elif engine == "EEVEE":
        scene.render.engine = eevee_id()
        if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 16
    elif engine == "WORKBENCH":
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.light = "STUDIO"
    else:
        raise ValueError("Unbekannte Engine: " + engine)

    scene.render.filepath = image
    scene.render.image_settings.file_format = "PNG"
    start = time.time()
    bpy.ops.render.render(write_still=True)
    seconds = time.time() - start
    return {"seconds": round(seconds, 3), "brightness": round(mean_brightness(image), 4)}


try:
    if MODE == "devices":
        write({"ok": True, "version": bpy.app.version_string, "engines": engine_ids(), "gpu": list_gpu_devices()})
    elif MODE == "render":
        engine, device, width, height, image = argv[2], argv[3], int(argv[4]), int(argv[5]), argv[6]
        result = render(engine, device, width, height, image)
        write({"ok": True, "version": bpy.app.version_string, "engine": engine, "device": device, **result})
    else:
        write({"ok": False, "error": "Unbekannter Modus: " + MODE})
except Exception as exc:  # Fehler als Ergebnis melden statt nur im Log
    write({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
