"""Echte Mobs aus der Mob-Tabelle (resources/minecraft/mobs.json) mit der Originaltextur aus der Spieldatei.

Tabelle in Bedrock-Koordinaten (y oben, Blick nach −z, rechte Seite −x, Pixel). Umrechnung nach Blender wie bei
der Figur: (x, y, z) → (x, z, y); Drehungen (rx, ry, rz) → Euler XZY (rx, −rz, ry). Ein Pixel = PX Meter, also
dieselbe Größe wie ein Skin-Pixel der Figur.
"""
import json
import math
import os

import bpy
from mathutils import Euler, Vector

from .bloecke import _rgba_im_speicher
from .figur import PX, _box_rects, _faces

# Arme nach vorn wie im Spiel
ARME_VORN = {"zombie", "husk", "drowned"}


def augen_textur(texturen_ordner, textur):
    """Leuchtende Augen wie im Spiel (Phantom, Enderman, Spinne …): „<name>_eyes.png“ neben der Textur oder eine Ebene
    höher (Spinne: entity/spider_eyes.png); None, wenn der Mob keine hat."""
    ordner, datei = os.path.split(textur)
    stamm = os.path.splitext(datei)[0]
    for p in (os.path.join(ordner, f"{stamm}_eyes.png"), os.path.join(os.path.dirname(ordner), f"{stamm}_eyes.png")):
        voll = os.path.join(texturen_ordner, p)
        if os.path.exists(voll):
            return voll
    return None


# Mobs, deren Textur das Spiel erst beim Spielen einfärbt (Tropenfisch: weiße Grundtextur, Farbe je Variante)
TOENUNG = {"tropicalfish": (0.95, 0.16, 0.01)}


