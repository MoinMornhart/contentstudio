"""Text auf dem Thumbnail (ROADMAP 5.2) mit der echten Minecraft-Schrift aus der Spieldatei.

Stilbuch 10: 1–3 Wörter, Minecraft-Pixelschrift mit hartem Schatten nach unten rechts, lebendig platziert (zufällig an
einer freien Stelle, leicht schräg, Farbe passend zum Bild – die Hauptfigur, 29.09.) – nie über Gesicht, Figur, gehaltenem Item oder Mob. Die Lage wird automatisch
aus dem Szenenbericht gewählt; passt nichts, wird der Text kleiner. Reine Pixel-Arbeit mit numpy (kein Rendern).
"""
import json
import os
import random
import zlib

try:  # Blender; außerhalb (Text-Bilder für den Schnitt, ROADMAP E.2) reicht Pillow
    import bpy
except ImportError:
    bpy = None
import numpy as np

FARBEN = {
    "weiss": (1.0, 1.0, 1.0),
    "gelb": (1.0, 0.87, 0.2),
    "gold": (1.0, 0.67, 0.0),
    "gruen": (0.33, 1.0, 0.33),
    "tuerkis": (0.33, 1.0, 1.0),
    "rot": (1.0, 0.33, 0.33),
}

# Reihenfolge der Plätze (Stilbuch: oben mittig, sonst freie Ecke oben rechts/links, dann unten)
PLAETZE = ["oben_mitte", "oben_rechts", "oben_links", "unten_rechts", "unten_links", "unten_mitte"]


def _bild_array(pfad):
    if bpy is None:
        from PIL import Image

        return np.asarray(Image.open(pfad).convert("RGBA"), dtype=np.float32) / 255.0, None
    img = bpy.data.images.load(pfad, check_existing=True)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    return np.flipud(a), img  # Zeile 0 = oben


class Schrift:
    """Bitmap-Schrift nach assets/minecraft/font/include/default.json (Provider „bitmap“)."""

    def __init__(self, assets):
        self.glyphen = {}
        self.hoehe = 8
        for datei in ("include/default.json", "default.json"):
            pfad = os.path.join(assets, "font", datei)
            if not os.path.exists(pfad):
                continue
            with open(pfad, encoding="utf-8") as fh:
                for p in json.load(fh).get("providers", []):
                    if p.get("type") == "bitmap":
                        self._lade(assets, p)

    def _lade(self, assets, p):
        ns, name = p["file"].split(":") if ":" in p["file"] else ("minecraft", p["file"])
        pfad = os.path.join(assets, "textures", name)
        if not os.path.exists(pfad):
            return
        a, _ = _bild_array(pfad)
        zeilen = p["chars"]
        zh = a.shape[0] // len(zeilen)
        zb = a.shape[1] // max(len(z) for z in zeilen)
        for r, zeile in enumerate(zeilen):
            for c, ch in enumerate(zeile):
                if ch in self.glyphen or ch == "\u0000":
                    continue
                zelle = a[r * zh:(r + 1) * zh, c * zb:(c + 1) * zb, 3] > 0.5
                spalten = np.where(zelle.any(axis=0))[0]
                breite = int(spalten.max()) + 1 if len(spalten) else 4
                # auf 8 px Höhe normieren (ascent 7), Glyphen größerer Seiten runterrechnen
                self.glyphen[ch] = (zelle[:, :breite], zh, p.get("ascent", 7), p.get("height", 8))

    def satz(self, text):
        """Maske (bool, Höhe 8·k) für eine Zeile; 1 px Abstand zwischen Zeichen wie im Spiel."""
        teile = []  # (Maske, Oberlänge)
        for ch in text:
            g = self.glyphen.get(ch) or self.glyphen.get(ch.upper()) or self.glyphen.get("?")
            if ch == " " or g is None:
                teile.append((np.zeros((8, 4), dtype=bool), 7))
                continue
            maske, zh, ascent, hoehe = g
            if zh > hoehe and zh % hoehe == 0:  # hochaufgelöste Seiten auf die Nennhöhe herunterrechnen
                f = zh // hoehe
                maske = maske[::f, ::f]
            teile.append((maske, ascent))
            teile.append((np.zeros((maske.shape[0], 1), dtype=bool), ascent))
        # an der Grundlinie ausrichten (wie im Spiel über „ascent“)
        oben = max(a for _, a in teile)
        unten = max(m.shape[0] - a for m, a in teile)
        zeile = [np.pad(m, ((oben - a, unten - (m.shape[0] - a)), (0, 0))) for m, a in teile]
        return np.concatenate(zeile, axis=1)


