"""Spiele-Vorlage: den Titel der Vorlage (z. B. „007 FIRST LIGHT“) wieder über den fertigen Render legen.

    python vorlage_titel.py <vorlage> <render.png> <ausgabe.png> [x0,y0,x1,y1 | logo:… | farbe=#rrggbb:…] [--maske=pfad]

Im Titelbereich werden helle, fast farblose Pixel (weiße Schrift) übernommen, in den Logo-Bereichen zusätzlich helle
Gold- und Farbtöne, die sich deutlich vom dunklen Grund abheben. Weiche Kanten und ein leichter Schlagschatten wie im
Original, damit der Titel auf dem neuen Bild genauso lesbar bleibt.
"""
import sys

import cv2
import numpy as np


def maske(bild, box, logo=False):
    h, w = bild.shape[:2]
    x0, y0, x1, y1 = (int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))
    teil = bild[y0:y1, x0:x1].astype(np.float32)
    hell = teil.min(axis=2)
    bunt = teil.max(axis=2) - hell
    if logo:
        a = np.clip((teil.max(axis=2) - 120) / 60, 0, 1) * np.clip((bunt - 30) / 40 + (hell > 190), 0, 1)
    else:
        a = np.clip((hell - 175) / 50, 0, 1) * np.clip((70 - bunt) / 40, 0, 1)
        # nur Flächen in Buchstabenhöhe behalten (Lichtreflexe, Uhren, Knöpfe der alten Person fallen weg)
        anzahl, beschr, werte, _ = cv2.connectedComponentsWithStats((a > 0.3).astype(np.uint8), 8)
        klein = [i for i in range(1, anzahl) if werte[i, cv2.CC_STAT_HEIGHT] < 0.35 * (y1 - y0)]
        a[np.isin(cv2.dilate(beschr.astype(np.float32), np.ones((3, 3))).astype(np.int32), klein)] = 0
    m = np.zeros((h, w), np.float32)
    m[y0:y1, x0:x1] = a
    return m


def maske_farbe(bild, box, farbe):
    """Titelpixel in einer bekannten Farbe (z. B. schwarzes „007“, goldenes Logo): Farbabstand im Lab-Raum."""
    h, w = bild.shape[:2]
    x0, y0, x1, y1 = (int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))
    lab = cv2.cvtColor(bild[y0:y1, x0:x1], cv2.COLOR_BGR2LAB).astype(np.float32)
    r, g, b = (int(farbe[i:i + 2], 16) for i in (1, 3, 5))
    ziel = cv2.cvtColor(np.uint8([[[b, g, r]]]), cv2.COLOR_BGR2LAB).astype(np.float32)[0, 0]
    abstand = np.linalg.norm(lab - ziel, axis=2)
    a = np.clip((55 - abstand) / 25, 0, 1)
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    m = np.zeros((h, w), np.float32)
    m[y0:y1, x0:x1] = a
    return m, (0.299 * r + 0.587 * g + 0.114 * b) > 128


def main(vorlage, render, ausgabe, boxen):
    """boxen: „x0,y0,x1,y1“ (weiße Schrift), „logo:…“ (helle Farben) oder „farbe=#rrggbb:…“ (bekannte Textfarbe);
    „--maske=pfad“ ist die Maske der entfernten Person: dunkle Schrift wird dort nicht übernommen (nicht von Haaren
    oder Kleidung zu trennen). Vorlage und Render müssen dasselbe vorbereitete 16:9-Bild sein, sonst liegt der Titel versetzt."""
    o = cv2.imread(vorlage)
    r = cv2.imread(render)
    o = cv2.resize(o, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_AREA)
    m = np.zeros(r.shape[:2], np.float32)
    hell = False
    person = None
    for b in boxen:
        if b.startswith("--maske="):
            person = cv2.imread(b[len("--maske="):], cv2.IMREAD_GRAYSCALE)
    if person is not None:
        person = cv2.GaussianBlur(cv2.resize(person, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_NEAREST).astype(np.float32) / 255, (0, 0), 2)
    for b in boxen:
        if b.startswith("--maske="):
            continue
        if b.startswith("farbe="):
            farbe, box = b[len("farbe="):].split(":")
            teil, ist_hell = maske_farbe(o, [float(z) for z in box.split(",")], farbe)
            if not ist_hell and person is not None:
                # dunkle Schrift ist auf der alten Person nicht von Haaren oder Kleidung zu trennen: dort weglassen
                teil = teil * (1 - person)
            hell = hell or ist_hell
            m = np.maximum(m, teil)
            continue
        logo = b.startswith("logo:")
        hell = True
        m = np.maximum(m, maske(o, [float(z) for z in b.split(":")[-1].split(",")], logo))
    m = cv2.GaussianBlur(m, (0, 0), 0.6)
    ergebnis = r.astype(np.float32)
    if hell:  # helle Schrift bekommt wie im Original einen leichten Schlagschatten
        schatten = cv2.GaussianBlur(np.roll(m, (3, 3), axis=(0, 1)), (0, 0), 3) * 0.6
        ergebnis = ergebnis * (1 - schatten[..., None])
    ergebnis = ergebnis * (1 - m[..., None]) + o.astype(np.float32) * m[..., None]
    cv2.imwrite(ausgabe, np.clip(ergebnis, 0, 255).astype(np.uint8))
    print("CS_TITEL", ausgabe)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:])
