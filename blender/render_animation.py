# Herkunft: MoinStudio blender/render_animation.py (MIT), v0.44.0.
"""Einstieg für die App: blender -b --factory-startup --python blender/render_animation.py -- <animation.json> <texturen> <bilder-ordner>"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

args = sys.argv[sys.argv.index("--") + 1:]
pfad, texturen, ordner = args[0], args[1], args[2]
try:
    from minecraft import animation as manimation

    with open(pfad, encoding="utf-8") as fh:
        beschreibung = json.load(fh)
    n = manimation.baue(beschreibung, texturen, ordner)
    print("CS_OK", n)
except Exception as err:
    print("CS_FEHLER", err)
    traceback.print_exc()
    sys.exit(1)
