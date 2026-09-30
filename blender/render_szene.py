"""Einstieg für die App: blender -b --factory-startup --python blender/render_szene.py -- <szene.json> <texturen> <ausgabe.png> <bericht.json>"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

args = sys.argv[sys.argv.index("--") + 1:]
szene_pfad, texturen, ausgabe, bericht = args[0], args[1], args[2], args[3]
try:
    from minecraft import szene as mszene

    with open(szene_pfad, encoding="utf-8") as fh:
        szene = json.load(fh)
    mszene.baue(szene, texturen, ausgabe, bericht)
    print("CS_OK", ausgabe)
except Exception as err:  # Bericht für die App: Fehler lesbar zurückgeben
    with open(bericht, "w", encoding="utf-8") as fh:
        json.dump({"fehler": str(err), "spur": traceback.format_exc()}, fh, ensure_ascii=False, indent=1)
    print("CS_FEHLER", err)
    sys.exit(1)
