"""Gelände aus Blöcken (ROADMAP 4.3). Die Figur steht bei (0, 0) auf z = 0 und schaut nach −Y zur Kamera; das Thema
liegt auf der +X-Seite (Stilbuch: Figur am Rand, das Thema in der anderen Bildhälfte).

Bausteine statt fester Orte: Plateau, Kante mit Abgrund, Wasser/Lava am Grund, Hügel, Bäume, Wolken. Jede
Beschreibung setzt sich daraus zusammen.
"""
import math
import os
import random

import bpy

from . import bloecke
from .bloecke import BLOCK


def _rauschen(seed, skala):
    """Weiches Werterauschen 0..1 (ohne Zusatzpakete)."""
    rnd = random.Random(seed)
    gitter = {}

    def wert(ix, iy):
        if (ix, iy) not in gitter:
            gitter[(ix, iy)] = rnd.random()
        return gitter[(ix, iy)]

    def f(x, y):
        gx, gy = x / skala, y / skala
        x0, y0 = math.floor(gx), math.floor(gy)
        tx, ty = gx - x0, gy - y0
        sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = wert(x0, y0) + (wert(x0 + 1, y0) - wert(x0, y0)) * sx
        b = wert(x0, y0 + 1) + (wert(x0 + 1, y0 + 1) - wert(x0, y0 + 1)) * sx
        return a + (b - a) * sy

    return f


def _saeule(welt, x, y, oben, oberflaeche="grass_block", fuellung="dirt", tief=4, stein_bis=None):
    """Eine Geländesäule: Oberfläche bei z = oben, darunter Erde, dann Stein bis `stein_bis`."""
    welt[(x, y, oben)] = oberflaeche
    for z in range(oben - 1, oben - tief, -1):
        welt[(x, y, z)] = fuellung
    unten = stein_bis if stein_bis is not None else oben - tief - 1
    for z in range(oben - tief, unten - 1, -1):
        welt[(x, y, z)] = "stone" if (x * 7 + y * 13 + z * 3) % 11 else "andesite"


def baum(welt, x, y, boden, rnd):
    hoehe = rnd.randint(4, 6)
    for z in range(boden + 1, boden + 1 + hoehe):
        welt[(x, y, z)] = "oak_log"
    krone = boden + hoehe
    for dz, r in ((-1, 2), (0, 2), (1, 1), (2, 1)):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if abs(dx) == r and abs(dy) == r and (dz > 0 or rnd.random() < 0.5):
                    continue
                p = (x + dx, y + dy, krone + dz)
                if p not in welt:
                    welt[p] = "oak_leaves"


def klippe(seed=7, kante=2, tiefe=20, grund="water", gegenseite=True, breite=(-26, 44), laenge=(-14, 70)):
    """Plateau auf der Figurseite (x ≤ kante), dahinter der Abgrund nach +X bis zum Grund (Wasser/Lava/Stein).
    `gegenseite`: True = Schlucht mit Hügeln gegenüber, False = offenes Meer bis zum Horizont (Meeresklippe)."""
    rnd = random.Random(seed)
    welt = {}
    huegel = _rauschen(seed, 9.0)
    fern = _rauschen(seed + 1, 17.0)
    grund_z = -tiefe
    for x in range(breite[0], breite[1]):
        for y in range(laenge[0], laenge[1]):
            # Kante leicht unregelmäßig (echte Minecraft-Klippen sind nicht schnurgerade)
            k = kante + (1 if huegel(x, y * 1.7) > 0.72 and y > 3 else 0) - (1 if huegel(y, x) < 0.2 and y > 6 else 0)
            if x <= k:
                # Plateau: nah am Motiv flach (Standfläche), weiter hinten leicht wellig
                welle = 0 if abs(x) < 5 and y < 6 else int(round((huegel(x, y) - 0.45) * 5 * min(1.0, max(0.0, (y - 4) / 12))))
                oben = max(0, welle)
                # Kantenblock fällt senkrecht bis zum Grund ab (sichtbare Felswand)
                am_rand = x >= k - 1
                _saeule(welt, x, y, oben, stein_bis=grund_z if am_rand else oben - 7)
            else:
                # Gegenüberliegende Seite: Hügel, die zum Grund abfallen
                abstand = x - k
                if gegenseite and abstand > 14:
                    oben = int(round(-tiefe + 6 + fern(x, y) * 8 + max(0, y - 30) * 0.35))  # Gegenseite tiefer als das Plateau: freier Blick in den Abgrund
                    _saeule(welt, x, y, oben, tief=3, stein_bis=min(oben - 4, grund_z))
                else:
                    welt[(x, y, grund_z)] = "gravel" if huegel(x * 2, y * 2) > 0.5 else "sand"
                    # offenes Meer: eine durchgehende Wasserfläche (meer), keine Wasserblöcke – sonst sichtbare Naht
                    if grund in ("water", "lava") and (gegenseite or grund == "lava"):
                        for z in range(grund_z + 1, grund_z + 3):
                            welt[(x, y, z)] = grund
    # Bäume hinten auf dem Plateau und gegenüber
    for _ in range(26):
        x = rnd.randint(breite[0] + 3, breite[1] - 3)
        y = rnd.randint(10, laenge[1] - 4)
        oberste = max((z for z in range(-8, 16) if welt.get((x, y, z)) == "grass_block"), default=None)
        if oberste is not None:
            baum(welt, x, y, oberste, rnd)
    return welt


