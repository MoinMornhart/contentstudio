"""Geteiltes Thumbnail (BastiGHG 02 „10€ / 100€ / 1000€“, Vorher/Nachher; Stilbuch: 6 von 30 Bildern, Trennlinie weiß,
6–10 px, 5–10° schräg): 2–3 Szenen nebeneinander, jede als senkrechter Streifen um die Bildmitte, dazwischen schräge
weiße Linien, oben je ein Etikett im Minecraft-Knopf-Stil.

python split_setzen.py <assets/minecraft> <ausgabe.png> <teil1.png> <etikett1> <teil2.png> <etikett2> [<teil3.png> <etikett3>]
Etikett „-“ = ohne. Schreibt „CS_SPLIT {boxen}“ (belegte Kästen für Logo und Grafik).
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grafik_setzen import Leinwand  # noqa: E402


def setze(assets, ausgabe, teile, schraeg=7.0):
    bilder = [Image.open(p).convert("RGBA") for p, _ in teile]
    # Teilbilder kommen im Streifenformat (schmal) oder alt im vollen 16:9 – das Ergebnis ist immer 16:9
    h = bilder[0].height
    w = round(h * 16 / 9)
    n = len(bilder)
    versatz = math.tan(math.radians(schraeg)) * h / 2  # Neigung der Trennlinie: oben nach rechts
    ergebnis = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    grenzen = [w * i / n for i in range(n + 1)]
    for i, b in enumerate(bilder):
        if b.height != h:
            b = b.resize((round(b.width * h / b.height), h), Image.LANCZOS)
        mitte = (grenzen[i] + grenzen[i + 1]) / 2
        # Teilbild mittig an seinen Streifen schieben
        verschoben = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        verschoben.paste(b, (int(mitte - b.width / 2), 0))
        maske = Image.new("L", (w, h), 0)
        links_o = grenzen[i] + (versatz if i > 0 else -w)
        links_u = grenzen[i] - (versatz if i > 0 else w)
        rechts_o = grenzen[i + 1] + (versatz if i < n - 1 else w)
        rechts_u = grenzen[i + 1] - (versatz if i < n - 1 else -w)
        ImageDraw.Draw(maske).polygon([(links_o, 0), (rechts_o, 0), (rechts_u, h), (links_u, h)], fill=255)
        ergebnis.paste(verschoben, (0, 0), maske)
    linie = max(6, int(h * 0.011))
    zeichnen = ImageDraw.Draw(ergebnis)
    for i in range(1, n):
        x = grenzen[i]
        zeichnen.line([(x + versatz, -2), (x - versatz, h + 2)], fill=(255, 255, 255, 255), width=linie)
    lw = Leinwand(ergebnis, {}, assets)
    for i, (_, etikett) in enumerate(teile):
        if etikett and etikett != "-":
            mitte = (grenzen[i] + grenzen[i + 1]) / 2 / w
            lw.etikett({"text": etikett, "platz": [mitte, 0.11]})
    lw.bild.convert("RGB").save(ausgabe)
    print("CS_SPLIT", json.dumps({"boxen": [[b[0] / w, b[1] / h, b[2] / w, b[3] / h] for b in lw.belegt]}))


if __name__ == "__main__":
    a = sys.argv[1:]
    setze(a[0], a[1], [(a[i], a[i + 1]) for i in range(2, len(a) - 1, 2)])