def _material(name, bild, augen=None, toenung=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bild
    tex.interpolation = "Closest"
    if toenung:
        mal = nt.nodes.new("ShaderNodeVectorMath")
        mal.operation = "MULTIPLY"
        mal.inputs[1].default_value = toenung
        nt.links.new(tex.outputs["Color"], mal.inputs[0])
        nt.links.new(mal.outputs[0], bsdf.inputs["Base Color"])
    else:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    if hasattr(mat, "blend_method"):
        mat.blend_method = "CLIP"
    bsdf.inputs["Roughness"].default_value = 0.65
    if augen:
        # Augen-Textur hat dasselbe UV-Layout; nur ihre deckenden Pixel leuchten
        at = nt.nodes.new("ShaderNodeTexImage")
        at.image = augen
        at.interpolation = "Closest"
        staerke = nt.nodes.new("ShaderNodeMath")
        staerke.operation = "MULTIPLY"
        staerke.inputs[1].default_value = 6.0
        nt.links.new(at.outputs["Alpha"], staerke.inputs[0])
        farbe = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        nt.links.new(at.outputs["Color"], farbe)
        nt.links.new(staerke.outputs[0], bsdf.inputs["Emission Strength"])
    return mat


def _mesh(name, boxes, tex_w, tex_h, pivot_b, mat):
    verts, faces, uvs = [], [], []
    for box in boxes:
        (ox, oy, oz), (w, h, d) = box["origin"], box["size"]
        inf = box.get("inflate", 0.0)
        rects = _box_rects(box["uv"][0], box["uv"][1], w, h, d)
        if box.get("mirror"):
            rects["rechts"], rects["links"] = rects["links"], rects["rechts"]
        mitte = Vector((ox + w / 2, oz + d / 2, oy + h / 2))  # Blender-Achsen (x, z, y)
        # Nullstärke-Boxen (Flossen, Flügel): Vorder- und Rückseite lägen exakt aufeinander, das rendert
        # Cycles schwarz – deshalb hauchdünn auseinanderziehen
        dick = [max(a, 0.02) for a in (w, h, d)]
        for face, ecken in _faces(*dick, inf).items():
            rx, ry, rw, rh = rects[face]
            if rw == 0 or rh == 0:
                continue
            # Fläche einer Nullstärke-Box ohne Fläche weglassen
            if (Vector(ecken[1]) - Vector(ecken[0])).length < 1e-6 or (Vector(ecken[3]) - Vector(ecken[0])).length < 1e-6:
                continue
            b = len(verts)
            verts.extend([(mitte + Vector(c) - pivot_b) * PX for c in ecken])
            faces.append((b, b + 1, b + 2, b + 3))
            uv = [(rx, ry + rh), (rx + rw, ry + rh), (rx + rw, ry), (rx, ry)]
            if box.get("mirror"):
                uv = [uv[1], uv[0], uv[3], uv[2]]
            uvs.extend(uv)
    if not faces:
        return None
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    layer = me.uv_layers.new(name="uv")
    for loop in me.loops:
        x, y = uvs[loop.vertex_index]
        layer.data[loop.index].uv = (x / tex_w, 1.0 - y / tex_h)
    me.materials.append(mat)
    me.update()
    return me


class Mob:
    def __init__(self, art, wurzel, teile, hoehe_px, skala):
        self.art = art
        self.wurzel = wurzel
        self.teile = teile
        self.hoehe = hoehe_px * PX * skala

    def mitte(self):
        bpy.context.view_layer.update()
        return self.wurzel.matrix_world @ Vector((0, 0, self.hoehe * 0.6))


def tabellen_pfad():
    """Installiert: resources/minecraft neben resources/blender; im Repo: resources/minecraft."""
    basis = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for p in (os.path.join(basis, "minecraft", "mobs.json"), os.path.join(basis, "resources", "minecraft", "mobs.json")):
        if os.path.exists(p):
            return p
    raise FileNotFoundError("Mob-Tabelle mobs.json nicht gefunden")


def tabelle(pfad=None):
    with open(pfad or tabellen_pfad(), encoding="utf-8") as fh:
        return json.load(fh)


def _schaf(eintrag, texturen_ordner, groesse, pose, collection, name):
    """Schaf wie im Java-Spiel aus zwei Schichten: geschorener Körper mit Gesicht (sheep.png) und darüber die Wolle
    (sheep_wool.png). Die Bedrock-Tabelle kennt nur das Wollmodell mit einer Färbe-Maske ohne Gesicht – das Schaf war
    ein weißer Klotz (Mob-Prüfbogen 01.10.)."""
    ordner = os.path.join(texturen_ordner, "entity", "sheep")
    haut = {"head": ([-3, 16, -14], [6, 6, 8], [0, 0]), "body": (None, [8, 16, 6], [28, 8])}
    koerper = []
    for p in eintrag["parts"]:
        q = dict(p, boxes=[])
        for bx in p["boxes"]:
            if p["name"] in haut:
                o, g, uv = haut[p["name"]]
                q["boxes"].append(dict(bx, origin=o or bx["origin"], size=g, uv=uv, inflate=0))
            else:  # Beine: ganze Länge ab dem Boden
                q["boxes"].append(dict(bx, origin=[bx["origin"][0], 0, bx["origin"][2]], size=[4, 12, 4], uv=[0, 16], inflate=0))
        koerper.append(q)
    wolle = [dict(p, boxes=[dict(bx, uv=[bx["uv"][0], bx["uv"][1] - 32]) for bx in p["boxes"]]) for p in eintrag["parts"]]
    basis = dict(eintrag, texture=os.path.join(ordner, "sheep.png"), tex_size=[64, 32], parts=koerper, _schicht=True)
    mob = baue_mob("sheep", basis, texturen_ordner, groesse, pose, collection, name)
    fell = baue_mob("sheep", dict(basis, texture=os.path.join(ordner, "sheep_wool.png"), parts=wolle), texturen_ordner,
                    1.0, pose, collection, f"{mob.wurzel.name[:-len('.wurzel')]}.wolle")
    fell.wurzel.parent = mob.wurzel
    fell.wurzel.location = (0, 0, 0)
    fell.wurzel.scale = (1, 1, 1)
    mob.teile.update({f"wolle_{k}": v for k, v in fell.teile.items()})
    bpy.context.view_layer.update()
    return mob


def baue_mob(art, eintrag, texturen_ordner, groesse=1.0, pose="stand", collection=None, name=None):
    if art == "sheep" and not eintrag.get("_schicht") and all(
            os.path.exists(os.path.join(texturen_ordner, "entity", "sheep", d)) for d in ("sheep.png", "sheep_wool.png")):
        return _schaf(eintrag, texturen_ordner, groesse, pose, collection, name)
    col = collection or bpy.context.scene.collection
    pfad = os.path.join(texturen_ordner, eintrag["texture"])
    bild = bpy.data.images.load(pfad, check_existing=True)
    bild.alpha_mode = "STRAIGHT"
    bild = _rgba_im_speicher(bild, pfad)
    tex_w, tex_h = eintrag["tex_size"]
    augen_pfad = augen_textur(texturen_ordner, eintrag["texture"])
    augen = bpy.data.images.load(augen_pfad, check_existing=True) if augen_pfad else None
    if augen:
        augen.alpha_mode = "STRAIGHT"
    mat = _material(f"mob.{art}", bild, augen, TOENUNG.get(art))
    skala = (eintrag.get("scale") or 1.0) * groesse
    name = name or art
    wurzel = bpy.data.objects.new(f"{name}.wurzel", None)
    col.objects.link(wurzel)
    wurzel.scale = (skala, skala, skala)
    empties, pivots, teile = {}, {}, {}
    reihe, fertig, offen = [], set(), list(eintrag["parts"])
    namen = {p["name"] for p in offen}
    while offen:  # Eltern zuerst
        bereit = [p for p in offen if not p.get("parent") or p["parent"] in fertig or p["parent"] not in namen] or offen[:1]
        for p in bereit:
            reihe.append(p)
            fertig.add(p["name"])
            offen.remove(p)
    for p in reihe:
        # Zustandsteile, die das Spiel nur manchmal zeigt (Fuchs „head_sleeping“ – im Prüfbogen ein schwarzer Klotz)
        if "sleep" in p["name"] or p["name"] == "eggbelly":  # Schildkröte: Bauch nur, wenn sie Eier trägt
            continue
        pb = Vector((p["pivot"][0], p["pivot"][2], p["pivot"][1]))
        e = bpy.data.objects.new(f"{name}.{p['name']}", None)
        col.objects.link(e)
        eltern = p.get("parent")
        if eltern and eltern in empties:
            e.parent = empties[eltern]
            e.location = (pb - pivots[eltern]) * PX
        else:
            e.parent = wurzel
            e.location = pb * PX
        pivots[p["name"]] = pb
        rx, ry, rz = p.get("rotation") or (0, 0, 0)
        if pose in ("stand", "angriff") and art in ARME_VORN and p["name"] in ("right_arm", "left_arm"):
            rx -= 90  # Arme nach vorn
        if pose == "angriff" and p["name"] in ("right_arm", "left_arm") and art not in ARME_VORN:
            rx -= 70
        e.rotation_mode = "XZY"
        # Drehung um die Vorwärtsachse (Bedrock z → Blender y) mit gleichem Vorzeichen: mit umgekehrtem lagen die
        # Piglin-Ohren im Kopf und die Drachenflügel waren zu einem Strich gefaltet (Mob-Prüfbogen 30.09.)
        e.rotation_euler = Euler((math.radians(rx), math.radians(rz), math.radians(ry)), "XZY")
        empties[p["name"]] = e
        me = _mesh(f"{name}.{p['name']}.mesh", p["boxes"], tex_w, tex_h, pb, mat)
        if me:
            ob = bpy.data.objects.new(me.name, me)
            col.objects.link(ob)
            ob.parent = e
            teile[p["name"]] = ob
    bpy.context.view_layer.update()
    return Mob(art, wurzel, teile, eintrag.get("height_px", 32), skala)
