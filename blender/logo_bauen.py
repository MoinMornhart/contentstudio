# Herkunft: MoinStudio blender/logo_bauen.py (MIT), v0.38.0.
"""Einstieg für die App: blender -b --factory-startup --python blender/logo_bauen.py -- <spec.json> <assets> <ausgabe.png> <bericht.json>

<assets> ist der Ordner assets/minecraft der Spieldatei (Schrift und Texturen). Schreibt ein PNG mit Transparenz und
den Bericht ({breite, hoehe, warnungen} oder {fehler}).
"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

args = sys.argv[sys.argv.index("--") + 1:]
spec_pfad, assets, ausgabe, bericht = args[:4]
try:
    from minecraft import logobau

    with open(spec_pfad, encoding="utf-8") as fh:
        spec = json.load(fh)
    info = logobau.baue_logo(spec, assets, os.path.join(assets, "textures"), ausgabe)
    with open(bericht, "w", encoding="utf-8") as fh:
        json.dump(info, fh, ensure_ascii=False, indent=1)
    print("CS_OK", ausgabe)
except Exception as err:
    with open(bericht, "w", encoding="utf-8") as fh:
        json.dump({"fehler": str(err), "spur": traceback.format_exc()}, fh, ensure_ascii=False, indent=1)
    print("CS_FEHLER", err)
    sys.exit(1)
