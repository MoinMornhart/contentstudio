"""Himmel und Sonne nach Stilbuch 6/7.2 (ROADMAP 4.4): kräftiges Cyan-Blau nach oben, heller Dunst am Horizont
(gleiche Farbe wie der Entfernungsdunst der Blöcke), dazu plastische Wolken, die zum Horizont hin kleiner werden.
Varianten: tag (BastiGHG/GommeHD), abend, nacht."""
import math

import bpy

from . import bloecke

VARIANTEN = {
    "tag": {"oben": (0.05, 0.30, 0.95), "horizont": bloecke.DUNST["farbe"], "wolken": (1.0, 1.0, 1.0), "staerke": 1.0,
            "sonne": 5.5, "sonne_farbe": (1.0, 0.90, 0.74), "sonne_hoehe": 46},
    "abend": {"oben": (0.10, 0.18, 0.55), "horizont": (1.0, 0.62, 0.36), "wolken": (1.0, 0.72, 0.55), "staerke": 0.8,
              "sonne": 4.0, "sonne_farbe": (1.0, 0.62, 0.32), "sonne_hoehe": 12, "mob_licht": True},
    "nacht": {"oben": (0.005, 0.01, 0.04), "horizont": (0.03, 0.05, 0.12), "wolken": (0.08, 0.09, 0.14), "staerke": 0.6,
              "sonne": 0.6, "sonne_farbe": (0.55, 0.65, 1.0), "sonne_hoehe": 40, "mob_licht": True, "mob_licht_faktor": 0.55, "rand": (0.55, 0.7, 1.0)},
    # Das End: fast schwarzer, lila getönter Himmel ohne Wolken, fahles Licht
    "end": {"oben": (0.02, 0.006, 0.05), "horizont": (0.16, 0.06, 0.26), "wolken": (0.16, 0.06, 0.26), "staerke": 1.3,
            "sonne": 1.2, "sonne_farbe": (0.85, 0.75, 1.0), "sonne_hoehe": 55, "rand": (0.75, 0.45, 1.0), "gesicht": 30.0,
            "dunst": (0.06, 0.03, 0.09)},
    # Kampf-Stimmungen nach GommeHD „Minecraft Helden“: dunkler Himmel, farbiges Randlicht an den Figuren
    "blutrot": {"oben": (0.02, 0.0, 0.004), "horizont": (0.30, 0.025, 0.02), "wolken": (0.20, 0.03, 0.03), "staerke": 0.9,
                "sonne": 1.8, "sonne_farbe": (1.0, 0.62, 0.5), "sonne_hoehe": 30, "rand": (1.0, 0.22, 0.10), "gesicht": 30.0,
                "dunst": (0.22, 0.03, 0.02)},
    "gewitter": {"oben": (0.004, 0.008, 0.03), "horizont": (0.03, 0.06, 0.14), "wolken": (0.05, 0.07, 0.12), "staerke": 0.8,
                 "sonne": 0.9, "sonne_farbe": (0.6, 0.72, 1.0), "sonne_hoehe": 45, "rand": (0.35, 0.6, 1.0), "gesicht": 30.0,
                 "dunst": (0.03, 0.05, 0.10)},
}


def baue(scene, variante="tag", wolken_dichte=0.45, sonne_richtung=38.0):
    v = VARIANTEN[variante]
    world = bpy.data.worlds.new("himmel")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    # Verlauf nach Höhe (z der Blickrichtung): Horizont → oben
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*v["horizont"], 1)
    ramp.color_ramp.elements[1].position = 0.45
    ramp.color_ramp.elements[1].color = (*v["oben"], 1)
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    # Wolken: Rauschen auf der Ebene xy/z (Perspektive: zum Horizont kleiner und dichter)
    teil = nt.nodes.new("ShaderNodeVectorMath")
    teil.operation = "DIVIDE"
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(sep.outputs["Z"], comb.inputs["X"])
    nt.links.new(sep.outputs["Z"], comb.inputs["Y"])
    comb.inputs["Z"].default_value = 1.0
    nt.links.new(coord.outputs["Generated"], teil.inputs[0])
    nt.links.new(comb.outputs[0], teil.inputs[1])
    rausch = nt.nodes.new("ShaderNodeTexNoise")
    rausch.inputs["Scale"].default_value = 1.6
    rausch.inputs["Detail"].default_value = 8.0
    rausch.inputs["Roughness"].default_value = 0.55
    nt.links.new(teil.outputs[0], rausch.inputs["Vector"])
    form = nt.nodes.new("ShaderNodeValToRGB")
    form.color_ramp.elements[0].position = 1.0 - wolken_dichte - 0.08
    form.color_ramp.elements[0].color = (0, 0, 0, 1)
    form.color_ramp.elements[1].position = 1.0 - wolken_dichte + 0.12
    form.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(rausch.outputs["Fac"], form.inputs["Fac"])
    # nur über dem Horizont, unten weich ausblenden
    ueber = nt.nodes.new("ShaderNodeMapRange")
    ueber.inputs["From Min"].default_value = 0.02
    ueber.inputs["From Max"].default_value = 0.12
    nt.links.new(sep.outputs["Z"], ueber.inputs["Value"])
    maske = nt.nodes.new("ShaderNodeMath")
    maske.operation = "MULTIPLY"
    nt.links.new(form.outputs["Color"], maske.inputs[0])
    nt.links.new(ueber.outputs["Result"], maske.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(maske.outputs[0], mix.inputs[0])
    nt.links.new(ramp.outputs["Color"], bloecke._rgba(mix, "A"))
    bloecke._rgba(mix, "B").default_value = (*v["wolken"], 1)
    nt.links.new(bloecke._rgba(mix, "Result"), bg.inputs["Color"])
    bg.inputs["Strength"].default_value = v["staerke"]

    sonne = bpy.data.lights.new("sonne", "SUN")
    sonne.energy = v["sonne"]
    sonne.angle = math.radians(4)
    sonne.color = v["sonne_farbe"]
    so = bpy.data.objects.new("sonne", sonne)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(90 - v["sonne_hoehe"]), 0, math.radians(sonne_richtung))
    return so
