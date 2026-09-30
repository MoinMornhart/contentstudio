"""Mimik: Ausdrücke wie wütend, traurig, müde, erschrocken – im Minecraft-Look wie bei BastiGHG.

Die Augen des Skins bleiben unverändert. Über die Gesichtsfläche kommt eine hauchdünne Ebene in feiner Auflösung
(8×8 Unterpixel je Skin-Pixel) mit:
- Oberlid in Hautfarbe mit gerader, schräger Kante (wütend: innen tiefer, traurig: außen tiefer, müde/skeptisch: halb zu)
- weichen Augenringen (etwas dunklerer Hautton unter den Augen)
- keinem gezeichneten Mund: der Mund aus dem Skin bleibt (Wunsch: „der sah echt gut aus“)
Augenzeile, Augenspalten und Hautfarbe werden aus dem Skin selbst gelesen, damit es bei jedem Skin passt.
"""
import bpy
from mathutils import Vector

from .figur import PX

UNTER = 8  # Unterpixel je Skin-Pixel
AUSDRUECKE = ("neutral", "wuetend", "traurig", "erschrocken", "muede", "skeptisch", "froh", "schreiend")


def _gesicht(img):
    """8×8 Gesichtspixel (Zeile 0 = oben) als RGBA-Tupel; HD-Skins werden abgetastet."""
    w, h = img.size
    s = w // 64
    px = img.pixels[:]
    g = []
    for r in range(8):
        zeile = []
        for c in range(8):
            x, y = (8 + c) * s, h - 1 - (8 + r) * s
            i = (y * w + x) * 4
            zeile.append(tuple(px[i:i + 4]))
        g.append(zeile)
    return g


def _hell(p):
    return 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]


def analysiere(img):
    """Augenzeile, zwei Augen-Spaltenbereiche und Hautfarbe aus dem Gesicht."""
    g = _gesicht(img)
    haut = g[7][0] if g[7][0][3] > 0.5 else g[5][0]
    # häufigste Farbe der unteren Gesichtshälfte = Haut
    zaehl = {}
    for r in range(4, 8):
        for c in range(8):
            k = tuple(round(v, 2) for v in g[r][c][:3])
            zaehl[k] = zaehl.get(k, 0) + 1
    haut = max(zaehl, key=zaehl.get)
    haut_hell = _hell(haut)

    def auge(p):
        """Augenpixel: Augenweiß (heller als die Haut, kaum Farbe) oder Iris (deutlich bunt, z. B. blau/grün)."""
        weiss = _hell(p) > max(0.7, haut_hell + 0.08) and max(p[:3]) - min(p[:3]) < 0.25
        iris = (p[2] > p[0] + 0.12) or (p[1] > p[0] + 0.12 and p[1] > p[2])
        return weiss or iris

    beste, zeile = 0, 4
    for r in range(2, 7):
        wert = sum(1 for c in range(8) if auge(g[r][c]))
        if wert > beste:
            beste, zeile = wert, r
    anders = [c for c in range(8) if auge(g[zeile][c])]
    links = [c for c in anders if c < 4] or [1, 2]
    rechts = [c for c in anders if c >= 4] or [5, 6]
    return {"zeile": zeile, "augen": [(min(links), max(links)), (min(rechts), max(rechts))], "haut": haut}


def _textur(info, ausdruck, name):
    n = 8 * UNTER
    bild = [[(0, 0, 0, 0) for _ in range(n)] for _ in range(n)]  # [zeile von oben][spalte]
    haut = (*info["haut"], 1.0)
    schatten = tuple(v * 0.72 for v in info["haut"]) + (0.85,)
    z = info["zeile"]

    def setze(x, y, farbe):
        if 0 <= x < n and 0 <= y < n and (farbe[3] >= bild[y][x][3]):
            bild[y][x] = farbe

    for seite, (a, b) in enumerate(info["augen"]):
        x0, x1 = a * UNTER, (b + 1) * UNTER
        innen_links = seite == 1  # rechtes Auge im Bild: Innenseite (zur Nase) ist links
        for x in range(x0, x1):
            t = (x - x0) / max(1, x1 - x0 - 1)  # 0 links … 1 rechts
            innen = (1 - t) if innen_links else t  # 1 = zur Nase
            if ausdruck in ("wuetend", "schreiend"):
                tiefe = 0.15 + 0.55 * innen
            elif ausdruck == "traurig":
                tiefe = 0.15 + 0.5 * (1 - innen)
            elif ausdruck in ("muede", "skeptisch"):
                tiefe = 0.5 if ausdruck == "muede" or seite == 0 else 0.25
            elif ausdruck == "erschrocken":
                tiefe = 0.0
            else:
                tiefe = 0.0
            for y in range(z * UNTER, z * UNTER + int(round(tiefe * UNTER))):
                setze(x, y, haut)
            # Lidkante als feine dunklere Linie (wirkt wie die Schattenkante bei BastiGHG)
            if tiefe > 0:
                setze(x, z * UNTER + int(round(tiefe * UNTER)), schatten)
            # Augenringe: weich, eine halbe Skin-Zeile unter dem Auge
            if ausdruck in ("muede", "traurig", "wuetend"):
                for y in range((z + 1) * UNTER, (z + 1) * UNTER + UNTER // 2):
                    staerke = 0.55 * (1 - (y - (z + 1) * UNTER) / (UNTER / 2))
                    setze(x, y, (*schatten[:3], staerke))

    # Kein gezeichneter Mund: der Mund aus dem Skin bleibt, wie er ist.

    img = bpy.data.images.new(name, n, n, alpha=True)
    flach = []
    for y in range(n - 1, -1, -1):  # Blender: Zeile 0 = unten
        for x in range(n):
            flach.extend(bild[y][x])
    img.pixels[:] = flach
    img.pack()
    return img


def setze_mimik(figur, ausdruck, skin_img=None):
    """Legt die Mimik-Ebene vor das Gesicht der Figur (Kind des Kopfes, wandert mit jeder Kopfdrehung)."""
    if not ausdruck or ausdruck == "neutral":
        return None
    if ausdruck not in AUSDRUECKE:
        raise ValueError(f"Unbekannte Mimik „{ausdruck}“ (bekannt: {', '.join(AUSDRUECKE)})")
    kopf = figur.teile["kopf"]
    img = skin_img or kopf.data.materials[0].node_tree.nodes["Image Texture"].image
    info = analysiere(img)
    tex = _textur(info, ausdruck, f"{figur.name}.mimik")
    mat = bpy.data.materials.new(f"{figur.name}.mimik")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = tex
    t.interpolation = "Closest"
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.62
    if hasattr(mat, "blend_method"):
        mat.blend_method = "CLIP"
    h = 4 * PX
    y = -4.0 * PX - 0.002  # knapp vor der Gesichtsfläche, hinter der Hut-Ebene
    # Name beginnt mit „<figur>.kopf“: die Sichtprüfung zählt die Mimik als Teil des Gesichts
    me = bpy.data.meshes.new(f"{figur.name}.kopf.mimik")
    me.from_pydata([(-h, y, -h), (h, y, -h), (h, y, h), (-h, y, h)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="uv")
    for li, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    me.materials.append(mat)
    ob = bpy.data.objects.new(me.name, me)
    kopf.users_collection[0].objects.link(ob)
    ob.parent = kopf
    ob.location = Vector((0, 0, 0))
    figur.teile["mimik"] = ob
    return ob
