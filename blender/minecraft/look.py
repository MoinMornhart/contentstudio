"""Farbkorrektur und Gesichtslicht nach Stilbuch 6 (ROADMAP 4.4).

- Sättigung +10–30 % und etwas mehr Kontrast im Compositor (Blender 4: scene.node_tree, Blender 5: eigene
  Compositor-Knotengruppe) – beide Versionen werden unterstützt.
- Gesichtslicht: weiche Flächenlampe nahe der Kamera, damit das Gesicht der hellste Teil des Bildes ist.
"""
import bpy
from mathutils import Vector


def _compositor_baum(scene):
    """Gibt den Compositor-Knotenbaum zurück (legt ihn an), für Blender 4.x und 5.x."""
    if hasattr(scene, "compositing_node_group"):  # Blender 5
        gruppe = scene.compositing_node_group
        if gruppe is None:
            gruppe = bpy.data.node_groups.new("ContentStudio Look", "CompositorNodeTree")
            scene.compositing_node_group = gruppe
        return gruppe, 5
    scene.use_nodes = True  # Blender 4
    return scene.node_tree, 4


def _mischen(baum, faktor_quelle, bild_quelle, farbe=(0, 0, 0, 1)):
    """Bild zur Farbe hin mischen, Faktor aus faktor_quelle (Blender 4: MixRGB, Blender 5: Mix-Knoten)."""
    try:
        mix = baum.nodes.new("CompositorNodeMixRGB")
        baum.links.new(faktor_quelle, mix.inputs[0])
        baum.links.new(bild_quelle, mix.inputs[1])
        mix.inputs[2].default_value = farbe
        return mix.outputs[0]
    except RuntimeError:
        mix = baum.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        baum.links.new(faktor_quelle, mix.inputs["Factor"])
        baum.links.new(bild_quelle, mix.inputs["A"])
        mix.inputs["B"].default_value = farbe
        return mix.outputs["Result"]


def _vignette(baum, bild, staerke):
    """Weiche Randabdunklung wie bei den Vorbildern: Blick bleibt in der Bildmitte, Ränder treten zurück."""
    maske = baum.nodes.new("CompositorNodeEllipseMask")
    maske.inputs["Size"].default_value = (0.95, 0.85)  # Blender 4.5 und 5: Größe als Eingang
    weich = baum.nodes.new("CompositorNodeBlur")
    if hasattr(weich, "size_x"):  # Blender 4
        weich.filter_type = "GAUSS"
        weich.use_relative = False
        weich.size_x = weich.size_y = 260
    else:  # Blender 5: Größe in Pixeln als Eingang
        weich.inputs["Size"].default_value = (260, 260)
    baum.links.new(maske.outputs[0], weich.inputs[0])
    try:
        umkehr = baum.nodes.new("CompositorNodeMath")
    except RuntimeError:  # Blender 5
        umkehr = baum.nodes.new("ShaderNodeMath")
    umkehr.operation = "MULTIPLY_ADD"
    umkehr.inputs[1].default_value = -staerke
    umkehr.inputs[2].default_value = staerke
    baum.links.new(weich.outputs[0], umkehr.inputs[0])
    return _mischen(baum, umkehr.outputs[0], bild)


def farbkorrektur(scene, saettigung=1.18, kontrast=1.06, vignette=0.35):
    baum, version = _compositor_baum(scene)
    for n in list(baum.nodes):
        baum.nodes.remove(n)
    ein = baum.nodes.new("CompositorNodeRLayers")
    hs = baum.nodes.new("CompositorNodeHueSat")
    # Sättigung/Wert: Blender 4 hat Eingänge, ältere Stände Eigenschaften
    if "Saturation" in hs.inputs:
        hs.inputs["Saturation"].default_value = saettigung
    else:
        hs.color_saturation = saettigung
    bc = baum.nodes.new("CompositorNodeBrightContrast")
    if "Contrast" in bc.inputs:
        bc.inputs["Contrast"].default_value = (kontrast - 1) * 100
    if version == 5:
        if not any(s.name == "Image" for s in baum.interface.items_tree):
            baum.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        aus = baum.nodes.new("NodeGroupOutput")
        ziel = aus.inputs[0]
    else:
        aus = baum.nodes.new("CompositorNodeComposite")
        ziel = aus.inputs["Image"]
    baum.links.new(ein.outputs["Image"], hs.inputs["Image"])
    baum.links.new(hs.outputs["Image"], bc.inputs["Image"])
    ergebnis = bc.outputs["Image"]
    if vignette > 0:
        ergebnis = _vignette(baum, ergebnis, vignette)
    baum.links.new(ergebnis, ziel)


def gesichtslicht(scene, cam, kopf, staerke=60.0):
    """Weiche Lampe leicht über und neben der Kamera, auf den Kopf gerichtet (Beauty-Licht der Vorbilder)."""
    licht = bpy.data.lights.new("gesicht", "AREA")
    licht.energy = staerke
    licht.size = 0.9
    licht.color = (1.0, 1.0, 1.0)  # neutral: warmes Gesichtslicht färbt Hauttöne gelb
    ob = bpy.data.objects.new("gesicht", licht)
    scene.collection.objects.link(ob)
    ob.visible_camera = False  # Lampe selbst nie im Bild (unscharfe Scheibe)
    von = cam.matrix_world.translation
    richtung = (kopf - von)
    ob.location = von + Vector((0, 0, 0.45)) - richtung.normalized() * 0.2
    ob.rotation_euler = (kopf - ob.location).to_track_quat("-Z", "Y").to_euler()
    return ob


def gpu_einrichten(scene, geraet="CPU"):
    """Cycles auf der GPU aus dem Hardware-Test (OPTIX, CUDA, HIP, ONEAPI, METAL); sonst CPU (geht immer)."""
    scene.cycles.device = "CPU"
    if not geraet or geraet == "CPU":
        return
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
        pass
