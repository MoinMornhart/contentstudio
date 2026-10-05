"""Veredeln eines Thumbnail-Renders wie im Photoshop-Schritt großer Kanäle (M5b, Q.3): Vordergrund und Hintergrund werden
getrennt behandelt – mit der Workbench-Maske, die Blender zu jedem Bild rendert (Figuren, Mobs und gehaltene Items weiß).

- Hintergrund: etwas weicher und dunkler, damit die Figuren davor stehen (Vergleich 02.10. mit GommeHD: bei uns lief
  alles in einer Ebene ineinander)
- Vordergrund: knackiger (Unschärfemaske), etwas mehr Sättigung
- Randlicht: Licht aus dem Hintergrund fällt auf die Kanten (Light Wrap) – in dessen eigener Farbe, also nie ein
  aufgesetzter Glow; von oben stärker als von unten
- feine helle Randkante (Stilbuch: höchstens 2–3 px, kein Glow)

Ohne brauchbare Maske (fehlt, leer, fast alles Vordergrund) bleibt das Bild unverändert.

python veredeln.py <bild.png> <maske.png> <ausgabe.png> [staerke 0..1]
"""
import json
import sys

import numpy as np
from PIL import Image


def _box(a, r):
    """Kastenunschärfe mit Radius r entlang beider Achsen (Rand wird fortgesetzt)."""
    if r < 1:
        return a
    for achse in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[achse] = (r + 1, r)
        p = np.pad(a, pad, mode="edge")
        c = np.cumsum(p, axis=achse)
        n = a.shape[achse]
        hoch = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=achse)
        tief = np.take(c, np.arange(0, n), axis=achse)
        a = (hoch - tief) / (2 * r + 1)
    return a


def weich(a, sigma):
    """Gauß-Näherung aus drei Kastenunschärfen."""
    r = max(0, int(round(sigma * 0.85)))
    for _ in range(3):
        a = _box(a, r)
    return a


def saettigung(rgb, faktor):
    grau = (rgb * np.array([0.299, 0.587, 0.114])).sum(axis=2, keepdims=True)
    return grau + (rgb - grau) * faktor


def lade_maske(pfad, groesse):
    m = Image.open(pfad).convert("RGBA").resize(groesse, Image.LANCZOS)
    a = np.asarray(m, dtype=np.float32) / 255.0
    return a[:, :, 0] * a[:, :, 3]


def veredle(rgb, m, staerke=1.0):
    h, w = m.shape
    s = w / 1280.0  # alle Radien für 1280 px Breite gedacht
    m = np.clip(weich(m, 0.8 * s), 0, 1)
    m3 = m[:, :, None]

    # Hintergrund: nur aus Hintergrund-Pixeln weichzeichnen (sonst ziehen Figuren Schlieren in den Hintergrund)
    hg = 1.0 - m3
    # nur ein Hauch weicher (1,2 statt 3 px): bei den Vorbildern bleibt die Welt detailreich, 3 px nahmen dem Hintergrund
    # vier Fünftel seiner Details (Vergleich 8.2, 05.10.)
    sigma = 1.2 * s
    hg_weich = weich(rgb * hg, sigma) / np.maximum(weich(hg, sigma), 1e-4)
    hg_weich = np.where(hg > 0.02, hg_weich, rgb)
    # Vergleich mit den Vorbildern (8.2, 05.10.): deren Welt ist satt und nur leicht dunkler – blasser machen ließ unsere
    # Bilder neben ihnen grau wirken
    hg_bild = saettigung(hg_weich, 1.0 + 0.08 * staerke) * (1.0 - 0.10 * staerke)

    # Vordergrund: Unschärfemaske und etwas mehr Farbe
    vg = rgb + (rgb - weich(rgb, 2.0 * s)) * 0.55 * staerke
    vg = saettigung(vg, 1.0 + 0.2 * staerke)
    vg = 0.5 + (vg - 0.5) * (1.0 + 0.1 * staerke)

    # Light Wrap: weichgezeichneter Hintergrund fällt auf die Innenkante der Silhouette
    kante_innen = np.clip((m - weich(m, 7.0 * s)) * 2.4, 0, 1)
    gy, _gx = np.gradient(weich(m, 3.0 * s))
    oben = np.clip(0.55 + 0.45 * np.sign(gy) * np.minimum(np.abs(gy) * 40, 1), 0.2, 1.0)  # Kanten nach oben heller
    licht = weich(hg_weich, 12.0 * s)
    hell = licht.max(axis=2, keepdims=True)
    licht = licht / np.maximum(hell, 1e-4) * np.clip(hell * 1.6 + 0.25, 0, 1)  # Farbe des Lichts, nicht seine Dunkelheit
    wrap = (kante_innen * oben)[:, :, None] * 0.55 * staerke
    vg = 1 - (1 - vg) * (1 - licht * wrap)  # Negativ multiplizieren: nur aufhellen

    bild = hg_bild * (1 - m3) + vg * m3

    # feine helle Randkante außen
    breite = max(1.0, 1.6 * s)
    aussen = np.clip(weich(m, breite) * 2.2 - m * 2.2, 0, 1) * (1 - m)
    aussen = np.clip(aussen * 1.8, 0, 1) * 0.75 * staerke
    bild = bild * (1 - aussen[:, :, None]) + np.array([1.0, 0.98, 0.94]) * aussen[:, :, None]
    return np.clip(bild, 0, 1)


def main(bild, maske, ausgabe, staerke=1.0):
    img = Image.open(bild).convert("RGB")
    rgb = np.asarray(img, dtype=np.float32) / 255.0
    try:
        m = lade_maske(maske, img.size)
    except OSError:
        m = None
    anteil = float(m.mean()) if m is not None else 0.0
    if m is None or anteil < 0.005 or anteil > 0.85:
        img.save(ausgabe)
        print("CS_VEREDELT", json.dumps({"veredelt": False, "anteil": round(anteil, 3)}))
        return
    out = veredle(rgb, m, staerke)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(ausgabe)
    print("CS_VEREDELT", json.dumps({"veredelt": True, "anteil": round(anteil, 3)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 1.0)
