"""Text als Bild in der Schrift der Marke für den Schnitt (ROADMAP 5.4): Einblendungen und Titelkarten.

    python text_bild_ttf.py <ausgabe.png> <text> [farbe=#ffffff] [schrift.ttf]

Mehrere Zeilen mit „\\n“. Dunkle Kontur und weicher Schatten, damit der Text auf jedem Videobild lesbar bleibt.
Gibt „CS_TEXTBILD breite hoehe“ aus. Minecraft-Kanäle nutzen stattdessen die Pixelschrift (text_bild.py).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from text_ttf import lade_schrift, text_schicht  # noqa: E402

if __name__ == "__main__":
    ausgabe, text = sys.argv[1], sys.argv[2]
    farbe = sys.argv[3] if len(sys.argv) > 3 else "#ffffff"
    schrift_pfad = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
    groesse = 160
    zeilen = [z for z in text.split("\\n") if z.strip()] or [" "]
    bild = text_schicht(zeilen, lade_schrift(schrift_pfad, groesse), farbe, groesse)
    bild.save(ausgabe)
    print("CS_TEXTBILD", bild.width, bild.height)
