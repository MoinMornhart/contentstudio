# Herkunft: MoinStudio blender/moin/logo.py (MIT), v0.38.0.
"""Logos: Bildwerkzeuge für Logos und das Setzen eines Logos in ein fertiges Thumbnail.

Reine Pixelarbeit mit numpy (kein Rendern): Bilder werden als RGBA-Felder mit Zeile 0 = oben gelesen und geschrieben.
Das Logo kommt in die Box, die die App frei von Figuren, Text und Wichtigem gewählt hat (src/main/logo/platz.ts), mit
weichem Schatten dahinter, damit es auf jedem Hintergrund lesbar bleibt.
"""
import numpy as np

from .text import _bild_array

try:
    import bpy
except ImportError:
    bpy = None


def lade(pfad):
    """RGBA (float 0–1, sRGB, nicht vormultipliziert), Zeile 0 = oben."""
    a, _ = _bild_array(pfad)
    return np.ascontiguousarray(a[..., :4], dtype=np.float32)


def speichere(a, pfad):
    """RGBA-Feld (Zeile 0 = oben) als PNG mit Transparenz."""
    h, w = a.shape[:2]
    if bpy is None:
        from PIL import Image

        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(pfad)
        return
    img = bpy.data.images.new("logo_aus", w, h, alpha=True)
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.ascontiguousarray(np.flipud(np.clip(a, 0, 1))).ravel())
    img.filepath_raw = pfad
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def _gewichte(n_ein, n_aus):
    """Dreiecksfilter (Matrix n_aus × n_ein): beim Verkleinern so breit wie der Faktor (kein Flimmern), sonst bilinear."""
    skala = n_ein / n_aus
    breite = max(1.0, skala)
    mitte = (np.arange(n_aus) + 0.5) * skala - 0.5
    d = np.abs(np.arange(n_ein)[None, :] - mitte[:, None]) / breite
    w = np.clip(1.0 - d, 0.0, None)
    s = w.sum(axis=1, keepdims=True)
    s[s == 0] = 1.0
    return (w / s).astype(np.float32)


def skaliere(a, breite, hoehe):
    """Weich skalieren mit vormultipliziertem Alpha (keine dunklen Säume an durchsichtigen Kanten)."""
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4]
    wy, wx = _gewichte(a.shape[0], hoehe), _gewichte(a.shape[1], breite)
    aus = np.einsum("oy,yxc->oxc", wy, pm)
    aus = np.einsum("px,oxc->opc", wx, aus)
    alpha = aus[..., 3:4]
    aus[..., :3] = np.where(alpha > 1e-5, aus[..., :3] / np.maximum(alpha, 1e-5), 0.0)
    return np.clip(aus, 0.0, 1.0)


def skaliere_pixel(a, faktor):
    """Pixelscharf vergrößern (ganzzahlig), für Minecraft-Texturen."""
    f = max(1, int(round(faktor)))
    return np.repeat(np.repeat(a, f, axis=0), f, axis=1)


def _box(m, r, achse):
    pad = [(0, 0), (0, 0)]
    pad[achse] = (r + 1, r)
    c = np.cumsum(np.pad(m, pad), axis=achse)
    n = 2 * r + 1
    return (c[n:] - c[:-n]) / n if achse == 0 else (c[:, n:] - c[:, :-n]) / n


def weich(m, r):
    """Weichzeichnen einer Maske (dreimal Kastenfilter ≈ Gauß)."""
    r = int(max(1, round(r)))
    for _ in range(3):
        m = _box(_box(m, r, 0), r, 1)
    return m


def verschiebe(m, dx, dy):
    """Maske um ganze Pixel verschieben (dx nach rechts, dy nach unten), Rand bleibt leer."""
    aus = np.zeros_like(m)
    h, w = m.shape[:2]
    dx, dy = int(dx), int(dy)
    ys, yz = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xz = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    aus[yz, xz] = m[ys, xs]
    return aus


def wachse(m, r):
    """Maske (bool) um r Pixel erweitern – rund, für Konturen."""
    r = int(max(0, round(r)))
    if r == 0:
        return m.copy()
    aus = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r + r:
                aus |= verschiebe(m, dx, dy)
    return aus


def ueber(oben, unten):
    """Alpha-Compositing „oben über unten“ (beide RGBA, nicht vormultipliziert)."""
    ao, au = oben[..., 3:4], unten[..., 3:4]
    a = ao + au * (1 - ao)
    farbe = (oben[..., :3] * ao + unten[..., :3] * au * (1 - ao)) / np.maximum(a, 1e-5)
    return np.concatenate([np.where(a > 1e-5, farbe, 0.0), a], axis=-1)


def zuschneiden(a, rand=0):
    """Durchsichtigen Rand abschneiden, `rand` Pixel Luft lassen."""
    ys, xs = np.nonzero(a[..., 3] > 0.01)
    if not len(ys):
        return a
    y0, y1 = max(0, ys.min() - rand), min(a.shape[0], ys.max() + 1 + rand)
    x0, x1 = max(0, xs.min() - rand), min(a.shape[1], xs.max() + 1 + rand)
    return a[y0:y1, x0:x1]


def setze_logo(bild_pfad, logo_pfad, box, ausgabe):
    """Logo in die Box (Bildanteile x0, y0, x1, y1) setzen, mit weichem Schatten für die Lesbarkeit."""
    a = lade(bild_pfad)
    H, W = a.shape[:2]
    l = lade(logo_pfad)
    x0, y0 = int(round(box[0] * W)), int(round(box[1] * H))
    bw, bh = max(1, int(round((box[2] - box[0]) * W))), max(1, int(round((box[3] - box[1]) * H)))
    if bw > l.shape[1] * 1.5:  # kleine Pixel-Logos erst pixelscharf vergrößern, sonst werden sie matschig
        l = skaliere_pixel(l, np.ceil(bw / l.shape[1]))
    l = skaliere(l, bw, bh)
    # Logo auf eine bildgroße Ebene legen (am Bildrand abgeschnitten)
    ebene = np.zeros((H, W, 4), dtype=np.float32)
    ys, xs = slice(max(0, y0), min(H, y0 + bh)), slice(max(0, x0), min(W, x0 + bw))
    ebene[ys, xs] = l[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
    # weicher dunkler Schatten nach unten rechts: hebt das Logo von hellen und unruhigen Hintergründen ab
    r = max(2.0, bh * 0.035)
    schatten = weich(verschiebe(ebene[..., 3], r * 0.5, r * 0.7), r) * 0.6
    a[..., :3] *= 1 - schatten[..., None]
    a = ueber(ebene, a)
    speichere(a, ausgabe)
    return {"box": [round(v, 4) for v in box], "pixel": [x0, y0, bw, bh]}
