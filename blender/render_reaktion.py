"""Einstieg für die App: blender -b --factory-startup --python blender/render_reaktion.py -- <spec.json> <ausgabe.png> <bericht.json>"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

args = sys.argv[sys.argv.index("--") + 1:]
spec_pfad, ausgabe, bericht = args[0], args[1], args[2]
try:
    from minecraft import reaktion

    with open(spec_pfad, encoding="utf-8") as fh:
        spec = json.load(fh)
    reaktion.baue_reaktion(spec, ausgabe, bericht)
    print("CS_OK", ausgabe)
except Exception as err:
    with open(bericht, "w", encoding="utf-8") as fh:
        json.dump({"fehler": str(err), "spur": traceback.format_exc()}, fh, ensure_ascii=False, indent=1)
    print("CS_FEHLER", err)
    sys.exit(1)
