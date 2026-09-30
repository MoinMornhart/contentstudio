"""Bildausschnitt-Verfolgung für das Hochformat (ROADMAP 5.5): Wo im Bild spielt die Handlung?

    python verfolgung.py <video> <ffmpeg> <breite> <hoehe> <ausgabe.json> [--fps=2]

Liest das Video verkleinert (320 px breit) mit wenigen Bildern je Sekunde. Je Bild: Mitte des größten Gesichts (YuNet),
sonst der Schwerpunkt der Bewegung gegenüber dem vorigen Bild, sonst die letzte bekannte Stelle. Die Kurve wird
geglättet und in der Geschwindigkeit begrenzt, damit der Ausschnitt ruhig mitgeht statt zu springen.
Ausgabe: {"punkte": [{"t": Sekunde, "x": 0–1 (Mitte des Ausschnitts)}], "quelle": {"gesicht": n, "bewegung": n}}
"""
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

BREITE = 320


def gesicht_x(rgb):
    try:
        from PIL import Image

        from komposit import gesicht_box

        g = gesicht_box(Image.fromarray(rgb).convert("RGBA"))
        if g:
            return (g[0] + g[2]) / 2 / rgb.shape[1]
    except Exception:
        return None
    return None


def glaetten(xs, fenster=5, max_schritt=0.06):
    """Median gegen Ausreißer, dann gleitender Mittelwert, dann höchstens max_schritt Bildbreite je Punkt."""
    n = len(xs)
    if not n:
        return []
    med = [float(np.median(xs[max(0, i - fenster // 2): i + fenster // 2 + 1])) for i in range(n)]
    mit = [float(np.mean(med[max(0, i - fenster): i + fenster + 1])) for i in range(n)]
    aus = [mit[0]]
    for x in mit[1:]:
        d = max(-max_schritt, min(max_schritt, x - aus[-1]))
        aus.append(aus[-1] + d)
    return aus


def bilder_von(video, ffmpeg, hoehe_, fps):
    """Bilder einzeln aus FFmpeg lesen (auch Stunden-Streams passen so in wenig Speicher)."""
    groesse = BREITE * hoehe_ * 3
    proc = subprocess.Popen(
        [ffmpeg, "-v", "error", "-i", video, "-vf", f"fps={fps},scale={BREITE}:{hoehe_}", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    while True:
        roh = proc.stdout.read(groesse)
        if len(roh) < groesse:
            break
        yield np.frombuffer(roh, dtype=np.uint8).reshape(hoehe_, BREITE, 3)
    proc.wait()


def main(video, ffmpeg, breite, hoehe, ziel, fps=2.0):
    hoehe_ = max(2, int(round(BREITE * hoehe / max(1, breite) / 2)) * 2)
    xs, quellen = [], {"gesicht": 0, "bewegung": 0, "gehalten": 0}
    vorher = None
    letzt = 0.5
    for i, b in enumerate(bilder_von(video, ffmpeg, hoehe_, fps)):
        x = gesicht_x(b)
        if x is not None:
            quellen["gesicht"] += 1
        elif vorher is not None:
            diff = np.abs(b.astype(np.int16) - vorher.astype(np.int16)).sum(axis=2).astype(np.float32)
            diff[diff < 40] = 0
            if diff.sum() > BREITE * hoehe_ * 2:
                spalten = diff.sum(axis=0)
                x = float((spalten * np.arange(BREITE)).sum() / spalten.sum() / BREITE)
                quellen["bewegung"] += 1
        if x is None:
            x = letzt
            quellen["gehalten"] += 1
        letzt = x
        xs.append(x)
        vorher = b
    glatt = glaetten(xs)
    punkte = [{"t": round(i / fps, 2), "x": round(x, 4)} for i, x in enumerate(glatt)]
    with open(ziel, "w", encoding="utf-8") as fh:
        json.dump({"punkte": punkte, "quelle": quellen}, fh)
    print("CS_VERFOLGUNG", len(punkte), json.dumps(quellen))


if __name__ == "__main__":
    fps = next((float(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--fps=")), 2.0)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0], args[1], int(args[2]), int(args[3]), args[4], fps)
