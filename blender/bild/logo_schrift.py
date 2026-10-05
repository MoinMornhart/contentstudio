"""Logo aus der Schrift der Marke (alle Richtungen ohne eigenes Logo-Modul): Schriftzug mit Farbverlauf, Kontur, harter
Schatten, leicht schräg, optional ein Symbol (3D-Sticker aus Microsoft Fluent Emoji, MIT) links, rechts oder oben.
Immer mit transparentem Hintergrund, eng zugeschnitten.

Aufruf: python logo_schrift.py <spec.json> <ausgabe.png> <bericht.json>
spec: {text, untertitel, untertitel_farbe, fuellung: {oben, unten}, kontur, kontur_dicke: keine|duenn|mittel|dick,
       schatten, neigung, symbol: {datei, platz: links|rechts|oben} | null, schrift: <pfad.ttf> | null}
Bericht: {breite, hoehe, warnungen} oder {fehler}.
"""
import json
import os
import sys
import traceback

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SCHRIFTEN = ["C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/ariblk.ttf", "C:/Windows/Fonts/arialbd.ttf", "/System/Library/Fonts/Supplemental/Impact.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
DICKE = {"keine": 0, "duenn": 0.035, "mittel": 0.06, "dick": 0.09}
HOEHE = 320  # Schrifthöhe in Pixeln – groß genug für den Export in 2048 px


def hex_rgb(h, standard=(255, 255, 255)):
    try:
        h = h.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except (AttributeError, ValueError, IndexError):
        return standard


def lade_schrift(pfad, groesse):
    for p in [pfad] + SCHRIFTEN:
        if p and os.path.exists(p):
            try:
                return ImageFont.truetype(p, groesse)
            except OSError:
                continue
    return ImageFont.load_default()


def schriftzug(text, schrift, oben, unten, kontur, dicke, warnungen):
    """Text als RGBA mit Farbverlauf von oben nach unten und Kontur (Pillow-Stroke)."""
    font = lade_schrift(schrift, HOEHE)
    rand = int(HOEHE * dicke)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    x0, y0, x1, y1 = probe.textbbox((0, 0), text, font=font, stroke_width=rand)
    w, h = x1 - x0 + 8, y1 - y0 + 8
    if w <= 8 or h <= 8:
        warnungen.append("Text ist leer")
        return Image.new("RGBA", (1, 1))
    maske = Image.new("L", (w, h))
    ImageDraw.Draw(maske).text((4 - x0, 4 - y0), text, font=font, fill=255)
    aussen = Image.new("L", (w, h))
    if rand:
        ImageDraw.Draw(aussen).text((4 - x0, 4 - y0), text, font=font, fill=255, stroke_width=rand, stroke_fill=255)
    # Verlauf nur über die Höhe der Buchstaben, nicht über die Kontur
    zeilen = np.linspace(0, 1, h)[:, None, None]
    verlauf = (np.array(oben)[None, None, :] * (1 - zeilen) + np.array(unten)[None, None, :] * zeilen).repeat(w, axis=1)
    fuellung = Image.fromarray(np.concatenate([verlauf, np.full((h, w, 1), 255)], axis=2).astype(np.uint8), "RGBA")
    bild = Image.new("RGBA", (w, h))
    if rand:
        bild.paste(Image.new("RGBA", (w, h), kontur + (255,)), (0, 0), aussen)
    bild.paste(fuellung, (0, 0), maske)
    return bild


def mit_schatten(bild, versatz, farbe=(0, 0, 0)):
    """Harter Schatten nach unten rechts, leicht weich – lesbar auf jedem Hintergrund."""
    w, h = bild.size
    neu = Image.new("RGBA", (w + versatz * 2, h + versatz * 2))
    alpha = bild.split()[3].filter(ImageFilter.GaussianBlur(max(1, versatz // 4)))
    schatten = Image.new("RGBA", (w, h), farbe + (0,))
    schatten.putalpha(alpha.point(lambda a: int(a * 0.75)))
    neu.alpha_composite(schatten, (versatz, versatz))
    neu.alpha_composite(bild, (0, 0))
    return neu


def zuschneiden(bild, rand=6):
    box = bild.split()[3].point(lambda a: 255 if a > 8 else 0).getbbox()
    if not box:
        return bild
    x0, y0, x1, y1 = box
    return bild.crop((max(0, x0 - rand), max(0, y0 - rand), min(bild.width, x1 + rand), min(bild.height, y1 + rand)))


def baue(spec, warnungen):
    text = " ".join(str(spec.get("text") or "LOGO").split()).upper()[:24]
    oben = hex_rgb((spec.get("fuellung") or {}).get("oben"), (255, 216, 58))
    unten = hex_rgb((spec.get("fuellung") or {}).get("unten"), (255, 138, 0))
    kontur = hex_rgb(spec.get("kontur"), (22, 22, 28))
    dicke = DICKE.get(spec.get("kontur_dicke"), DICKE["mittel"])
    haupt = schriftzug(text, spec.get("schrift"), oben, unten, kontur, dicke, warnungen)
    teile = [haupt]
    unter = str(spec.get("untertitel") or "").strip()[:32]
    if unter:
        farbe = hex_rgb(spec.get("untertitel_farbe"), (255, 255, 255))
        klein = schriftzug(unter.upper(), spec.get("schrift"), farbe, farbe, kontur, dicke, warnungen)
        f = min(1.0, haupt.width * 0.9 / max(1, klein.width), 0.42 * haupt.height / max(1, klein.height))
        teile.append(klein.resize((max(1, int(klein.width * f)), max(1, int(klein.height * f))), Image.LANCZOS))
    abstand = int(HOEHE * 0.06)
    breite = max(t.width for t in teile)
    block = Image.new("RGBA", (breite, sum(t.height for t in teile) + abstand * (len(teile) - 1)))
    y = 0
    for t in teile:
        block.alpha_composite(t, ((breite - t.width) // 2, y))
        y += t.height + abstand

    symbol = spec.get("symbol") or None
    if symbol and symbol.get("datei"):
        try:
            sym = Image.open(symbol["datei"]).convert("RGBA")
            platz = symbol.get("platz") or "links"
            ziel_h = int(haupt.height * (1.1 if platz != "oben" else 0.9))
            sym = zuschneiden(sym, 0)
            sym = sym.resize((max(1, int(sym.width * ziel_h / sym.height)), ziel_h), Image.LANCZOS)
            if platz == "oben":
                neu = Image.new("RGBA", (max(block.width, sym.width), block.height + sym.height + abstand))
                neu.alpha_composite(sym, ((neu.width - sym.width) // 2, 0))
                neu.alpha_composite(block, ((neu.width - block.width) // 2, sym.height + abstand))
            else:
                neu = Image.new("RGBA", (block.width + sym.width + abstand, max(block.height, sym.height)))
                links = platz == "links"
                neu.alpha_composite(sym, (0 if links else block.width + abstand, (neu.height - sym.height) // 2))
                neu.alpha_composite(block, (sym.width + abstand if links else 0, (neu.height - block.height) // 2))
            block = neu
        except OSError as err:
            warnungen.append(f"Symbol nicht lesbar: {err}")

    if spec.get("schatten", True):
        block = mit_schatten(block, max(4, int(HOEHE * 0.045)))
    neigung = max(-10.0, min(10.0, float(spec.get("neigung") or 0)))
    if abs(neigung) >= 0.5:
        block = block.rotate(neigung, resample=Image.BICUBIC, expand=True)
    return zuschneiden(block)


def main(spec_pfad, ausgabe, bericht_pfad):
    warnungen = []
    try:
        with open(spec_pfad, encoding="utf-8") as fh:
            spec = json.load(fh)
        bild = baue(spec, warnungen)
        bild.save(ausgabe)
        info = {"breite": bild.width, "hoehe": bild.height, "warnungen": warnungen}
        print("CS_OK", ausgabe)
    except Exception as err:  # noqa: BLE001 – Fehler gehen in den Bericht
        info = {"fehler": str(err), "spur": traceback.format_exc()}
        print("CS_FEHLER", err)
    with open(bericht_pfad, "w", encoding="utf-8") as fh:
        json.dump(info, fh, ensure_ascii=False, indent=1)
    return 0 if "fehler" not in info else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
