"""Blöcke mit echten Minecraft-Texturen (ROADMAP 4.3).

Ein Block ist 16 Skin-Pixel groß (0,9 m), passend zur Figur aus figur.py. Welten werden als Raster
{(x, y, z): blockname} beschrieben (z = Höhe, der Block (x, y, 0) liegt direkt unter der Standfläche z = 0).
Es werden nur Flächen gebaut, die an Luft oder durchsichtige Blöcke grenzen.

Texturen kommen immer aus der Spieldatei (`textures/block/*.png`), nie selbst erzeugt. Animierte Texturen
(Wasser, Lava) sind Streifen; es wird das erste Bild verwendet.
"""
import os

import bpy

from .figur import PX

BLOCK = 16 * PX  # Meter je Block

def _linear(c):
    """sRGB (wie im Spiel angegeben) → linear (Blender-Farbeingänge)"""
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# Einfärbung wie im Spiel (Ebenen-Biom): Gras #91BD59, Laub #77AB2F, Wasser #3F76E4
GRAS = _linear((0.569, 0.741, 0.349))
LAUB = _linear((0.467, 0.671, 0.184))
WASSER = _linear((0.247, 0.463, 0.894))

# Block → Texturen je Seite und Eigenschaften. Namen wie im Spiel.
ARTEN = {
    "grass_block": {"oben": ("grass_block_top", GRAS), "unten": ("dirt", None), "seite": ("grass_block_side", None), "overlay": ("grass_block_side_overlay", GRAS)},
    "dirt": {"alle": ("dirt", None)},
    "coarse_dirt": {"alle": ("coarse_dirt", None)},
    "stone": {"alle": ("stone", None)},
    "andesite": {"alle": ("andesite", None)},
    "gravel": {"alle": ("gravel", None)},
    "sand": {"alle": ("sand", None)},
    "sandstone": {"oben": ("sandstone_top", None), "unten": ("sandstone_bottom", None), "seite": ("sandstone", None)},
    "deepslate": {"oben": ("deepslate_top", None), "unten": ("deepslate_top", None), "seite": ("deepslate", None)},
    "cobblestone": {"alle": ("cobblestone", None)},
    "mossy_cobblestone": {"alle": ("mossy_cobblestone", None)},
    "oak_log": {"oben": ("oak_log_top", None), "unten": ("oak_log_top", None), "seite": ("oak_log", None)},
    "oak_planks": {"alle": ("oak_planks", None)},
    "oak_leaves": {"alle": ("oak_leaves", LAUB), "durchsichtig": True},
    "water": {"alle": ("water_still", WASSER), "fluessig": True, "durchsichtig": True},
    "lava": {"alle": ("lava_still", None), "fluessig": True, "leuchtet": 1.8},
    "snow_block": {"alle": ("snow", None)},
    "ice": {"alle": ("ice", None), "durchsichtig": True},
    "netherrack": {"alle": ("netherrack", None)},
    "obsidian": {"alle": ("obsidian", None)},
    "bedrock": {"alle": ("bedrock", None)},
    "tnt": {"oben": ("tnt_top", None), "unten": ("tnt_bottom", None), "seite": ("tnt_side", None)},
    # Dorf
    "glass": {"alle": ("glass", None), "durchsichtig": True},
    "dirt_path": {"oben": ("dirt_path_top", None), "unten": ("dirt", None), "seite": ("dirt_path_side", None)},
    "hay_block": {"oben": ("hay_block_top", None), "unten": ("hay_block_top", None), "seite": ("hay_block_side", None)},
    "farmland": {"oben": ("farmland_moist", None), "unten": ("dirt", None), "seite": ("dirt", None)},
    "spruce_planks": {"alle": ("spruce_planks", None)},
    "spruce_log": {"oben": ("spruce_log_top", None), "unten": ("spruce_log_top", None), "seite": ("spruce_log", None)},
    "stripped_oak_log": {"oben": ("oak_log_top", None), "unten": ("oak_log_top", None), "seite": ("stripped_oak_log", None)},
    "white_wool": {"alle": ("white_wool", None)},
    "smooth_stone": {"alle": ("smooth_stone", None)},
    # Höhle
    "coal_ore": {"alle": ("coal_ore", None)},
    "iron_ore": {"alle": ("iron_ore", None)},
    "gold_ore": {"alle": ("gold_ore", None)},
    "redstone_ore": {"alle": ("redstone_ore", None)},
    "diamond_ore": {"alle": ("diamond_ore", None)},
    "deepslate_diamond_ore": {"alle": ("deepslate_diamond_ore", None)},
    "deepslate_iron_ore": {"alle": ("deepslate_iron_ore", None)},
    "tuff": {"alle": ("tuff", None)},
    # Nether
    "nether_portal": {"alle": ("nether_portal", None), "durchsichtig": True, "leuchtet": 2.5},
    "nether_bricks": {"alle": ("nether_bricks", None)},
    "glowstone": {"alle": ("glowstone", None), "leuchtet": 2.5},
    "magma_block": {"alle": ("magma", None), "leuchtet": 0.8},
    "nether_quartz_ore": {"alle": ("nether_quartz_ore", None)},
    "nether_gold_ore": {"alle": ("nether_gold_ore", None)},
    "soul_sand": {"alle": ("soul_sand", None)},
    "basalt": {"oben": ("basalt_top", None), "unten": ("basalt_top", None), "seite": ("basalt_side", None)},
    "blackstone": {"alle": ("blackstone", None)},
}