def bepflanzen(welt, seed=3, frei_radius=2.0, dichte=0.28):
    """Gras und Blumen auf allen freien Grasblöcken (wie im Ebenen-Biom), um die Figur herum frei."""
    rnd = random.Random(seed)
    blumen = ["dandelion", "poppy", "cornflower", "oxeye_daisy", "azure_bluet"]
    liste = []
    for (x, y, z), art in welt.items():
        if art != "grass_block" or (x, y, z + 1) in welt:
            continue
        if math.hypot(x + 0.5, y + 0.5) < frei_radius:
            continue
        r = rnd.random()
        if r < 0.03:
            liste.append((x, y, z + 1, rnd.choice(blumen)))
        elif r < dichte:
            liste.append((x, y, z + 1, "fern" if rnd.random() < 0.08 else "short_grass"))
    return liste


def wolken(texturen_ordner, hoehe=34, zentrum=(10, 40), groesse=64, zelle=6, collection=None):
    """Echte Minecraft-Wolken aus `environment/clouds.png` (jedes Pixel = eine Wolkenzelle) als flache Quader."""
    pfad = os.path.join(texturen_ordner, "environment", "clouds.png")
    img = bpy.data.images.load(pfad, check_existing=True)
    w, h = img.size
    px = img.pixels[:]
    col = collection or bpy.context.scene.collection
    verts, faces = [], []
    d = 1.2 * BLOCK
    ox, oy = zentrum[0] * BLOCK, zentrum[1] * BLOCK
    for j in range(groesse):
        for i in range(groesse):
            a = px[(((j * 3) % h) * w + ((i * 3) % w)) * 4 + 3]
            if a < 0.5:
                continue
            x0 = ox + (i - groesse / 2) * zelle * BLOCK
            y0 = oy + (j - groesse / 2) * zelle * BLOCK
            x1, y1 = x0 + zelle * BLOCK, y0 + zelle * BLOCK
            z0, z1 = hoehe * BLOCK, hoehe * BLOCK + d
            b = len(verts)
            verts += [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
            faces += [(b, b + 1, b + 2, b + 3), (b + 4, b + 7, b + 6, b + 5), (b, b + 4, b + 5, b + 1), (b + 1, b + 5, b + 6, b + 2), (b + 2, b + 6, b + 7, b + 3), (b + 3, b + 7, b + 4, b)]
    me = bpy.data.meshes.new("wolken")
    me.from_pydata(verts, [], faces)
    mat = bpy.data.materials.new("wolken")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    key_e = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    bsdf.inputs[key_e].default_value = (1, 1, 1, 1)
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.35
    me.materials.append(mat)
    ob = bpy.data.objects.new("wolken", me)
    col.objects.link(ob)
    return ob


def _erstes_bild(img):
    """Erstes Bild eines Animationsstreifens (Wasser, Lava) als eigenes, kachelbares Bild."""
    w, h = img.size
    if h <= w:
        return img
    px = img.pixels[:]
    oben = px[(h - w) * w * 4:]  # Blender speichert Zeilen von unten; das erste Bild liegt oben im Streifen
    neu = bpy.data.images.new(f"{img.name}.bild1", w, w, alpha=True)
    neu.pixels.foreach_set(oben)
    neu.update()
    return neu


def meer(texturen, tiefe, von_x, collection=None):
    """Offenes Meer bis zum Horizont: große Fläche mit der echten Wassertextur (gekachelt, eingefärbt wie im Spiel)
    auf Höhe des Wassers im Abgrund."""
    col = collection or bpy.context.scene.collection
    img = _erstes_bild(texturen.bild("water_still"))
    mat = bpy.data.materials.new("meer")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.08
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    tex.extension = "REPEAT"
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs["Color"], bloecke._rgba(mul, "A"))
    bloecke._rgba(mul, "B").default_value = (*bloecke.WASSER, 1)
    nt.links.new(bloecke._rgba(mul, "Result"), bsdf.inputs["Base Color"])
    me = bpy.data.meshes.new("meer")
    z = (-tiefe + 1.875) * BLOCK  # gleiche Höhe wie die Wasserblöcke im Abgrund (oberster bei grund + 2, 7/8 hoch)
    s = 1200.0
    x0 = von_x * BLOCK
    me.from_pydata([(x0, -s, z), (s, -s, z), (s, s, z), (x0, s, z)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="uv")
    kachel = [(0, 0), ((s - x0) / BLOCK, 0), ((s - x0) / BLOCK, 2 * s / BLOCK), (0, 2 * s / BLOCK)]
    for li, (u, v) in enumerate(kachel):
        uv.data[li].uv = (u, v)
    bloecke.dunst_einbauen(mat)
    me.materials.append(mat)
    ob = bpy.data.objects.new("meer", me)
    col.objects.link(ob)
    return ob


def dunst(von, bis, dichte=0.035, farbe=(0.62, 0.78, 1.0), collection=None):
    """Luftperspektive (Stilbuch 6/7): ein Volumen, das Tiefe sichtbar macht – z. B. im Abgrund unter der Kante.
    `von`/`bis`: Ecken in Blöcken."""
    col = collection or bpy.context.scene.collection
    lo = [v * BLOCK for v in von]
    hi = [v * BLOCK for v in bis]
    me = bpy.data.meshes.new("dunst")
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(verts, [], faces)
    mat = bpy.data.materials.new("dunst")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*farbe, 1)
    vol.inputs["Density"].default_value = dichte
    nt.links.new(vol.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
    me.materials.append(mat)
    ob = bpy.data.objects.new("dunst", me)
    col.objects.link(ob)
    return ob


def _oberflaeche(welt, x, y):
    return max((z for z in range(-12, 24) if welt.get((x, y, z)) in ("grass_block", "dirt_path", "farmland")), default=0)


def _ebne(welt, x0, x1, y0, y1, hoehe, oben="grass_block"):
    """Fläche einebnen: Oberfläche auf `hoehe`, darüber frei, darunter Erde."""
    for x in range(x0, x1):
        for y in range(y0, y1):
            for z in range(hoehe + 1, hoehe + 12):
                welt.pop((x, y, z), None)
            welt[(x, y, hoehe)] = oben
            for z in range(hoehe - 3, hoehe):
                welt.setdefault((x, y, z), "dirt")


def haus(welt, x0, y0, breite, tiefe, rnd, tuer_seite="vorn"):
    """Dorfhaus wie in der Ebenen-Siedlung: Bruchstein-Sockel, Stamm-Ecken, Bretterwände, Glasfenster, Tür,
    gestuftes Fichtendach. Grundfläche ab (x0, y0), eingeebnet."""
    boden = max(_oberflaeche(welt, x, y) for x in range(x0, x0 + breite) for y in range(y0, y0 + tiefe))
    _ebne(welt, x0 - 1, x0 + breite + 1, y0 - 1, y0 + tiefe + 1, boden)
    wand = 4
    for x in range(x0, x0 + breite):
        for y in range(y0, y0 + tiefe):
            rand_x, rand_y = x in (x0, x0 + breite - 1), y in (y0, y0 + tiefe - 1)
            welt[(x, y, boden)] = "cobblestone"
            if not (rand_x or rand_y):
                welt[(x, y, boden + 1)] = "oak_planks"  # Fußboden
                continue
            for dz in range(1, wand + 1):
                z = boden + dz
                if rand_x and rand_y:
                    art = "oak_log"
                elif dz == 1:
                    art = "cobblestone"
                elif dz in (2, 3) and ((rand_x and (y - y0) % 3 == 1) or (rand_y and (x - x0) % 3 == 1)):
                    art = "glass"
                else:
                    art = "oak_planks"
                welt[(x, y, z)] = art
    # Tür (zwei Blöcke frei) in der Mitte der Vorderseite (−Y, zur Kamera)
    tx = x0 + breite // 2
    ty = y0 if tuer_seite == "vorn" else y0 + tiefe - 1
    for dz in (1, 2):
        welt.pop((tx, ty, boden + dz), None)
    welt[(tx, ty - 1 if tuer_seite == "vorn" else ty + 1, boden)] = "dirt_path"
    # Dach: Stufen über die Breite (First entlang Y)
    for stufe in range((breite + 3) // 2):
        z = boden + wand + 1 + stufe
        for x in (x0 - 1 + stufe, x0 + breite - stufe):
            for y in range(y0 - 1, y0 + tiefe + 1):
                welt[(x, y, z)] = "spruce_planks"
        if x0 - 1 + stufe >= x0 + breite - stufe - 1:
            break
        # Giebel zwischen den Stufen
        for x in range(x0 + stufe, x0 + breite - stufe):
            for y in (y0, y0 + tiefe - 1):
                if z <= boden + wand + (breite + 1) // 2:
                    welt[(x, y, z)] = "oak_planks"
    return boden


def dorf(seed=7, haeuser=5):
    """Ebenen-Dorf: Wiese, Häuser mit Wegen, Weizenfeld mit Wasserrinne, Heuballen, Brunnen.
    Die Figur steht bei (0, 0) auf freiem Gras; das Dorf liegt vor allem auf der Themenseite (+X) und dahinter."""
    rnd = random.Random(seed)
    welt = klippe(seed=seed, kante=200, tiefe=6, gegenseite=True)
    # Bäume weg, wo das Dorf steht
    for p in [p for p, a in welt.items() if a in ("oak_log", "oak_leaves") and 2 < p[0] < 34 and 2 < p[1] < 40]:
        welt.pop(p)
    pflanzen = []
    # Hauptweg entlang Y, Querwege zu den Häusern
    weg_x = 9
    for y in range(-4, 44):
        for x in (weg_x, weg_x + 1):
            z = _oberflaeche(welt, x, y)
            _ebne(welt, x, x + 1, y, y + 1, z, oben="dirt_path")
    plaetze = [(3, 6, 5, 5), (13, 4, 6, 5), (13, 14, 5, 6), (2, 16, 6, 5), (14, 25, 7, 5), (3, 28, 5, 5), (22, 10, 5, 5)]
    for x0, y0, b, t in plaetze[:haeuser]:
        haus(welt, x0, y0, b, t, rnd)
    # Brunnen am Weg
    bz = _oberflaeche(welt, weg_x - 2, 12)
    for dx in range(-1, 2):
        for dy in range(-1, 2):
            p = (weg_x - 2 + dx, 12 + dy)
            welt[(p[0], p[1], bz + 1)] = "water" if (dx, dy) == (0, 0) else "cobblestone"
    # Weizenfeld mit Wasserrinne
    fx, fy = 22, 20
    fz = _oberflaeche(welt, fx, fy)
    for x in range(fx, fx + 9):
        for y in range(fy, fy + 7):
            wasser = x == fx + 4
            _ebne(welt, x, x + 1, y, y + 1, fz, oben="water" if wasser else "farmland")
            if not wasser:
                pflanzen.append((x, y, fz + 1, "wheat_stage7"))
    # Heuballen
    for x, y in ((12, 11), (12, 12), (21, 18)):
        z = _oberflaeche(welt, x, y)
        welt[(x, y, z + 1)] = "hay_block"
    return welt, pflanzen


def baue_dorf(texturen_ordner, aenderungen=None, **kw):
    tex = bloecke.Texturen(texturen_ordner)
    raster, felder = dorf(**kw)
    aendern(raster, aenderungen)
    ob = bloecke.baue(raster, tex, "dorf")
    bloecke.baue_pflanzen(bepflanzen(raster) + felder, tex)
    return ob


RAUM_ARTEN = {
    # Boden/Wand, Tiefe (ab z −4), Erze mit Häufigkeit, Decken-Leuchtblock, Bodenflecken
    "hoehle": {"stein": "stone", "tief": "deepslate", "erze": (("coal_ore", 0.035), ("iron_ore", 0.015), ("gold_ore", 0.004),
                                                           ("redstone_ore", 0.005), ("diamond_ore", 0.004)),
               "tief_erze": (("deepslate_diamond_ore", 0.01), ("deepslate_iron_ore", 0.012)),
               "boden": (("gravel", 0.12), ("tuff", 0.06)), "decke_licht": None, "decke": 7, "decke_var": 6},
    "nether": {"stein": "netherrack", "tief": "netherrack", "erze": (("nether_quartz_ore", 0.03), ("nether_gold_ore", 0.012)),
               "tief_erze": (), "boden": (("soul_sand", 0.08), ("magma_block", 0.05), ("blackstone", 0.05)),
               "decke_licht": "glowstone", "decke": 14, "decke_var": 10},
}


def raum(art="hoehle", seed=7, grund="lava", becken_ab=4, breite=(-12, 38), laenge=(-14, 48)):
    """Geschlossener Raum aus Blöcken (Höhle, Nether): Boden bei z = 0 um die Figur, Decke darüber, Wände ringsum.
    Auf der Themenseite (x ≥ becken_ab) senkt sich der Boden zu einem Becken mit `grund` (Lava/Wasser/None)."""
    a = RAUM_ARTEN[art]
    rnd = random.Random(seed)
    boden_r = _rauschen(seed, 7.0)
    decke_r = _rauschen(seed + 5, 6.0)
    wand_r = _rauschen(seed + 9, 5.0)
    welt = {}

    def fels(x, y, z, oberflaeche=False):
        basis = a["tief"] if z < -4 else a["stein"]
        for name, p in (a["tief_erze"] if z < -4 else a["erze"]):
            if rnd.random() < p:
                return name
        if oberflaeche:
            for name, p in a["boden"]:
                if rnd.random() < p:
                    return name
        return basis

    for x in range(breite[0], breite[1]):
        for y in range(laenge[0], laenge[1]):
            # Wände: unregelmäßiger Rand des Raums
            w = wand_r(x, y)
            innen = (breite[0] + 3 + w * 4 < x < breite[1] - 3 - w * 4) and (y < laenge[1] - 3 - w * 5)
            nah = abs(x) < 4 and -6 < y < 5  # Standfläche der Figur und Platz für die Kamera
            if x >= becken_ab and not nah:
                boden = -2 - int(boden_r(x, y) * 2)
            else:
                boden = 0 if nah else int(round((boden_r(x, y) - 0.5) * 2))
            decke = a["decke"] + int(decke_r(x, y) * a["decke_var"]) + max(0, y - 10) // 4
            unten = boden - 3
            if not innen:
                for z in range(unten, decke + 4):
                    welt[(x, y, z)] = fels(x, y, z)
                continue
            for z in range(unten, boden + 1):
                welt[(x, y, z)] = fels(x, y, z, oberflaeche=(z == boden))
            if x >= becken_ab and not nah and grund:
                for z in range(boden + 1, 0):
                    welt[(x, y, z)] = grund
            for z in range(decke, decke + 3):
                welt[(x, y, z)] = fels(x, y, z)
            # Tropfsteinartige Zapfen und Leuchtblöcke an der Decke
            if a["decke_licht"] and rnd.random() < 0.025:
                for dz in range(rnd.randint(1, 3)):
                    welt[(x, y, decke - 1 - dz)] = a["decke_licht"]
            elif rnd.random() < 0.02:
                for dz in range(rnd.randint(1, 3)):
                    welt[(x, y, decke - 1 - dz)] = fels(x, y, decke)
    return welt


def raumlicht(art, becken_ab=4, collection=None):
    """Licht im geschlossenen Raum: warmes Leuchten aus dem Becken, schwaches kühles Füllicht von vorn."""
    col = collection or bpy.context.scene.collection
    lichter = []
    farbe = (1.0, 0.45, 0.12) if art == "nether" else (1.0, 0.55, 0.2)
    for i, (x, y) in enumerate(((becken_ab + 6, 6), (becken_ab + 12, 18), (becken_ab + 4, 28))):
        l = bpy.data.lights.new(f"becken{i}", "POINT")
        l.energy = 3500 if i == 0 else 2200
        l.color = farbe
        l.shadow_soft_size = 3.0
        ob = bpy.data.objects.new(l.name, l)
        ob.location = (x * BLOCK, y * BLOCK, 2.0 * BLOCK)
        col.objects.link(ob)
        lichter.append(ob)
    fuell = bpy.data.lights.new("fuell", "AREA")
    fuell.energy = 500
    fuell.size = 6
    fuell.color = (0.55, 0.65, 1.0) if art == "hoehle" else (1.0, 0.6, 0.45)
    ob = bpy.data.objects.new("fuell", fuell)
    ob.location = (-2 * BLOCK, -10 * BLOCK, 6 * BLOCK)
    ob.rotation_euler = (math.radians(60), 0, math.radians(-10))
    ob.visible_camera = False
    col.objects.link(ob)
    lichter.append(ob)
    return lichter


def aendern(welt, liste):
    """Blöcke setzen oder wegnehmen (jede Welt, aus der Szenenbeschreibung): [{"art": "bedrock" | "luft", "von": [x, y, z],
    "bis": [x, y, z], "waende": "stone"}]. Beim Wegnehmen (Grube, Tunnel) bekommen die freigelegten Ränder und der Boden
    Wände aus `waende`, damit nie ein Loch ins Leere entsteht."""
    for e in liste or []:
        art = e["art"]
        (x0, y0, z0), (x1, y1, z1) = e["von"], e.get("bis", e["von"])
        x0, x1 = sorted((int(x0), int(x1)))
        y0, y1 = sorted((int(y0), int(y1)))
        z0, z1 = sorted((int(z0), int(z1)))
        # Blockart wird beim Bauen aus ARTEN oder dem Blockmodell der Spieldatei aufgelöst (alle Blöcke)
        # Geländeoberkante je Spalte vor dem Graben: Wände nur bis dorthin, nie in die Luft darüber
        oberkante = {}
        if art == "luft":
            for x in range(x0 - 1, x1 + 2):
                for y in range(y0 - 1, y1 + 2):
                    oberkante[(x, y)] = max((z for z in range(z0 - 2, z1 + 40) if (x, y, z) in welt), default=z0 - 2)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    if art == "luft":
                        welt.pop((x, y, z), None)
                    else:
                        welt[(x, y, z)] = art
        if art == "luft":
            wand = e.get("waende", "stone")
            for x in range(x0 - 1, x1 + 2):
                for y in range(y0 - 1, y1 + 2):
                    for z in range(z0 - 1, z1 + 1):
                        innen = x0 <= x <= x1 and y0 <= y <= y1 and z >= z0
                        if not innen and (x, y, z) not in welt and z <= oberkante[(x, y)]:
                            welt[(x, y, z)] = wand
    return welt


def endwelt(seed=7, radius=34, saeulen=8):
    """Das End: schwebende Endstein-Insel mit welliger Oberfläche und Rand, Obsidiansäulen im Ring (wie um das
    Ausgangsportal), die Figur steht bei (0, 0) nahe dem Inselrand auf der Kameraseite."""
    rnd = random.Random(seed)
    welle = _rauschen(seed, 8.0)
    welt = {}
    mx, my = 0, 14  # Inselmitte hinter der Figur
    for x in range(mx - radius, mx + radius + 1):
        for y in range(my - radius, my + radius + 1):
            d = math.hypot(x - mx, y - my) + (welle(x, y) - 0.5) * 6
            if d > radius:
                continue
            oben = 0 if math.hypot(x, y) < 4 else int(round((welle(x * 1.3, y) - 0.5) * 3))
            dicke = int(3 + (1 - d / radius) * 18)  # Insel wird zur Mitte hin dicker (Unterseite sichtbar)
            for z in range(oben - dicke, oben + 1):
                welt[(x, y, z)] = "end_stone"
    for i in range(saeulen):
        w = i / saeulen * 2 * math.pi + 0.3
        cx, cy = int(mx + math.cos(w) * radius * 0.7), int(my + math.sin(w) * radius * 0.7)
        if math.hypot(cx, cy) < 8:
            continue
        r = rnd.choice((2, 2, 3))
        hoehe = rnd.randint(18, 34)
        for x in range(cx - r, cx + r + 1):
            for y in range(cy - r, cy + r + 1):
                if math.hypot(x - cx, y - cy) <= r + 0.3:
                    for z in range(0, hoehe):
                        welt[(x, y, z)] = "obsidian"
        welt[(cx, cy, hoehe)] = "bedrock"
    return welt


def baue_endwelt(texturen_ordner, aenderungen=None, **kw):
    tex = bloecke.Texturen(texturen_ordner)
    raster = aendern(endwelt(**kw), aenderungen)
    return bloecke.baue(raster, tex, "endwelt")


def meerwelt(grund="lava", breite=(-30, 60), laenge=(-20, 70)):
    """Offenes Meer aus Lava oder Wasser bis zum Horizont; die Figur steht auf einer kleinen Säule bei (0, 0)."""
    welt = {}
    for x in range(breite[0], breite[1]):
        for y in range(laenge[0], laenge[1]):
            welt[(x, y, -1)] = grund
            welt[(x, y, -2)] = "netherrack" if grund == "lava" else "sand"
    for x in (-1, 0):
        for y in (-1, 0):
            for z in range(-3, 1):
                welt[(x, y, z)] = "dirt" if z < 0 else "grass_block"
    return welt


def baue_meerwelt(texturen_ordner, grund="lava", aenderungen=None, **kw):
    tex = bloecke.Texturen(texturen_ordner)
    raster = aendern(meerwelt(grund, **kw), aenderungen)
    return bloecke.baue(raster, tex, "meerwelt")


# Nether nach den Biom-Daten des Spiels (data/minecraft/worldgen/biome/*.json, MoinStudio, 30.09.: „das ist nicht der
# Nether“). Nebelfarbe = fog_color des Bioms, für Thumbnails aufgehellt (Castcrafter 22: heller Dunst in der Tiefe).
NETHER_BIOME = {
    # Nether-Ödland: Netherrack, Lavameer, Glowstone, Magma, Seelensand-Flecken, Erze (fog #330808)
    "oede": {"boden": "netherrack", "unter": "netherrack",
             "flecken": (("magma_block", 0.03), ("soul_sand", 0.05), ("gravel", 0.03), ("nether_quartz_ore", 0.03),
                         ("nether_gold_ore", 0.015), ("blackstone", 0.02)),
             "pflanzen": (("brown_mushroom", 0.012), ("red_mushroom", 0.01)),
             "dunst": (0.60, 0.17, 0.09), "rand": (1.0, 0.5, 0.22), "funken": (1.0, 0.42, 0.08), "licht": (1.0, 0.45, 0.15)},
    # Karmesinwald: Karmesin-Nyzel, Riesenpilze aus crimson_stem mit nether_wart_block und Pilzlicht (fog #330303)
    "karmesin": {"boden": "crimson_nylium", "unter": "netherrack", "flecken": (("nether_wart_block", 0.02),),
                 "pflanzen": (("crimson_roots", 0.10), ("crimson_fungus", 0.02)),
                 "baum": ("crimson_stem", "nether_wart_block"), "baeume": 16,
                 "dunst": (0.50, 0.12, 0.09), "rand": (1.0, 0.45, 0.35), "funken": (1.0, 0.18, 0.12), "licht": (1.0, 0.35, 0.2)},
    # Wirrwald: türkises Nyzel, Riesenpilze aus warped_stem mit warped_wart_block, lila Dunst (fog #1a051a)
    "wirr": {"boden": "warped_nylium", "unter": "netherrack", "flecken": (("warped_wart_block", 0.02),),
             "pflanzen": (("warped_roots", 0.10), ("nether_sprouts", 0.06), ("warped_fungus", 0.02)),
             "baum": ("warped_stem", "warped_wart_block"), "baeume": 16,
             "dunst": (0.30, 0.08, 0.34), "rand": (0.35, 0.95, 0.9), "funken": (0.55, 0.85, 1.0), "licht": (0.6, 0.4, 1.0)},
    # Seelensandtal: Seelensand und -erde, Basaltsäulen, Knochen-Fossilien, blaues Seelenfeuer, türkiser Dunst (#1b4745)
    "seelensand": {"boden": "soul_sand", "unter": "soul_soil", "flecken": (("soul_soil", 0.35), ("basalt", 0.02)),
                   "pflanzen": (), "saeulen": "basalt", "fossilien": True,
                   "dunst": (0.10, 0.36, 0.34), "rand": (0.4, 0.9, 1.0), "funken": (0.85, 0.88, 0.9), "licht": (0.3, 0.8, 1.0)},
    # Basaltdeltas: Basalt und Schwarzstein, viele Säulen, kleine Lavatümpel, grau-violetter Dunst mit Asche (#685f70)
    "basalt": {"boden": "basalt", "unter": "blackstone", "flecken": (("blackstone", 0.3), ("magma_block", 0.05)),
               "pflanzen": (), "saeulen": "basalt", "saeulen_viele": True,
               "dunst": (0.42, 0.37, 0.48), "rand": (1.0, 0.7, 0.5), "funken": (0.95, 0.95, 0.95), "licht": (1.0, 0.5, 0.2)},
}
NETHER_NAMEN = {"nether_wastes": "oede", "crimson_forest": "karmesin", "crimson": "karmesin", "warped_forest": "wirr",
                "warped": "wirr", "soul_sand_valley": "seelensand", "basalt_deltas": "basalt"}


def nether_biom(name):
    name = NETHER_NAMEN.get(name or "oede", name or "oede")
    return name if name in NETHER_BIOME else "oede"


def nether(biom="oede", seed=7, breite=(-46, 70), laenge=(-18, 96)):
    """Der Nether als riesige offene Höhle: Boden um die Figur, dahinter Hügel und ein Lavameer, weit hinten Klippen,
    hoch oben die Decke mit Glowstone-Trauben, Lavafälle von den Wänden. Dazu die Merkmale des Bioms."""
    b = NETHER_BIOME[nether_biom(biom)]
    rnd = random.Random(seed)
    hoehe_r = _rauschen(seed, 9.0)
    see_r = _rauschen(seed + 3, 14.0)
    decke_r = _rauschen(seed + 5, 7.0)
    welt = {}

    def boden_block():
        for name, p in b["flecken"]:
            if rnd.random() < p:
                return name
        return b["boden"]

    decken = {}
    for x in range(breite[0], breite[1]):
        for y in range(laenge[0], laenge[1]):
            nah = abs(x) < 7 and -14 < y < 7  # Standfläche der Figur und Platz für die Kamera
            rand = min(x - breite[0], breite[1] - x, laenge[1] - y)
            if rand < 6 or y < -12:
                # Klippen am Rand: steigen bis unter die Decke (unregelmäßig, mit Überhängen im Nebel)
                oben = 26 + int(decke_r(x, y) * 14)
                for z in range(-4, oben):
                    welt[(x, y, z)] = b["unter"] if rnd.random() > 0.04 else boden_block()
                continue
            if nah:
                h = 0
            else:
                # Hügel, zum Lavameer hin abfallend; das Meer liegt vor allem hinten und auf der Themenseite
                abstand = math.hypot(x * 0.8, max(0, y) * 1.0)
                see = see_r(x, y) + min(0.45, abstand / 70)
                h = int(round((hoehe_r(x, y) - 0.5) * 6))
                if see > 0.80:
                    h = -3
                elif see > 0.72:
                    h = min(h, -1)
            for z in range(h - 2, h):
                welt[(x, y, z)] = b["unter"]
            welt[(x, y, h)] = boden_block() if h > -3 else b["unter"]
            if h <= -2:
                for z in range(h + 1, 0):
                    welt[(x, y, z)] = "lava"
            elif not nah and b["pflanzen"] and (x, y, h + 1) not in welt:
                for name, p in b["pflanzen"]:
                    if rnd.random() < p:
                        welt[(x, y, h + 1)] = name
                        break
            # Decke hoch oben (auf Bildern meist nur als Dunkel mit Glowstone im Nebel sichtbar)
            d = 30 + int(decke_r(x, y) * 10)
            decken[(x, y)] = d
            for z in range(d, d + 3):
                welt[(x, y, z)] = "netherrack"

    # Glowstone-Trauben und Netherrack-Zapfen unter der Decke (glowstone / glowstone_extra)
    for _ in range(46):
        x, y = rnd.randint(breite[0] + 8, breite[1] - 8), rnd.randint(4, laenge[1] - 8)
        d = decken.get((x, y))
        if d is None:
            continue
        glow = rnd.random() < 0.75
        for _ in range(rnd.randint(6, 18)):
            dx, dy, dz = rnd.randint(-2, 2), rnd.randint(-2, 2), rnd.randint(1, 5)
            welt[(x + dx, y + dy, d - dz)] = "glowstone" if glow else "netherrack"

    # Lavafälle (spring_open): von der Decke bzw. Wand bis ins Meer
    for _ in range(rnd.randint(3, 5)):
        x, y = rnd.choice((rnd.randint(breite[0] + 6, -10), rnd.randint(12, breite[1] - 8))), rnd.randint(28, laenge[1] - 10)
        d = decken.get((x, y), 30)
        for z in range(-2, d):
            if (x, y, z) not in welt or welt[(x, y, z)] in ("lava",) or z > 0:
                welt[(x, y, z)] = "lava"
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):  # kleiner Lavasee unten
            welt[(x + dx, y + dy, -1)] = "lava"

    # Riesenpilze (Karmesin- und Wirrwald): Stamm, breiter Hut, Pilzlicht darunter
    if b.get("baum"):
        stamm, hut = b["baum"]
        for _ in range(b.get("baeume", 12)):
            x, y = rnd.randint(breite[0] + 8, breite[1] - 8), rnd.randint(6, laenge[1] - 12)
            if abs(x) < 9 and y < 10:
                continue
            boden = max((z for z in range(-3, 4) if welt.get((x, y, z)) not in (None, "lava")), default=None)
            if boden is None or welt.get((x, y, boden)) == "lava":
                continue
            h = rnd.randint(6, 13)
            for z in range(boden + 1, boden + 1 + h):
                welt[(x, y, z)] = stamm
            r = rnd.randint(2, 4)
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if abs(dx) + abs(dy) > r + 1:
                        continue
                    welt[(x + dx, y + dy, boden + h)] = hut
                    if abs(dx) == r or abs(dy) == r:  # herabhängender Rand
                        for dz in range(1, rnd.randint(2, 4)):
                            welt[(x + dx, y + dy, boden + h - dz)] = hut if rnd.random() > 0.15 else "shroomlight"
                    elif rnd.random() < 0.12:
                        welt[(x + dx, y + dy, boden + h - 1)] = "shroomlight"
            welt[(x, y, boden + h + 1)] = hut

    # Basaltsäulen (Seelensandtal, Basaltdeltas)
    if b.get("saeulen"):
        for _ in range(28 if b.get("saeulen_viele") else 10):
            x, y = rnd.randint(breite[0] + 8, breite[1] - 8), rnd.randint(8, laenge[1] - 10)
            if abs(x) < 9 and y < 12:
                continue
            bis = decken.get((x, y), 30) if rnd.random() < 0.35 else rnd.randint(2, 12)
            r = rnd.choice((0, 0, 1))
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    for z in range(-3, bis):
                        welt[(x + dx, y + dy, z)] = b["saeulen"]

    # Knochen-Fossilien im Seelensandtal: Rippenbögen aus bone_block
    if b.get("fossilien"):
        for _ in range(3):
            x, y = rnd.randint(-30, 40), rnd.randint(18, 60)
            if abs(x) < 10:
                continue
            for i in range(0, 9, 2):
                for z in range(0, 6):
                    welt[(x - 3, y + i, z)] = "bone_block"
                    welt[(x + 3, y + i, z)] = "bone_block"
                for dx in range(-3, 4):
                    welt[(x + dx, y + i, 6)] = "bone_block"
    return welt


def funken(farbe, seed=7, anzahl=220, collection=None):
    """Glut- und Aschepartikel in der Luft (Stilbuch: Castcrafter 22, GommeHD 21 „Funken“): kleine leuchtende Würfel
    zwischen Kamera und Hintergrund."""
    import bmesh
    col = collection or bpy.context.scene.collection
    rnd = random.Random(seed + 11)
    bm = bmesh.new()
    for _ in range(anzahl):
        s = rnd.uniform(0.04, 0.12) * BLOCK
        m = bmesh.ops.create_cube(bm, size=s)
        x, y, z = rnd.uniform(-14, 26), rnd.uniform(-2, 45), rnd.uniform(0.3, 14)
        bmesh.ops.translate(bm, verts=m["verts"], vec=(x * BLOCK, y * BLOCK, z * BLOCK))
    me = bpy.data.meshes.new("funken")
    bm.to_mesh(me)
    bm.free()
    mat = bpy.data.materials.new("funken")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*farbe, 1)
    em.inputs["Strength"].default_value = 6.0
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    me.materials.append(mat)
    ob = bpy.data.objects.new("funken", me)
    col.objects.link(ob)
    return ob