def _ueberlappung(a, b):
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return w * h


def _box_fuer(platz, bw, bh, rand=0.035):
    x = {"links": rand, "mitte": 0.5 - bw / 2, "rechts": 1 - rand - bw}[platz.split("_")[1]]
    y = rand if platz.startswith("oben") else 1 - rand - bh
    return [x, y, x + bw, y + bh]


def _drehe(schicht, grad):
    """Dreht eine RGBA-Schicht (H×W×4) um ihre Mitte – nächster Nachbar, damit die Pixelschrift scharf bleibt."""
    if abs(grad) < 0.1:
        return schicht
    h, w = schicht.shape[:2]
    r = np.radians(grad)
    c, s = np.cos(r), np.sin(r)
    nh, nw = int(abs(h * c) + abs(w * s)) + 2, int(abs(w * c) + abs(h * s)) + 2
    ys, xs = np.mgrid[0:nh, 0:nw].astype(np.float32)
    ys -= nh / 2
    xs -= nw / 2
    # Rückwärts abbilden: Zielpunkt → Quellpunkt
    qx = c * xs + s * ys + w / 2
    qy = -s * xs + c * ys + h / 2
    ok = (qx >= 0) & (qx < w) & (qy >= 0) & (qy < h)
    aus = np.zeros((nh, nw, 4), dtype=np.float32)
    aus[ok] = schicht[qy[ok].astype(int), qx[ok].astype(int)]
    return aus


def _farbe_fuer(a, box, rng):
    """Kräftige Minecraft-Textfarbe, die sich vom Bild unter dem Text am besten abhebt (unter den besten zwei zufällig)."""
    H, W = a.shape[:2]
    teil = a[int(box[1] * H):max(int(box[1] * H) + 1, int(box[3] * H)), int(box[0] * W):max(int(box[0] * W) + 1, int(box[2] * W)), :3]
    grund = np.clip(teil.reshape(-1, 3).mean(axis=0), 0, 1)  # Bildpixel eines PNG liegen in sRGB vor
    hell = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    # kräftige Farben bekommen einen Vorzug vor Weiß (Wunsch: „farblich bisschen anpassen“), solange sie sich abheben
    wertung = sorted(((float(np.linalg.norm(np.array(c) - grund)) + 0.6 * abs(hell(c) - hell(grund)) + (0.35 if n != "weiss" else 0), n) for n, c in FARBEN.items()), reverse=True)
    return rng.choice(wertung[:2])[1]


def _weich(m, r):
    """Kastenunschärfe (zweimal, Ränder fortgesetzt) – reicht für einen weichen Schein."""
    for _ in range(2):
        for achse in (0, 1):
            pad = [(0, 0), (0, 0)]
            pad[achse] = (r + 1, r)
            c = np.cumsum(np.pad(m, pad, mode="edge"), axis=achse)
            n = m.shape[achse]
            m = (np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=achse) - np.take(c, np.arange(0, n), axis=achse)) / (2 * r + 1)
    return m


