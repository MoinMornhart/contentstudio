"""Einstieg für die App: blender -b --factory-startup --python blender/text_setzen.py -- <bild.png> <bericht.json> <texte.json> <assets> <ausgabe.png>

<assets> ist der Ordner assets/minecraft der Spieldatei (für font/ und textures/font/). Schreibt das Ergebnis als
JSON-Zeile „CS_TEXT {…}“ und das Bild nach <ausgabe.png>.
"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

args = sys.argv[sys.argv.index("--") + 1:]
bild, bericht_pfad, texte_pfad, assets, ausgabe = args[:5]
try:
    from minecraft import text as mtext

    with open(bericht_pfad, encoding="utf-8") as fh:
        bericht = json.load(fh)
    with open(texte_pfad, encoding="utf-8") as fh:
        texte = json.load(fh)
    ergebnis = mtext.setze_text(bild, bericht, texte, assets, ausgabe)
    print("CS_TEXT", json.dumps(ergebnis, ensure_ascii=False))
except Exception as err:
    print("CS_FEHLER", err)
    traceback.print_exc()
    sys.exit(1)
