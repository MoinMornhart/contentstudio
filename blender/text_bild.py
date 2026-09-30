"""Text als Bild in Minecraft-Schrift für den Schnitt (ROADMAP E.2): läuft in Python mit Pillow und numpy, ohne Blender.

    python text_bild.py <assets> <ausgabe.png> <text> [farbe=#ffffff] [pixel=8]

<assets> ist assets/minecraft der Spieldatei (font/ und textures/font/). Mehrere Zeilen mit „\\n“. Stil wie im Spiel:
harter Schatten nach unten rechts (Textfarbe auf ein Viertel), dazu eine dunkle Kontur, damit der Text auf jedem
Videobild lesbar bleibt. Gibt „CS_TEXTBILD breite hoehe“ aus.
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from minecraft.text import Schrift  # noqa: E402


def farbe_aus(wert):
    wert = wert.lstrip("#")
    return np.array([int(wert[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def text_bild(assets, text, farbe="#ffffff", pixel=8):
    schrift = Schrift(assets)
    zeilen = [schrift.satz(z) for z in text.split("\\n") if z] or [schrift.satz(" ")]
    breite = max(z.shape[1] for z in zeilen)
    hoehe = sum(z.shape[0] + 2 for z in zeilen)
    maske = np.zeros((hoehe, breite), dtype=bool)
    y = 0
    for z in zeilen:
        x = (breite - z.shape[1]) // 2
        maske[y:y + z.shape[0], x:x + z.shape[1]] = z
        y += z.shape[0] + 2
    k = max(1, int(pixel))
    gross = np.kron(maske, np.ones((k, k), dtype=bool))
    rand = max(1, k // 3)
    h, w = gross.shape
    bild = np.zeros((h + 2 * rand + k, w + 2 * rand + k, 4), dtype=np.float32)
    f = farbe_aus(farbe)
    # Kontur: Maske in alle Richtungen um „rand“ verschoben
    for dy in range(-rand, rand + 1):
        for dx in range(-rand, rand + 1):
            sy, sx = rand + dy, rand + dx
            teil = bild[sy:sy + h, sx:sx + w]
            teil[gross] = (15, 15, 20, 230)
    # Schatten wie im Spiel, dann die Schrift
    bild[rand + k:rand + k + h, rand + k:rand + k + w][gross] = (*(f * 0.25), 255)
    bild[rand:rand + h, rand:rand + w][gross] = (*f, 255)
    return Image.fromarray(bild.astype(np.uint8), "RGBA")


if __name__ == "__main__":
    assets, ausgabe, text = sys.argv[1], sys.argv[2], sys.argv[3]
    farbe = sys.argv[4] if len(sys.argv) > 4 else "#ffffff"
    pixel = int(sys.argv[5]) if len(sys.argv) > 5 else 8
    b = text_bild(assets, text, farbe, pixel)
    b.save(ausgabe)
    print("CS_TEXTBILD", b.width, b.height)