def _schein(a, alpha, farbe, x0, y0, radius, staerke=0.55):
    """Farbiger Schein hinter dem Text wie bei großen Kanälen („50.000.000“ grün leuchtend, Vergleich 8.2): die Textform
    weichgezeichnet in der Textfarbe, nur aufhellend über das Bild gelegt."""
    H, W = a.shape[:2]
    rand = radius * 2
    m = np.pad(alpha.astype(np.float32), rand)
    m = np.clip(_weich(m, radius) * 1.6, 0, 1) * staerke
    ox, oy = x0 - rand, y0 - rand
    sx0, sy0 = max(0, -ox), max(0, -oy)
    dx0, dy0 = max(0, ox), max(0, oy)
    w = min(m.shape[1] - sx0, W - dx0)
    h = min(m.shape[0] - sy0, H - dy0)
    if w <= 0 or h <= 0:
        return
    teil = m[sy0:sy0 + h, sx0:sx0 + w, None]
    ziel = a[dy0:dy0 + h, dx0:dx0 + w, :3]
    a[dy0:dy0 + h, dx0:dx0 + w, :3] = 1 - (1 - ziel) * (1 - np.asarray(farbe)[None, None, :] * teil)


def setze_text(bild_pfad, bericht, texte, assets, ausgabe):
    """`texte`: Liste von {"text": "ICH GEGEN MEINEN FREUND", "farbe": "auto"|"weiss"|…, "platz": "auto"}. Schreibt das Bild
    mit Text und gibt die gewählten Boxen und Warnungen zurück.

    Lebendig statt steif: Der Platz wird zufällig unter den freien Stellen gewählt (oben bevorzugt),
    der Text steht leicht schräg (3–7°), und ohne feste Farbe passt sie sich dem Bild an. Der Zufall hängt am Bild,
    ein Bild bleibt also reproduzierbar."""
    a, img = _bild_array(bild_pfad)
    H, W = a.shape[:2]
    rng = random.Random(zlib.crc32(os.path.basename(bild_pfad).encode()) + sum(len(t.get("text", "")) for t in texte))
    schrift = Schrift(assets)
    # Wichtiges: ganze Figuren, Items, Mobs (plus etwas Luft)
    wichtig = []
    for f in bericht.get("figuren", {}).values():
        wichtig.append(f.get("box", f.get("kopf_box")))
    wichtig += [i["box"] for i in bericht.get("items", {}).values()]
    wichtig += [m["box"] for m in bericht.get("mobs", [])]
    wichtig += bericht.get("grafik_boxen", [])  # Hotbar, Lupe, Etiketten … (Grafik wird vorher gesetzt)
    wichtig.append([0.8, 0.82, 1.0, 1.0])  # unten rechts blendet YouTube die Videolänge ein
    wichtig = [[b[0] - 0.01, b[1] - 0.01, b[2] + 0.01, b[3] + 0.01] for b in wichtig if b]
    ergebnis, warnungen, belegt = [], [], []
    for t in texte:
        zeilen = [z for z in t["text"].upper().split("\n") if z]
        masken = [schrift.satz(z) for z in zeilen]
        glyph_h = max(m.shape[0] for m in masken)
        breite_px = max(m.shape[1] for m in masken)
        grad = rng.uniform(3.0, 7.0) * rng.choice((-1, 1)) if t.get("neigung", "auto") == "auto" else float(t["neigung"])
        wahl = None
        # Größe: Zeilenhöhe 16 % der Bildhöhe, bei Platzmangel schrittweise bis 8,5 % – kleiner ist in der
        # Handy-Ansicht (Thumbnail 168×94) unter 8 Pixel hoch und nicht mehr lesbar
        for anteil in (0.16, 0.14, 0.12, 0.10, 0.085):
            k = max(1, int(round(anteil * H / glyph_h)))
            bw = (breite_px + 1) * k / W
            bh = (glyph_h * len(zeilen) + 1) * k * 1.15 / H
            # Schräglage braucht etwas mehr Höhe
            bh_schraeg = bh + bw * W / H * abs(np.sin(np.radians(grad)))
            if bw > 0.92:
                continue
            if t.get("platz", "auto") != "auto":
                plaetze = [_box_fuer(t["platz"], bw, bh_schraeg)] + [_box_fuer(p, bw, bh_schraeg) for p in PLAETZE if p != t["platz"]]
                frei = [b for b in plaetze if sum(_ueberlappung(b, w) for w in wichtig + belegt) == 0][:1]
            else:
                # viele Kandidaten, oben bevorzugt; unter den freien einer zufällig
                xs = np.linspace(0.03, 0.97 - bw, 9) if bw < 0.94 else [0.03]
                oben = [[x, y, x + bw, y + bh_schraeg] for y in (0.03, 0.07, 0.11) for x in xs]
                unten = [[x, 0.97 - bh_schraeg - dy, x + bw, 0.97 - dy] for dy in (0.0, 0.04) for x in xs]
                frei = [b for b in oben if sum(_ueberlappung(b, w) for w in wichtig + belegt) == 0]
                if not frei:
                    frei = [b for b in unten if sum(_ueberlappung(b, w) for w in wichtig + belegt) == 0]
            if frei:
                wahl = (k, rng.choice(frei), "frei")
                if anteil < 0.1:
                    warnungen.append(f"Text „{t['text']}“ ist auf dem Handy klein – kürzer fassen oder mehr Platz lassen")
                break
        if not wahl:  # kein freier Platz: kleinste Größe, geringste Überdeckung, Warnung
            k = max(1, int(round(0.085 * H / glyph_h)))
            bw, bh = (breite_px + 1) * k / W, (glyph_h * len(zeilen) + 1) * k * 1.15 / H
            box, p = min(((_box_fuer(p, bw, bh), p) for p in PLAETZE), key=lambda bp: sum(_ueberlappung(bp[0], w) for w in wichtig))
            wahl = (k, box, p)
            grad = 0.0
            warnungen.append(f"Text „{t['text']}“ findet keinen freien Platz und überdeckt Wichtiges")
        k, box, p = wahl
        belegt.append(box)
        farbname = t.get("farbe") if t.get("farbe") in FARBEN else _farbe_fuer(a, box, rng)
        farbe = np.array(FARBEN[farbname], dtype=np.float32)
        schatten = farbe * 0.25  # wie im Spiel: Schatten = Textfarbe auf ein Viertel
        # Text als eigene Schicht setzen, drehen und dann mittig in die Box legen
        zeilen_px = [np.kron(m, np.ones((k, k), dtype=bool)) for m in masken]
        sw = max(z.shape[1] for z in zeilen_px) + k + 2
        sh = int(glyph_h * k * 1.15 * len(zeilen_px)) + k + 2
        schicht = np.zeros((sh, sw, 4), dtype=np.float32)
        for zi, gross in enumerate(zeilen_px):
            zx = (sw - k - gross.shape[1]) // 2
            zy = int(zi * glyph_h * k * 1.15)
            for dx, dy, col in ((k, k, schatten), (0, 0, farbe)):
                ys, xs = np.nonzero(gross)
                schicht[ys + zy + dy, xs + zx + dx, :3] = col
                schicht[ys + zy + dy, xs + zx + dx, 3] = 1.0
        schicht = _drehe(schicht, grad)
        mx, my = (box[0] + box[2]) / 2 * W, (box[1] + box[3]) / 2 * H
        x0, y0 = int(mx - schicht.shape[1] / 2), int(my - schicht.shape[0] / 2)
        if t.get("leuchten", True):
            _schein(a, schicht[..., 3], farbe, x0, y0, radius=max(2, int(k * 2.5)))
        ys, xs = np.nonzero(schicht[..., 3] > 0.5)
        zy, zx = ys + y0, xs + x0
        ok = (zy >= 0) & (zy < H) & (zx >= 0) & (zx < W)
        a[zy[ok], zx[ok], :3] = schicht[ys[ok], xs[ok], :3]
        a[zy[ok], zx[ok], 3] = 1.0
        ergebnis.append({"text": t["text"], "platz": p, "box": [round(v, 3) for v in box], "pixel": k, "neigung": round(grad, 1), "farbe": farbname})
    aus = bpy.data.images.new("mit_text", W, H, alpha=True)
    aus.pixels[:] = np.flipud(a).ravel()
    aus.filepath_raw = ausgabe
    aus.file_format = "PNG"
    aus.save()
    return {"texte": ergebnis, "warnungen": warnungen}
