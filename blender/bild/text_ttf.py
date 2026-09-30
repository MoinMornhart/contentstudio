"""Text und Logo auf dem Thumbnail (ROADMAP 4.7) mit der Schrift der Marke (TTF/OTF) – für Foto-, Modell- und
Grafik-Thumbnails. Minecraft-Szenen nutzen die Pixelschrift aus der Spieldatei (minecraft/text.py).

Aufruf: python text_ttf.py <bild.png> <auftrag.json> <ausgabe.png>
auftrag:
{
  "texte": [{"text": "TAG 100", "farbe": "auto" | "#ffcc00", "platz": "auto" | "oben_links" | …, "neigung": "auto" | 0}],
  "schrift": "<pfad.ttf>" | null, "farben": ["#ffcc00", …] (Marke, bevorzugt),
  "sperren": [[u0, v0, u1, v1], …] (Gesichter, Figuren, Wichtiges – nie überdecken),
  "logo": {"pfad": "<logo.png>", "breite": 0.16} | null,
  "zufall": 123,
  "ebenen": "<ordner>" | null
}
Ausgabe: Zeile „CS_TEXT {json}“ mit gewählten Boxen und Warnungen.
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

GRUNDFARBEN = ["#ffffff", "#ffd400", "#ff3b30", "#00e5ff", "#7cff4f", "#ff7a00"]
PLAETZE = ["oben_mitte", "oben_rechts", "oben_links", "unten_rechts", "unten_links", "unten_mitte"]
SCHRIFTEN = ["C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/ariblk.ttf", "C:/Windows/Fonts/arialbd.ttf", "/System/Library/Fonts/Supplemental/Impact.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lade_schrift(pfad, groesse):
    for p in [pfad] + SCHRIFTEN:
        if p and os.path.exists(p):
            try:
                return ImageFont.truetype(p, groesse)
            except OSError:
                continue
    return ImageFont.load_default(groesse)


def ueberlappung(a, b):
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return w * h


def box_fuer(platz, bw, bh, rand=0.035):
    x = {"links": rand, "mitte": 0.5 - bw / 2, "rechts": 1 - rand - bw}[platz.split("_")[1]]
    y = rand if platz.startswith("oben") else 1 - rand - bh
    return [x, y, x + bw, y + bh]


def hell(c):
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255


def farbe_fuer(bild, box, kandidaten, rng):
    """Farbe, die sich vom Bild unter dem Text am besten abhebt; Markenfarben leicht bevorzugt."""
    W, H = bild.size
    teil = bild.crop((int(box[0] * W), int(box[1] * H), max(int(box[0] * W) + 1, int(box[2] * W)), max(int(box[1] * H) + 1, int(box[3] * H))))
    grund = np.asarray(teil.convert("RGB")).reshape(-1, 3).mean(axis=0)
    wertung = []
    for i, (f, marke) in enumerate(kandidaten):
        c = np.array(hex_rgb(f), dtype=np.float32)
        wert = float(np.linalg.norm(c - grund)) / 255 + 0.8 * abs(hell(c) - hell(grund)) + (0.25 if marke else 0)
        wertung.append((wert, f))
    wertung.sort(reverse=True)
    return rng.choice(wertung[:2])[1]


def text_schicht(zeilen, schrift, farbe, groesse):
    """Text mit dunkler Kontur und weichem Schatten als RGBA-Schicht."""
    kontur = max(2, groesse // 12)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    boxen = [probe.textbbox((0, 0), z, font=schrift, stroke_width=kontur) for z in zeilen]
    zeilen_h = [b[3] - b[1] for b in boxen]
    breite = max(b[2] - b[0] for b in boxen) + kontur * 4
    hoehe = int(sum(zeilen_h) * 1.05) + kontur * 4
    schicht = Image.new("RGBA", (breite + groesse // 6, hoehe + groesse // 6), (0, 0, 0, 0))
    schatten = Image.new("RGBA", schicht.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(schicht)
    ds = ImageDraw.Draw(schatten)
    y = kontur * 2
    for z, b, zh in zip(zeilen, boxen, zeilen_h):
        x = (breite - (b[2] - b[0])) // 2 - b[0]
        ds.text((x + groesse // 14, y - b[1] + groesse // 14), z, font=schrift, fill=(0, 0, 0, 170), stroke_width=kontur, stroke_fill=(0, 0, 0, 170))
        d.text((x, y - b[1]), z, font=schrift, fill=hex_rgb(farbe) + (255,), stroke_width=kontur, stroke_fill=(20, 20, 20, 255))
        y += int(zh * 1.05)
    schatten = schatten.filter(ImageFilter.GaussianBlur(max(1, groesse // 18)))
    return Image.alpha_composite(schatten, schicht)


def setze(bild_pfad, auftrag, ausgabe):
    bild = Image.open(bild_pfad).convert("RGBA")
    W, H = bild.size
    rng = random.Random(auftrag.get("zufall", 7))
    sperren = [[b[0] - 0.01, b[1] - 0.01, b[2] + 0.01, b[3] + 0.01] for b in auftrag.get("sperren", []) if b and len(b) == 4]
    marke = auftrag.get("farben") or []
    kandidaten = [(f, True) for f in marke] + [(f, False) for f in GRUNDFARBEN if f not in marke]
    ergebnis, warnungen, belegt = [], [], []
    text_ebene = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # Logo zuerst in eine freie Ecke (unten bevorzugt), damit der Text drumherum plant
    logo = auftrag.get("logo")
    logo_box = None
    if logo and logo.get("pfad") and os.path.exists(logo["pfad"]):
        lg = Image.open(logo["pfad"]).convert("RGBA")
        lb = float(logo.get("breite", 0.16))
        lw = int(W * lb)
        lh = int(lg.height * lw / lg.width)
        if lh > H * 0.22:
            lh = int(H * 0.22)
            lw = int(lg.width * lh / lg.height)
        lg = lg.resize((max(1, lw), max(1, lh)), Image.LANCZOS)
        ecken = ["unten_rechts", "unten_links", "oben_rechts", "oben_links"]
        wahl = min(ecken, key=lambda e: sum(ueberlappung(box_fuer(e, lw / W, lh / H, 0.03), s) for s in sperren))
        logo_box = box_fuer(wahl, lw / W, lh / H, 0.03)
        if sum(ueberlappung(logo_box, s) for s in sperren) > 0:
            warnungen.append("Logo überdeckt etwas Wichtiges")
        text_ebene_logo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        text_ebene_logo.paste(lg, (int(logo_box[0] * W), int(logo_box[1] * H)), lg)
        bild = Image.alpha_composite(bild, text_ebene_logo)
        belegt.append(logo_box)
        if auftrag.get("ebenen"):
            text_ebene_logo.save(os.path.join(auftrag["ebenen"], "logo.png"))

    for t in auftrag.get("texte", []):
        zeilen = [z for z in str(t.get("text", "")).upper().split("\n") if z.strip()]
        if not zeilen:
            continue
        grad = rng.uniform(3.0, 7.0) * rng.choice((-1, 1)) if t.get("neigung", "auto") == "auto" else float(t["neigung"])
        wahl = None
        for anteil in (0.2, 0.17, 0.14, 0.12, 0.1, 0.08):
            groesse = max(10, int(H * anteil))
            schrift = lade_schrift(auftrag.get("schrift"), groesse)
            probe = text_schicht(zeilen, schrift, "#ffffff", groesse).rotate(grad, expand=True, resample=Image.BICUBIC)
            bw, bh = probe.width / W, probe.height / H
            if bw > 0.94 or bh > 0.6:
                continue
            if t.get("platz", "auto") != "auto":
                reihen = [box_fuer(t["platz"], bw, bh)] + [box_fuer(p, bw, bh) for p in PLAETZE if p != t["platz"]]
                frei = [b for b in reihen if sum(ueberlappung(b, s) for s in sperren + belegt) == 0][:1]
            else:
                xs = np.linspace(0.03, 0.97 - bw, 9) if bw < 0.94 else [0.03]
                oben = [[x, y, x + bw, y + bh] for y in (0.03, 0.07, 0.11) for x in xs]
                unten = [[x, 0.97 - bh - dy, x + bw, 0.97 - dy] for dy in (0.0, 0.04) for x in xs]
                frei = [b for b in oben if sum(ueberlappung(b, s) for s in sperren + belegt) == 0]
                if not frei:
                    frei = [b for b in unten if sum(ueberlappung(b, s) for s in sperren + belegt) == 0]
            if frei:
                wahl = (groesse, schrift, rng.choice(frei), "frei")
                break
        if not wahl:
            groesse = max(10, int(H * 0.08))
            schrift = lade_schrift(auftrag.get("schrift"), groesse)
            grad = 0.0
            probe = text_schicht(zeilen, schrift, "#ffffff", groesse)
            bw, bh = probe.width / W, probe.height / H
            box, p = min(((box_fuer(p, bw, bh), p) for p in PLAETZE), key=lambda bp: sum(ueberlappung(bp[0], s) for s in sperren + belegt))
            wahl = (groesse, schrift, box, p)
            warnungen.append(f"Text „{t.get('text')}“ findet keinen freien Platz und überdeckt Wichtiges")
        groesse, schrift, box, platz = wahl
        farbe = t.get("farbe") if str(t.get("farbe", "")).startswith("#") else farbe_fuer(bild, box, kandidaten, rng)
        schicht = text_schicht(zeilen, schrift, farbe, groesse).rotate(grad, expand=True, resample=Image.BICUBIC)
        x = int((box[0] + box[2]) / 2 * W - schicht.width / 2)
        y = int((box[1] + box[3]) / 2 * H - schicht.height / 2)
        text_ebene.paste(schicht, (x, y), schicht)
        belegt.append(box)
        ergebnis.append({"text": t.get("text"), "box": [round(v, 4) for v in box], "farbe": farbe, "neigung": round(grad, 1), "groesse": groesse, "platz": platz})

    bild = Image.alpha_composite(bild, text_ebene)
    bild.convert("RGB").save(ausgabe)
    if auftrag.get("ebenen"):
        text_ebene.save(os.path.join(auftrag["ebenen"], "text.png"))
    return {"texte": ergebnis, "logo": [round(v, 4) for v in logo_box] if logo_box else None, "warnungen": warnungen}


if __name__ == "__main__":
    bild_pfad, auftrag_pfad, ausgabe = sys.argv[1:4]
    with open(auftrag_pfad, encoding="utf-8") as fh:
        auftrag = json.load(fh)
    try:
        print("CS_TEXT", json.dumps(setze(bild_pfad, auftrag, ausgabe), ensure_ascii=False))
    except Exception as err:
        print("CS_FEHLER", err)
        sys.exit(1)