def netherlicht(biom, collection=None):
    """Licht im Nether: Glühen vom Lavameer und den Lavafällen weit hinten, nicht auf der Figur (die bekommt neutrales
    Gesichtslicht und eine Randkante in Biomfarbe, sonst wird der Skin rot)."""
    b = NETHER_BIOME[nether_biom(biom)]
    col = collection or bpy.context.scene.collection
    for i, (x, y, z, e) in enumerate(((16, 30, 3, 9000), (-18, 44, 4, 7000), (6, 64, 6, 12000), (30, 70, 10, 9000))):
        l = bpy.data.lights.new(f"nether{i}", "POINT")
        l.energy = e
        l.color = b["licht"]
        l.shadow_soft_size = 6.0
        ob = bpy.data.objects.new(l.name, l)
        ob.location = (x * BLOCK, y * BLOCK, z * BLOCK)
        col.objects.link(ob)


def baue_nether(texturen_ordner, aenderungen=None, biom="oede", seed=7, **_):
    tex = bloecke.Texturen(texturen_ordner)
    raster = aendern(nether(biom, seed), aenderungen)
    pflanzen = [(x, y, z, a) for (x, y, z), a in raster.items() if bloecke.art_info(a, tex).get("kreuz")]
    for x, y, z, _a in pflanzen:
        del raster[(x, y, z)]
    ob = bloecke.baue(raster, tex, "nether")
    if pflanzen:
        bloecke.baue_pflanzen(pflanzen, tex)
    netherlicht(biom)
    funken(NETHER_BIOME[nether_biom(biom)]["funken"], seed)
    return ob


def baue_raum(texturen_ordner, art="hoehle", aenderungen=None, **kw):
    tex = bloecke.Texturen(texturen_ordner)
    raster = aendern(raum(art, **kw), aenderungen)
    ob = bloecke.baue(raster, tex, art)
    raumlicht(art, kw.get("becken_ab", 4))
    return ob


def baue_klippe(texturen_ordner, aenderungen=None, **kw):
    tex = bloecke.Texturen(texturen_ordner)
    raster = aendern(klippe(**kw), aenderungen)
    ob = bloecke.baue(raster, tex, "klippe")
    bloecke.baue_pflanzen(bepflanzen(raster), tex)
    kante, tiefe = kw.get("kante", 2), kw.get("tiefe", 20)
    if not kw.get("gegenseite", True):
        meer(tex, tiefe, von_x=kante + 1)
    return ob
