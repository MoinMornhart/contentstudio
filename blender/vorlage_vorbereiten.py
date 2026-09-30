"""Spiele-Vorlage vorbereiten: schwarze Balken entfernen und auf 1280×720 (16:9) bringen.

    python vorlage_vorbereiten.py <vorlage> <ausgabe.png>

Vorlagen aus dem Netz sind oft klein, 4:3 oder haben schwarze Balken (Letterbox). Alle weiteren Schritte (Claudes
Analyse, Freistellen, Render, Titel) arbeiten danach mit genau diesem Bild – so passen die Koordinaten überall zusammen
und der Titel liegt nie versetzt oder doppelt.
"""
import sys

import cv2
import numpy as np

BREITE, HOEHE = 1280, 720


def balken_weg(arr, schwelle=18):
    """Schneidet gleichmäßig dunkle Ränder (Letterbox/Pillarbox) ab."""
    grau = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    zeilen = np.where((grau.mean(axis=1) > schwelle) | (grau.std(axis=1) > 12))[0]
    spalten = np.where((grau.mean(axis=0) > schwelle) | (grau.std(axis=0) > 12))[0]
    if len(zeilen) < 10 or len(spalten) < 10:
        return arr
    return arr[zeilen[0]:zeilen[-1] + 1, spalten[0]:spalten[-1] + 1]


def auf_16_9(arr):
    """Füllt 16:9 (cover): Überstand mittig abschneiden, dann auf 1280×720 skalieren."""
    h, w = arr.shape[:2]
    ziel = BREITE / HOEHE
    if w / h > ziel:  # zu breit
        nw = int(round(h * ziel))
        x0 = (w - nw) // 2
        arr = arr[:, x0:x0 + nw]
    else:  # zu hoch (z. B. 4:3): oben etwas weniger abschneiden als unten, Köpfe sitzen meist oben
        nh = int(round(w / ziel))
        y0 = int((h - nh) * 0.4)
        arr = arr[y0:y0 + nh]
    return cv2.resize(arr, (BREITE, HOEHE), interpolation=cv2.INTER_CUBIC if arr.shape[1] < BREITE else cv2.INTER_AREA)


def main(ein, aus):
    arr = cv2.imdecode(np.fromfile(ein, dtype=np.uint8), cv2.IMREAD_COLOR)
    if arr is None:
        raise SystemExit(f"Bild nicht lesbar: {ein}")
    h0, w0 = arr.shape[:2]
    arr = auf_16_9(balken_weg(arr))
    if w0 < BREITE:  # kleine Vorlagen nach dem Hochskalieren leicht nachschärfen
        weich = cv2.GaussianBlur(arr, (0, 0), 1.2)
        arr = cv2.addWeighted(arr, 1.5, weich, -0.5, 0)
    ok, daten = cv2.imencode(".png", arr)
    daten.tofile(aus)
    print("CS_VORBEREITET", w0, h0)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
