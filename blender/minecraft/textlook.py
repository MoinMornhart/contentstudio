"""Lebendiger Text: „der Text soll so bisschen random rumfliegen, wo Platz ist … und farblich anpassen“.

- Platz: zufällig unter den freien Kandidaten-Plätzen (nie über Figur, wichtigem Detail oder anderem Text)
- Winkel: leicht schräg (3–8°, Richtung zufällig) statt immer waagerecht
- Farbe: aus einer kräftigen Palette die Farbe, die sich vom Bild unter dem Text am besten abhebt
Der Zufall hängt an einem Startwert aus der Spezifikation, damit ein Bild reproduzierbar bleibt und Varianten sich
unterscheiden. Keine Effekte wie Glow – nur Platz, Winkel und Farbe.
"""
import random

# sRGB-Palette (kräftige Thumbnail-Farben); Rot ist für den Pfeil reserviert
PALETTE = {
    "weiss": (1.0, 1.0, 1.0),
    "gelb": (1.0, 0.84, 0.0),
    "orange": (1.0, 0.55, 0.05),
    "cyan": (0.0, 0.9, 1.0),
    "gruen": (0.5, 1.0, 0.1),
    "pink": (1.0, 0.3, 0.75),
    "rot": (1.0, 0.18, 0.15),
}


def zufall(spec):
    return random.Random(spec.get("zufall", 0))


def linear(rgb):
    """sRGB → lineare Farbe für Emission-Shader."""
    return tuple(c ** 2.2 for c in rgb)


class BildFarben:
    """Mittlere Farbe (sRGB 0–1) eines Bildbereichs, für die Farbwahl unter dem Text."""

    def __init__(self, pfad):
        import bpy
        import numpy as np

        img = bpy.data.images.load(pfad, check_existing=True)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        self.px = px.reshape(h, w, 4)[::-1, :, :3]  # Zeile 0 = oben
        # Bilddaten sind je nach Farbraum schon linear: für die Bewertung zurück nach sRGB
        if img.colorspace_settings.name != "sRGB":
            self.px = np.clip(self.px, 0, 1) ** (1 / 2.2)
        self.h, self.w = h, w

    def mittel(self, u0, v0, u1, v1):
        y0, y1 = int(max(0, v0) * self.h), int(min(1, v1) * self.h)
        x0, x1 = int(max(0, u0) * self.w), int(min(1, u1) * self.w)
        teil = self.px[y0:max(y0 + 1, y1), x0:max(x0 + 1, x1)]
        return tuple(float(c) for c in teil.reshape(-1, 3).mean(axis=0))


def _hell(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def waehle_farbe(grund, rng, ohne=("rot",)):
    """Kräftige Farbe mit bestem Abstand zum Grund; unter den besten zwei zufällig, damit es nicht immer gleich ist."""
    wertung = []
    for name, c in PALETTE.items():
        if name in ohne:
            continue
        abstand = sum((a - b) ** 2 for a, b in zip(c, grund)) ** 0.5
        # kräftige Farben bekommen einen Vorzug vor Weiß, solange sie sich vom Grund abheben
        wertung.append((abstand + 0.6 * abs(_hell(c) - _hell(grund)) + (0.35 if name != "weiss" else 0), name))
    wertung.sort(reverse=True)
    return rng.choice(wertung[:2])[1]


def neigung(rng, staerke=(3.0, 8.0)):
    """Leichte Schräglage in Grad, Richtung zufällig."""
    return rng.uniform(*staerke) * rng.choice((-1, 1))


def waehle_platz(kandidaten, frei, rng):
    """Zufälliger Platz aus `kandidaten` ([u, v]), für den `frei(u, v)` wahr ist; sonst der erste Kandidat."""
    gut = [k for k in kandidaten if frei(*k)]
    return rng.choice(gut) if gut else kandidaten[0]
