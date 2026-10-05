"""Mimik: Ausdrücke wie wütend, traurig, müde, erschrocken – im Minecraft-Look wie bei BastiGHG.

Die Augen des Skins bleiben unverändert. Über die Gesichtsfläche kommt eine hauchdünne Ebene in feiner Auflösung
(8×8 Unterpixel je Skin-Pixel) mit:
- Oberlid in Hautfarbe mit gerader, schräger Kante (wütend: innen tiefer, traurig: außen tiefer, müde/skeptisch: halb zu)
- weichen Augenringen (etwas dunklerer Hautton unter den Augen)
- Brauen, Glanzpunkten, Lachaugen, Mundform und Wangen wie bei den Gesichts-Rigs großer Thumbnail-Künstler
  (MoinStudio, 01.10.: „schöne Emotionen, nicht so wie gerade“) – in Pixeln und in den Farben des Skins
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
    """Augenzeile, zwei Augen-Spaltenbereiche, Hautfarbe, Brauenfarbe und Mund aus dem Gesicht."""
    g = _gesicht(img)
    # häufigste Farbe der unteren Gesichtshälfte = Haut
    zaehl = {}
    for r in range(4, 8):
        for c in range(8):
            k = tuple(round(v, 2) for v in g[r][c][:3])
            zaehl[k] = zaehl.get(k, 0) + 1
    haut = max(zaehl, key=zaehl.get)
    haut_hell = _hell(haut)

    def ist_weiss(p):
        return _hell(p) > max(0.7, haut_hell + 0.08) and max(p[:3]) - min(p[:3]) < 0.25

    def auge(p):
        """Augenpixel: Augenweiß (heller als die Haut, kaum Farbe) oder Iris (deutlich bunt, z. B. blau/grün)."""
        iris = (p[2] > p[0] + 0.12) or (p[1] > p[0] + 0.12 and p[1] > p[2])
        return ist_weiss(p) or iris

    beste, zeile = 0, 4
    for r in range(2, 7):
        wert = sum(1 for c in range(8) if auge(g[r][c]))
        if wert > beste:
            beste, zeile = wert, r
    anders = [c for c in range(8) if auge(g[zeile][c])]
    links = [c for c in anders if c < 4] or [1, 2]
    rechts = [c for c in anders if c >= 4] or [5, 6]
    iris = [c for c in anders if not ist_weiss(g[zeile][c])]

    def abstand(p, q):
        return sum(abs(a - b) for a, b in zip(p[:3], q[:3]))

    # Brauen: dunkle Pixel direkt über den Augen, sonst die Haarfarbe abgedunkelt
    ueber = [g[zeile - 1][c] for c in range(8) if zeile > 0 and abstand(g[zeile - 1][c], haut) > 0.35 and _hell(g[zeile - 1][c]) < haut_hell]
    if ueber:
        braue = tuple(sum(p[i] for p in ueber) / len(ueber) for i in range(3))
    else:
        haar = [g[0][c] for c in range(8)]
        braue = tuple(sum(p[i] for p in haar) / len(haar) * 0.6 for i in range(3))
    # Mund: abweichende Pixel in den Zeilen unter den Augen
    mund = None
    for r in range(min(7, zeile + 1), 8):
        spalten = [c for c in range(1, 7) if abstand(g[r][c], haut) > 0.3]
        if 1 <= len(spalten) <= 6:
            mund = {"zeile": r, "von": min(spalten), "bis": max(spalten), "echt": True,
                    "farbe": tuple(sum(g[r][c][i] for c in spalten) / len(spalten) for i in range(3))}
            break
    if not mund:
        mund = {"zeile": min(7, zeile + 2), "von": 3, "bis": 4, "echt": False, "farbe": tuple(v * 0.45 for v in haut)}
    return {"zeile": zeile, "augen": [(min(links), max(links)), (min(rechts), max(rechts))], "iris": iris, "haut": haut,
            "braue": braue, "hat_brauen": len(ueber) >= 2, "mund": mund}


# Ausdrücke wie bei den Gesichts-Rigs der großen Thumbnail-Künstler (Mine-imator Face Rig, Boxscape): Brauen,
# Glanzpunkte, Lachaugen, offener Mund mit Zähnen, rote Wangen – alles im Pixelraster des Skins, in seinen Farben.
# Brauen: (innen, außen) als Höhe über der Augenzeile in Skin-Pixeln (1 = direkt darüber)
BRAUEN = {
    "wuetend": (0.45, 1.25),
    "traurig": (1.45, 0.75),
    "erschrocken": (1.3, 1.2),  # höher verschwinden sie hinter der Haar-Ebene
    "schreiend": (0.5, 1.3),
    "muede": (0.9, 0.8),
    "skeptisch": "schief",
    "froh": (1.35, 1.2),
}


def _textur(info, ausdruck, name):
    n = 8 * UNTER
    bild = [[(0, 0, 0, 0) for _ in range(n)] for _ in range(n)]  # [zeile von oben][spalte]
    haut = (*info["haut"], 1.0)
    schatten = tuple(v * 0.72 for v in info["haut"]) + (0.85,)
    z = info["zeile"]
    U = UNTER

    def setze(x, y, farbe):
        if 0 <= x < n and 0 <= y < n and (farbe[3] >= bild[y][x][3]):
            bild[y][x] = farbe

    def rechteck(x0, y0, x1, y1, farbe):
        """Rechteck in Skin-Pixeln (Kommazahlen erlaubt, 0,0 = oben links)."""
        for y in range(int(round(y0 * U)), int(round(y1 * U))):
            for x in range(int(round(x0 * U)), int(round(x1 * U))):
                setze(x, y, farbe)

    # --- Brauen: alte Brauen des Skins mit Haut übermalen, neue schräg setzen --------------------------------------
    form = BRAUEN.get(ausdruck)
    braue = (*info["braue"], 1.0)
    if form and info["hat_brauen"]:
        for a, b in info["augen"]:
            rechteck(a, z - 1, b + 1, z, haut)
    if form:
        for seite, (a, b) in enumerate(info["augen"]):
            innen_links = seite == 1
            if form == "schief":
                hi, ha = (1.5, 1.4) if seite == 0 else (0.6, 0.8)
            else:
                hi, ha = form
            x0, x1 = a - 0.25, b + 1.25
            for x in range(int(x0 * U), int(x1 * U)):
                t = (x / U - x0) / (x1 - x0)
                innen = (1 - t) if innen_links else t
                hoehe = ha + (hi - ha) * innen  # über der Augenzeile
                y_unten = (z - hoehe + 1) * U
                for y in range(int(y_unten - 0.85 * U), int(y_unten)):
                    setze(x, y, braue)

    # --- Augen: Lider, Lachaugen, Glanzpunkt -------------------------------------------------------------------------
    for seite, (a, b) in enumerate(info["augen"]):
        x0, x1 = a * U, (b + 1) * U
        innen_links = seite == 1
        for x in range(x0, x1):
            t = (x - x0) / max(1, x1 - x0 - 1)
            innen = (1 - t) if innen_links else t
            tiefe = 0.0
            if ausdruck in ("wuetend", "schreiend"):
                tiefe = 0.1 + 0.4 * innen
            elif ausdruck == "traurig":
                tiefe = 0.1 + 0.4 * (1 - innen)
            elif ausdruck == "muede":
                tiefe = 0.5
            elif ausdruck == "skeptisch":
                tiefe = 0.45 if seite == 1 else 0.1
            for y in range(z * U, z * U + int(round(tiefe * U))):
                setze(x, y, haut)
            if tiefe > 0:
                setze(x, z * U + int(round(tiefe * U)), schatten)
            # Lachaugen: Wangen schieben das Unterlid als flachen Bogen hoch
            if ausdruck == "froh":
                bogen = 0.38 - 0.22 * abs(2 * t - 1)
                for y in range(int((z + 1 - bogen) * U), (z + 1) * U):
                    setze(x, y, haut)
                setze(x, int((z + 1 - bogen) * U) - 1, schatten)
            if ausdruck in ("muede", "traurig"):
                for y in range((z + 1) * U, (z + 1) * U + U // 2):
                    staerke = 0.55 * (1 - (y - (z + 1) * U) / (U / 2))
                    setze(x, y, (*schatten[:3], staerke))
        # Glanzpunkt im Auge (lebendige Augen wie bei den Rigs), nicht bei halb geschlossenen Augen
        if ausdruck not in ("muede", "skeptisch"):
            iris = [c for c in info["iris"] if a <= c <= b] or [b if seite == 0 else a]
            c = iris[0]
            oben = 0.55 if ausdruck in ("wuetend", "schreiend") else 0.12
            rechteck(c + 0.15, z + oben, c + 0.45, z + oben + 0.3, (1, 1, 1, 1))

    # --- Mund in der Mundfarbe des Skins -----------------------------------------------------------------------------
    m = info["mund"]
    mz, mv, mb = m["zeile"], m["von"], m["bis"]
    mf = (*m["farbe"], 1.0)
    dunkel = (*(v * 0.35 for v in m["farbe"]), 1.0)
    zaehne = (0.95, 0.95, 0.93, 1.0)
    if ausdruck in ("erschrocken", "schreiend"):
        breite = 1.0 if ausdruck == "erschrocken" else 1.5
        mitte = (mv + mb + 1) / 2
        x0, x1 = mitte - breite, mitte + breite
        rechteck(x0, mz - 0.1, x1, mz + (1.0 if ausdruck == "erschrocken" else 1.25), dunkel)
        rechteck(x0, mz - 0.1, x1, mz + 0.22, zaehne)  # obere Zahnreihe
        if ausdruck == "schreiend":
            rechteck(mitte - 0.75, mz + 0.85, mitte + 0.75, mz + 1.25, (0.85, 0.36, 0.42, 1.0))  # Zunge
    elif not m.get("echt") and ausdruck in ("froh", "traurig", "wuetend", "skeptisch"):
        # Skin ohne Mund (manche Freundes-Skins): schlichte Mundlinie statt zweier einzelner Winkel-Punkte (01.10.)
        rechteck(mv - 0.5, mz + 0.35, mb + 1.5, mz + 0.75, mf)
        hoch = ausdruck == "froh"
        rechteck(mv - 1.0, mz + (-0.05 if hoch else 0.75), mv - 0.5, mz + (0.35 if hoch else 1.15), mf)
        if ausdruck != "skeptisch":
            rechteck(mb + 1.5, mz + (-0.05 if hoch else 0.75), mb + 2.0, mz + (0.35 if hoch else 1.15), mf)
    elif ausdruck == "froh":
        rechteck(mv - 0.5, mz - 0.5, mv, mz, mf)  # Mundwinkel hoch
        rechteck(mb + 1, mz - 0.5, mb + 1.5, mz, mf)
        rechteck(mv, mz + 0.5, mb + 1, mz + 0.85, zaehne)
    elif ausdruck in ("traurig", "wuetend"):
        rechteck(mv - 0.5, mz + 0.5, mv, mz + 1.0, mf)  # Mundwinkel runter
        rechteck(mb + 1, mz + 0.5, mb + 1.5, mz + 1.0, mf)
    elif ausdruck == "skeptisch":
        rechteck(mb + 1, mz - 0.4, mb + 1.5, mz + 0.4, mf)  # schiefer Mund

    # --- Wangen ------------------------------------------------------------------------------------------------------
    if ausdruck == "froh":
        for a, b in info["augen"]:
            aussen = a - 0.2 if a < 4 else b + 0.2
            rechteck(aussen, z + 1.15, aussen + 1.0, z + 1.6, (1.0, 0.45, 0.55, 0.55))

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