SEITEN = {
    # Richtung: (Normale, Ecken im Einheitswürfel unten-links, unten-rechts, oben-rechts, oben-links von außen gesehen)
    "vorn": ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
    "hinten": ((0, 1, 0), [(1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 1, 1)]),
    "rechts": ((-1, 0, 0), [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)]),
    "links": ((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),
    "oben": ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]),
    "unten": ((0, 0, -1), [(0, 1, 0), (1, 1, 0), (1, 0, 0), (0, 0, 0)]),
}


def _rgba(node, name):
    """Farb-Anschluss des Mix-Knotens nach Name (A, B, Result) – die Nummern unterscheiden sich je Blender-Version."""
    for sock in list(node.inputs) + list(node.outputs):
        if sock.name == name and sock.type == "RGBA":
            return sock
    raise KeyError(name)


# Luftperspektive (Stilbuch 6/7): Oberflächen mischen sich mit der Entfernung zur Kamera in Dunstfarbe.
# Ohne Volumen – so bleibt das Sonnenlicht voll und die Renderzeit gleich.
DUNST = {"farbe": (0.42, 0.66, 1.0), "halbwert": 160.0}


def dunst_einbauen(mat):
    """Hängt den Entfernungsdunst vor den Material-Ausgang (Cycles und Eevee, Blender 4 und 5)."""
    nt = mat.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    link = next((lk for lk in nt.links if lk.to_socket == out.inputs["Surface"]), None)
    if link is None:
        return
    shader = link.from_socket
    cam = nt.nodes.new("ShaderNodeCameraData")
    teil = nt.nodes.new("ShaderNodeMath")
    teil.operation = "DIVIDE"
    teil.inputs[1].default_value = DUNST["halbwert"] / 0.693
    nt.links.new(cam.outputs["View Distance"], teil.inputs[0])
    expo = nt.nodes.new("ShaderNodeMath")
    expo.operation = "EXPONENT"
    neg = nt.nodes.new("ShaderNodeMath")
    neg.operation = "MULTIPLY"
    neg.inputs[1].default_value = -1.0
    nt.links.new(teil.outputs[0], neg.inputs[0])
    nt.links.new(neg.outputs[0], expo.inputs[0])
    faktor = nt.nodes.new("ShaderNodeMath")
    faktor.operation = "SUBTRACT"
    faktor.inputs[0].default_value = 1.0
    nt.links.new(expo.outputs[0], faktor.inputs[1])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*DUNST["farbe"], 1)
    em.inputs["Strength"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    # Durchsichtige Stellen (Glas, Laub, Flammen, Ranken) bekommen keinen Dunst – sonst stand dort ein bläuliches
    # Rechteck (Prüfbogen 02.10.): Dunst-Anteil mal Deckkraft der Textur
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    alpha = next((lk.from_socket for lk in nt.links if bsdf and lk.to_socket == bsdf.inputs["Alpha"]), None)
    if alpha is not None:
        mal = nt.nodes.new("ShaderNodeMath")
        mal.operation = "MULTIPLY"
        nt.links.new(faktor.outputs[0], mal.inputs[0])
        nt.links.new(alpha, mal.inputs[1])
        faktor = mal
    nt.links.new(faktor.outputs[0], mix.inputs[0])
    nt.links.new(shader, mix.inputs[1])
    nt.links.new(em.outputs["Emission"], mix.inputs[2])
    nt.links.remove(link)
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def _rgba_im_speicher(img, pfad):
    """Graustufen-PNGs mit Alpha (Farbtyp 4, z. B. weißes Buntglas) liest Cycles selbst von der Platte und verliert
    dabei die Transparenz – der Block wird undurchsichtig weiß. Solche Texturen gehen als RGBA-Puffer aus Blenders
    Speicher in den Render (Blender hat sie beim Laden schon richtig nach RGBA gewandelt)."""
    try:
        with open(pfad, "rb") as fh:
            kopf = fh.read(26)
    except OSError:
        return img
    if len(kopf) < 26 or kopf[1:4] != b"PNG" or kopf[25] != 4:
        return img
    name = f"{img.name}.rgba"
    kopie = bpy.data.images.get(name)
    if kopie is None:
        w, h = img.size
        kopie = bpy.data.images.new(name, w, h, alpha=True)
        kopie.alpha_mode = "STRAIGHT"
        kopie.pixels.foreach_set(list(img.pixels))
        kopie.pack()
    return kopie


class Texturen:
    """Lädt Blocktexturen aus der entpackten Spieldatei und baut Materialien (einmal je Textur/Einfärbung)."""

    def __init__(self, ordner):
        self.ordner = ordner
        self.cache = {}

    def bild(self, name):
        pfad = os.path.join(self.ordner, "block", f"{name}.png")
        if not os.path.exists(pfad):
            raise FileNotFoundError(f"Textur {name} fehlt in der Spieldatei ({pfad})")
        img = bpy.data.images.load(pfad, check_existing=True)
        img.alpha_mode = "STRAIGHT"
        return _rgba_im_speicher(img, pfad)

    def material(self, name, farbe=None, overlay=None, durchsichtig=False, leuchtet=0.0):
        key = (name, farbe, overlay, durchsichtig, leuchtet)
        if key in self.cache:
            return self.cache[key]
        img = self.bild(name)
        mat = bpy.data.materials.new(f"mc.{name}")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = 0.72
        for k in ("Specular IOR Level", "Specular"):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = 0.12
                break
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Closest"
        farbe_out = tex.outputs["Color"]
        if farbe:
            mul = nt.nodes.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs[0].default_value = 1.0
            nt.links.new(farbe_out, _rgba(mul, "A"))
            _rgba(mul, "B").default_value = (*farbe, 1)
            farbe_out = _rgba(mul, "Result")
        if overlay:
            # Gras an der Seite: eingefärbte Deckschicht über der Erdseite
            ov_img = self.bild(overlay[0])
            ov = nt.nodes.new("ShaderNodeTexImage")
            ov.image = ov_img
            ov.interpolation = "Closest"
            tint = nt.nodes.new("ShaderNodeMix")
            tint.data_type = "RGBA"
            tint.blend_type = "MULTIPLY"
            tint.inputs[0].default_value = 1.0
            nt.links.new(ov.outputs["Color"], _rgba(tint, "A"))
            _rgba(tint, "B").default_value = (*overlay[1], 1)
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            nt.links.new(ov.outputs["Alpha"], mix.inputs[0])
            nt.links.new(farbe_out, _rgba(mix, "A"))
            nt.links.new(_rgba(tint, "Result"), _rgba(mix, "B"))
            farbe_out = _rgba(mix, "Result")
        if durchsichtig and not leuchtet:
            # reines Weiß (weißes Buntglas) übersteuert in der Sonne und wirkt dann undurchsichtig und leuchtend:
            # Grundfarbe durchsichtiger Blöcke auf 80 % begrenzen, wie echtes Glas, das nie alles zurückwirft
            daempfen = nt.nodes.new("ShaderNodeMix")
            daempfen.data_type = "RGBA"
            daempfen.blend_type = "MULTIPLY"
            daempfen.inputs[0].default_value = 1.0
            nt.links.new(farbe_out, _rgba(daempfen, "A"))
            _rgba(daempfen, "B").default_value = (0.8, 0.8, 0.8, 1)
            farbe_out = _rgba(daempfen, "Result")
        nt.links.new(farbe_out, bsdf.inputs["Base Color"])
        if durchsichtig:
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            if hasattr(mat, "blend_method"):
                mat.blend_method = "HASHED"
        if leuchtet:
            key_e = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
            nt.links.new(farbe_out, bsdf.inputs[key_e])
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = leuchtet
        dunst_einbauen(mat)
        self.cache[key] = mat
        return mat


# Einfärbung wie im Spiel für Blöcke mit tintindex (Gras, Laub, Ranken …)
_TINT_GRAS = ("grass", "fern", "vine", "sugar_cane", "lily_pad")
_TINT_LAUB = ("leaves",)
_GENERISCH = {}
KREUZ_TEXTUR = {}  # Pflanzenblock → Texturname (z. B. sunflower → sunflower_bottom)


def _modell(ordner, name, tiefe=0):
    """Blockmodell mit aufgelösten Eltern: (textures-dict, parent-Kette)."""
    pfad = os.path.join(ordner, "..", "models", "block", f"{name}.json")
    if tiefe > 8 or not os.path.exists(pfad):
        return {}, []
    import json as _json
    with open(pfad, encoding="utf-8") as fh:
        m = _json.load(fh)
    eltern = m.get("parent", "").split("/")[-1].replace("minecraft:", "")
    tex, kette = _modell(ordner, eltern, tiefe + 1) if eltern else ({}, [])
    tex = {**tex, **m.get("textures", {})}
    return tex, [name] + kette


def _blockstate_modell(ordner, art):
    """Name des ersten Modells im Blockstate (variants oder multipart), z. B. pink_petals → pink_petals_1."""
    pfad = os.path.join(ordner, "..", "blockstates", f"{art}.json")
    if not os.path.exists(pfad):
        return None
    import json as _json
    with open(pfad, encoding="utf-8") as fh:
        b = _json.load(fh)
    if b.get("variants"):
        v = next(iter(b["variants"].values()))
    elif b.get("multipart"):
        v = b["multipart"][0].get("apply")
    else:
        return None
    v = v[0] if isinstance(v, list) else v
    return (v or {}).get("model", "").split("/")[-1].replace("minecraft:", "") or None


def art_info(art, texturen=None):
    """Block-Eintrag: aus ARTEN oder – für jeden anderen Block der Spieldatei – aus seinem Blockmodell abgeleitet
    (cube_all, cube_column, cube_bottom_top, orientable, cross …). So kennt ContentStudio alle Blöcke, auch neue."""
    if art in ARTEN:
        return ARTEN[art]
    if art in _GENERISCH:
        return _GENERISCH[art]
    if texturen is None:
        raise KeyError(art)
    tex, kette = {}, []
    # Manche Blöcke haben nur Teilmodelle (Doppelpflanzen, Wachstumsstufen, Zustände) oder gar kein eigenes Modell
    # (gewachstes Kupfer): dann das erste Modell aus dem Blockstate, sonst die ungewachste Fassung
    for kandidat in (art, _blockstate_modell(texturen.ordner, art), art.removeprefix("waxed_"), f"{art}_bottom", f"{art}_stage3", f"{art}_stage2", f"{art}_0", f"{art}_1", f"{art}_inventory", f"{art}_off", f"{art}_floor", f"{art}_ns"):
        if not kandidat:
            continue
        tex, kette = _modell(texturen.ordner, kandidat)
        # nur ein Modell mit echten Texturen zählt (pointed_dripstone.json ist eine leere Vorlage)
        if kette and any(isinstance(v, dict) or (isinstance(v, str) and not v.startswith("#")) for v in tex.values()):
            break
    modell = kette[0] if kette else None

    def t(*schluessel):
        for s in schluessel:
            v = tex.get(s)
            while isinstance(v, (str, dict)):
                if isinstance(v, dict):  # neue Spielversionen: {"sprite": "minecraft:block/glass", "force_translucent": true}
                    v = v.get("sprite")
                elif v.startswith("#"):
                    v = tex.get(v[1:])
                else:
                    break
            if isinstance(v, str):
                return v.split("/")[-1]
        return None

    ungefaerbt = any(k in art for k in ("cherry", "azalea", "pale_oak"))  # im Spiel nicht eingefärbt
    farbe = None if ungefaerbt else LAUB if any(k in art for k in _TINT_LAUB) else (GRAS if any(k in art for k in _TINT_GRAS) else None)
    if any(k.startswith(("flowerbed", "template_leaf_litter")) for k in kette):
        # Bodendecker (Rosa Blütenblätter, Wildblumen, Laubstreu): flach mit Transparenz wie Pflanzen, nie als Würfel
        info = {"alle": (t("flowerbed", "texture") or art, farbe if "leaf_litter" in art else None), "kreuz": True, "durchsichtig": True}
        KREUZ_TEXTUR[art] = info["alle"][0]
    elif "cross" in kette or "tinted_cross" in kette or "flower_pot_cross" in kette or ("cross" in tex and not any(k in tex for k in ("all", "side", "top"))):
        info = {"alle": (t("cross", "plant") or art, farbe), "kreuz": True, "durchsichtig": True}
        KREUZ_TEXTUR[art] = info["alle"][0]
    else:
        # sonst die erste echte Textur des Modells (Glasscheiben: „pane“, Ketten, Gitter …)
        alle = t("all", "texture", "particle") or t(*[k for k, v in tex.items() if isinstance(v, dict) or (isinstance(v, str) and not v.startswith("#"))])
        oben = t("top", "end", "up") or alle
        unten = t("bottom", "end", "down") or oben
        seite = t("side", "front", "north") or alle
        if not (oben or seite):
            if os.path.exists(os.path.join(texturen.ordner, "block", f"{art}.png")):
                oben = unten = seite = art
            else:
                raise KeyError(f"Block „{art}“ gibt es in dieser Spielversion nicht")
        info = {"oben": (oben or seite, farbe), "unten": (unten or seite, None), "seite": (seite or oben, farbe if "leaves" in art else None)}
        vorn = t("front")
        if vorn and vorn != (seite or oben):  # eigenes Gesicht vorn (geschnitzter Kürbis, Ofen, Werkbank …)
            info["vorn"] = (vorn, None)
        if any(k in art for k in ("glass", "leaves", "ice")) and "packed" not in art:
            info["durchsichtig"] = True
        if any(k in art for k in ("glowstone", "lantern", "shroomlight", "sea_lantern", "magma", "froglight", "lamp_on", "campfire", "torch", "candle")):
            info["leuchtet"] = 1.5
        # Kein voller Würfel (Laterne, Lagerfeuer, Sculk-Sensor, Kette, Treppe …): echte Form aus dem Blockmodell
        # statt einer Kiste mit Textur (Test 02.10.: Seelenlaterne schwebte als Würfel über dem Kopf)
        elemente = _elemente(texturen.ordner, modell) if modell else None
        if elemente and not _voller_wuerfel(elemente):
            info["modell"] = {"elemente": elemente, "texturen": {k: t(k) for k in tex}}
            info["durchsichtig"] = True
    _GENERISCH[art] = info
    return info


def _elemente(ordner, name, tiefe=0):
    """Quader („elements“) des Blockmodells, vom Modell selbst oder vom nächsten Elternmodell, das welche hat."""
    pfad = os.path.join(ordner, "..", "models", "block", f"{name}.json")
    if tiefe > 8 or not os.path.exists(pfad):
        return None
    import json as _json
    with open(pfad, encoding="utf-8") as fh:
        m = _json.load(fh)
    if m.get("elements"):
        return m["elements"]
    eltern = m.get("parent", "").split("/")[-1].replace("minecraft:", "")
    return _elemente(ordner, eltern, tiefe + 1) if eltern else None


def _voller_wuerfel(elemente):
    return len(elemente) == 1 and list(elemente[0].get("from", [])) == [0, 0, 0] and list(elemente[0].get("to", [])) == [16, 16, 16]


# Minecraft-Flächen: Standard-UV aus den Koordinaten (wie das Spiel sie ohne „uv“ ableitet), Ecken außen gesehen
_MC_FLAECHEN = {
    "north": (lambda x, y, z: (16 - x, 16 - y), lambda f, t: [(t[0], f[1], f[2]), (f[0], f[1], f[2]), (f[0], t[1], f[2]), (t[0], t[1], f[2])]),
    "south": (lambda x, y, z: (x, 16 - y), lambda f, t: [(f[0], f[1], t[2]), (t[0], f[1], t[2]), (t[0], t[1], t[2]), (f[0], t[1], t[2])]),
    "west": (lambda x, y, z: (z, 16 - y), lambda f, t: [(f[0], f[1], f[2]), (f[0], f[1], t[2]), (f[0], t[1], t[2]), (f[0], t[1], f[2])]),
    "east": (lambda x, y, z: (16 - z, 16 - y), lambda f, t: [(t[0], f[1], t[2]), (t[0], f[1], f[2]), (t[0], t[1], f[2]), (t[0], t[1], t[2])]),
    "up": (lambda x, y, z: (x, z), lambda f, t: [(f[0], t[1], t[2]), (t[0], t[1], t[2]), (t[0], t[1], f[2]), (f[0], t[1], f[2])]),
    "down": (lambda x, y, z: (x, 16 - z), lambda f, t: [(f[0], f[1], f[2]), (t[0], f[1], f[2]), (t[0], f[1], t[2]), (f[0], f[1], t[2])]),
}


def _drehen_mc(p, rot):
    """Element-Drehung wie im Spiel: um `origin`, Achse x/y/z, Winkel in Grad."""
    import math as _m
    if not rot:
        return p
    o = rot.get("origin", [8, 8, 8])
    w = _m.radians(rot.get("angle", 0))
    c, s = _m.cos(w), _m.sin(w)
    x, y, z = p[0] - o[0], p[1] - o[1], p[2] - o[2]
    a = rot.get("axis", "y")
    if a == "x":
        y, z = y * c - z * s, y * s + z * c
    elif a == "y":
        x, z = x * c + z * s, -x * s + z * c
    else:
        x, y = x * c - y * s, x * s + y * c
    return (x + o[0], y + o[1], z + o[2])


def _modell_flaechen(x, y, z, info, versatz):
    """Flächen eines Modell-Blocks in Zelle (x, y, z): Liste (4 Ecken in Metern, 4 UV in Pixeln 0–16, Texturname).
    Minecraft (x Ost, y oben, z Süd) → MoinStudio (x, −z, y), damit Süden zur Kamera-Vorderseite −Y zeigt."""
    texn = info["modell"]["texturen"]
    flaechen = []
    for el in info["modell"]["elemente"]:
        f, t = el.get("from", [0, 0, 0]), el.get("to", [16, 16, 16])
        for seite, fl in (el.get("faces") or {}).items():
            if seite not in _MC_FLAECHEN:
                continue
            uv_std, ecken_mc = _MC_FLAECHEN[seite]
            ecken = ecken_mc(f, t)
            std = [uv_std(*e) for e in ecken]
            u_lo, u_hi = min(u for u, _ in std), max(u for u, _ in std)
            v_lo, v_hi = min(v for _, v in std), max(v for _, v in std)
            u1, v1, u2, v2 = fl.get("uv", [u_lo, v_lo, u_hi, v_hi])
            uv = [(u1 + ((u - u_lo) / (u_hi - u_lo) if u_hi > u_lo else 0) * (u2 - u1),
                   v1 + ((v - v_lo) / (v_hi - v_lo) if v_hi > v_lo else 0) * (v2 - v1)) for u, v in std]
            dreh = int(fl.get("rotation", 0)) // 90 % 4
            uv = uv[dreh:] + uv[:dreh]
            ref = fl.get("texture", "").lstrip("#")
            name = texn.get(ref) or (ref.split("/")[-1] if ref and "/" in ref else None)
            if not name:
                continue
            welt_ecken = []
            for e in ecken:
                mx, my, mz = _drehen_mc(e, el.get("rotation"))
                welt_ecken.append(((x + mx / 16) * BLOCK + versatz[0], (y + 1 - mz / 16) * BLOCK + versatz[1], (z - 1 + my / 16) * BLOCK + versatz[2]))
            flaechen.append((welt_ecken, uv, name))
    return flaechen


def _seiten_textur(art, seite):
    d = art_info(art)
    if "alle" in d:
        return d["alle"], None
    if seite == "oben":
        return d["oben"], None
    if seite == "unten":
        return d["unten"], None
    if seite == "vorn" and "vorn" in d:
        return d["vorn"], None
    return d["seite"], d.get("overlay")


def baue(welt, texturen, name="welt", collection=None, versatz=(0.0, 0.0, 0.0)):
    """Baut ein Blockraster als ein Objekt. `welt`: {(x, y, z): art}. Gibt das Objekt zurück."""
    col = collection or bpy.context.scene.collection
    verts, faces, uvs, mat_idx = [], [], [], []
    mats, mat_nr = [], {}
    kreuze = []  # Pflanzenblöcke (Blumen, Setzlinge …) als gekreuzte Flächen
    for (x, y, z), art in welt.items():
        info = art_info(art, texturen)
        if info.get("kreuz"):
            kreuze.append((x, y, z, art))
            continue
        if info.get("modell"):
            for ecken_w, uv_px, tname in _modell_flaechen(x, y, z, info, versatz):
                key = ((tname, None), None)
                if key not in mat_nr:
                    try:
                        m = texturen.material(tname, None, None, True, info.get("leuchtet", 0.0))
                    except FileNotFoundError:
                        continue  # Textur liegt nicht unter block/ – Fläche weglassen statt die Welt scheitern lassen
                    mat_nr[key] = len(mats)
                    mats.append(m)
                img = mats[mat_nr[key]].node_tree.nodes.get("Image Texture").image
                w, h = img.size
                f = w / h if h > w else 1.0  # animierte Streifen: erstes Bild
                base = len(verts)
                verts.extend(ecken_w)
                faces.append((base, base + 1, base + 2, base + 3))
                uvs.extend([(u / 16, 1 - (v / 16) * f) for u, v in uv_px])
                mat_idx.append(mat_nr[key])
            continue
        for seite, ((nx, ny, nz), ecken) in SEITEN.items():
            nachbar = welt.get((x + nx, y + ny, z + nz))
            if nachbar is not None:
                n_info = art_info(nachbar, texturen)
                # verdeckt, außer ein durchsichtiger/flüssiger Nachbar einer anderen Art
                if not n_info.get("durchsichtig") or nachbar == art:
                    continue
            # Flüssigkeiten: nur die Oberseite ein Stück tiefer (wie im Spiel)
            tex, overlay = _seiten_textur(art, seite)
            key = (tex, overlay)
            if key not in mat_nr:
                mat_nr[key] = len(mats)
                mats.append(texturen.material(tex[0], tex[1], overlay, info.get("durchsichtig", False), info.get("leuchtet", 0.0)))
            base = len(verts)
            oben = 0.875 if info.get("fluessig") and welt.get((x, y, z + 1)) != art else 1.0
            for cx, cy, cz in ecken:
                verts.append(((x + cx) * BLOCK + versatz[0], (y + cy) * BLOCK + versatz[1], (z - 1 + cz * oben) * BLOCK + versatz[2]))
            faces.append((base, base + 1, base + 2, base + 3))
            # Streifen-Texturen (animiert): erstes Bild oben im Streifen
            img = mats[mat_nr[key]].node_tree.nodes.get("Image Texture").image
            w, h = img.size
            f = w / h if h > w else 1.0
            uvs.extend([(0, 1 - f), (1, 1 - f), (1, 1), (0, 1)])
            mat_idx.append(mat_nr[key])
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    layer = me.uv_layers.new(name="uv")
    for poly in me.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[me.loops[li].vertex_index]
    for m in mats:
        me.materials.append(m)
    for poly, mi in zip(me.polygons, mat_idx):
        poly.material_index = mi
    me.update()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if kreuze:  # Pflanzenblöcke aus „bloecke“ (Blumen, Setzlinge, Pilze …) mit ihrer Kreuz-Textur
        for x, y, z, art in kreuze:
            PFLANZEN.setdefault(art, art_info(art)["alle"][1])
        baue_pflanzen(kreuze, texturen, name=f"{name}.pflanzen", collection=collection)
    return ob


# Pflanzen (Stilbuch 7: Welt nie leer): gekreuzte Flächen mit echter Textur, eingefärbt wie im Spiel
PFLANZEN = {
    "short_grass": GRAS,
    "fern": GRAS,
    "tall_grass_bottom": GRAS,
    "tall_grass_top": GRAS,
    "dandelion": None,
    "poppy": None,
    "cornflower": None,
    "oxeye_daisy": None,
    "azure_bluet": None,
}


def baue_pflanzen(pflanzen, texturen, name="pflanzen", collection=None):
    """`pflanzen`: Liste (x, y, z, art) – die Pflanze steht im Luftblock (x, y, z) auf dem Block darunter."""
    col = collection or bpy.context.scene.collection
    verts, faces, uvs, mat_idx, mats, nr = [], [], [], [], [], {}
    for x, y, z, art in pflanzen:
        if art not in nr:
            nr[art] = len(mats)
            mats.append(texturen.material(KREUZ_TEXTUR.get(art, art), PFLANZEN.get(art), None, True, 0.0))
        img = mats[nr[art]].node_tree.nodes.get("Image Texture").image
        w, h = img.size
        f = w / h if h > w else 1.0
        # leicht versetzt, damit Reihen nicht wie gestempelt wirken (fester Versatz je Position)
        ox = (((x * 73856093) ^ (y * 19349663)) % 7 - 3) * 0.04
        oy = (((x * 83492791) ^ (y * 2654435761)) % 7 - 3) * 0.04
        cx, cy = x + 0.5 + ox, y + 0.5 + oy
        z0, z1 = (z - 1) * BLOCK, z * BLOCK
        for (ax, ay), (bx, by) in (((-0.45, -0.45), (0.45, 0.45)), ((-0.45, 0.45), (0.45, -0.45))):
            b = len(verts)
            verts += [((cx + ax) * BLOCK, (cy + ay) * BLOCK, z0), ((cx + bx) * BLOCK, (cy + by) * BLOCK, z0),
                      ((cx + bx) * BLOCK, (cy + by) * BLOCK, z1), ((cx + ax) * BLOCK, (cy + ay) * BLOCK, z1)]
            faces.append((b, b + 1, b + 2, b + 3))
            uvs += [(0, 1 - f), (1, 1 - f), (1, 1), (0, 1)]
            mat_idx.append(nr[art])
    if not faces:
        return None
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    layer = me.uv_layers.new(name="uv")
    for poly in me.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[me.loops[li].vertex_index]
    for m in mats:
        me.materials.append(m)
    for poly, mi in zip(me.polygons, mat_idx):
        poly.material_index = mi
    me.update()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob
