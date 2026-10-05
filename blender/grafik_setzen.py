"""Grafik-Ebene für Minecraft-Thumbnails (MoinStudio, 30.09.: „bei den Minecraft-Thumbnails ein richtiges Update“).

Nach dem Vergleich mit BastiGHG (12 von 30 Bildern mit Minecraft-Oberfläche als Grafik, Stilbuch 10): Hotbar mit
Herzen, Hunger und XP-Leiste, „Level 19“, Etiketten im Knopf-Stil, rote Lupe mit Pfeil, Haken-/Kreuz-/Zahl-Abzeichen
und großer gestapelter Text. Alles aus den echten Texturen der Spieldatei, pixelscharf im Minecraft-Maßstab.

python grafik_setzen.py <bild.png> <bericht.json> <grafik.json> <assets/minecraft> <ausgabe.png>

grafik.json: Liste von Elementen, z. B.
  {"art": "hud", "items": ["diamond_pickaxe", "torch", "bread"], "auswahl": 0, "herzen": 7, "hunger": 10, "level": 30}
  {"art": "level", "zahl": 19}                     – „Level 19“ mit XP-Leiste, oben mittig
  {"art": "etikett", "text": "100% STRONGHOLDS", "platz": "oben"}
  {"art": "lupe", "ziel": "mob:0" | "objekt:0" | "item:ich" | "ich" | [u, v]}
  {"art": "abzeichen", "typ": "haken" | "kreuz" | "zahl", "zahl": 1, "ueber": "ich" | "mob:0" | [u, v]}
  {"art": "grosstext", "zeilen": ["KEIN ANGREIFEN", "KEIN ABBAUEN"], "farbe": "rot"}
Schreibt „CS_GRAFIK {…}“ mit den belegten Kästen (für Logo und Prüfung).
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from minecraft.text import Schrift  # noqa: E402  (Bitmap-Schrift der Spieldatei, läuft auch ohne Blender)

ROT = (224, 20, 30)
XP_GRUEN = (128, 255, 32)
FARBEN = {"rot": ROT, "gelb": (255, 214, 0), "weiss": (255, 255, 255), "gruen": (80, 220, 60), "gold": (255, 180, 0),
          "blau": (40, 120, 255), "tuerkis": (40, 220, 220)}
ZAHL_FARBEN = {1: (224, 32, 40), 2: (30, 110, 235), 3: (245, 190, 0), 4: (40, 190, 60)}


class Leinwand:
    def __init__(self, bild, bericht, assets):
        self.bild = bild.convert("RGBA")
        self.w, self.h = self.bild.size
        self.bericht = bericht
        self.assets = assets
        self.schrift = Schrift(assets)
        # Minecraft-GUI-Maßstab: bei 720 px Höhe 4 Bildpunkte je GUI-Pixel (Hotbar ≈ 57 % der Breite)
        self.s = max(2, round(self.h / 720 * 4))
        self.belegt = []  # Kästen in Pixeln, die schon Grafik tragen
        self.geschuetzt = self._geschuetzt()
        self.maske = None  # Figurenmaske (L, 255 = Figur/Mob/Item), wenn Blender eine gerendert hat

    # --- Hilfen -----------------------------------------------------------------------------------------------
    def _geschuetzt(self):
        """Gesichter und Köpfe (nie verdecken), Mobs und Figuren (möglichst nicht)."""
        k = []
        for f in (self.bericht.get("figuren") or {}).values():
            b = f.get("kopf_box")
            if b:
                k.append(self._px(b, rand=0.02))
        for m in self.bericht.get("mobs") or []:
            b = m.get("kopf_box") or m.get("box")
            if b and (b[2] - b[0]) * (b[3] - b[1]) < 0.25:
                k.append(self._px(b))
        return k

    def _px(self, b, rand=0.0):
        return (int((b[0] - rand) * self.w), int((b[1] - rand) * self.h), int((b[2] + rand) * self.w), int((b[3] + rand) * self.h))

    @staticmethod
    def _schnitt(a, b):
        return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))

    def frei(self, box):
        """Anteil eines Kastens, der Gesichter oder schon gesetzte Grafik überdeckt (0 = ganz frei)."""
        f = max(1, (box[2] - box[0]) * (box[3] - box[1]))
        return sum(self._schnitt(box, g) for g in self.geschuetzt + self.belegt) / f

    def textur(self, *teile):
        p = os.path.join(self.assets, "textures", *teile)
        return Image.open(p).convert("RGBA") if os.path.exists(p) else None

    def gross(self, img, faktor=None):
        f = faktor or self.s
        return img.resize((img.width * f, img.height * f), Image.NEAREST)

    def _sichtbar(self, b):
        """Kasten (u0, v0, u1, v1) auf den sichtbaren Bildteil beschnitten, oder None."""
        b = (max(0.0, b[0]), max(0.0, b[1]), min(1.0, b[2]), min(1.0, b[3]))
        return b if b[2] > b[0] and b[3] > b[1] else None

    def _ding_box(self, ref):
        """„objekt:0“ → Kasten des Blocks/Modells, „item:ich“ → Werkzeug in der Hand (sichtbarer Teil)."""
        if not isinstance(ref, str):
            return None
        if ref.startswith("objekt:"):
            nr = ref[7:]
            for o in self.bericht.get("objekte") or []:
                if str(o.get("nr")) == nr and o.get("box"):
                    return self._sichtbar(o["box"])
        if ref.startswith("item:"):
            it = (self.bericht.get("items") or {}).get(ref[5:] or "ich")
            if it and it.get("box"):
                return self._sichtbar(it["box"])
        return None

    def punkt(self, ref):
        """„ich“/Figuren-ID → Kopfmitte, „mob:0“ → Mob-Mitte, „objekt:0“/„item:ich“ → Mitte des sichtbaren Teils,
        [u, v] → Bildpunkt. Früher landeten Objekt-Ziele auf die eigenen Kopf (Lupe aufs Auge statt auf den Diamanten)."""
        if isinstance(ref, (list, tuple)) and len(ref) == 2:
            return int(ref[0] * self.w), int(ref[1] * self.h)
        b = self._ding_box(ref)
        if b:
            return int((b[0] + b[2]) / 2 * self.w), int((b[1] + b[3]) / 2 * self.h)
        figuren = self.bericht.get("figuren") or {}
        if isinstance(ref, str) and ref.startswith("mob:"):
            mobs = self.bericht.get("mobs") or []
            i = int(ref[4:]) if ref[4:].isdigit() else 0
            if i < len(mobs):
                b = mobs[i].get("kopf_box")
                if b:
                    return int((b[0] + b[2]) / 2 * self.w), int((b[1] + b[3]) / 2 * self.h)
                b = mobs[i]["box"]  # ohne Kopfkasten: oberes Viertel (dort sitzt meist der Kopf)
                return int((b[0] + b[2]) / 2 * self.w), int((b[1] + (b[3] - b[1]) * 0.2) * self.h)
        f = figuren.get(ref if isinstance(ref, str) else "ich") or next(iter(figuren.values()), None)
        if f and f.get("kopf"):
            return int(f["kopf"][0] * self.w), int(f["kopf"][1] * self.h)
        return self.w // 2, self.h // 2

    def kopf_box(self, ref):
        figuren = self.bericht.get("figuren") or {}
        ding = self._ding_box(ref)
        if ding:
            return self._px(ding)
        if isinstance(ref, str) and ref.startswith("mob:"):
            mobs = self.bericht.get("mobs") or []
            i = int(ref[4:]) if ref[4:].isdigit() else 0
            if i < len(mobs):
                return self._px(mobs[i].get("kopf_box") or mobs[i]["box"])
        f = figuren.get(ref) if isinstance(ref, str) else None
        f = f or figuren.get("ich") or next(iter(figuren.values()), None)
        if f and f.get("kopf_box"):
            return self._px(f["kopf_box"])
        x, y = self.punkt(ref)
        return (x - 40, y - 40, x + 40, y + 40)

    # --- Schrift im Minecraft-Stil -------------------------------------------------------------------------------
    def mc_text(self, text, groesse, farbe=(255, 255, 255), schatten=True, kontur=0):
        """Text wie im Spiel aus der Bitmap-Schrift der Spieldatei: harter Schatten um einen Schriftpixel nach rechts
        unten in ¼ der Helligkeit, optional schwarze Kontur. `groesse` ≈ Zeilenhöhe in Bildpunkten."""
        maske = self.schrift.satz(text)
        k = max(1, round(groesse / 8))  # Bildpunkte je Schriftpixel
        rand = k + kontur
        h, w = maske.shape
        a = Image.fromarray((maske * 255).astype(np.uint8), "L").resize((w * k, h * k), Image.NEAREST)
        img = Image.new("RGBA", (w * k + 2 * rand + k, h * k + 2 * rand + k), (0, 0, 0, 0))
        voll = lambda c: Image.new("RGBA", a.size, tuple(c[:3]) + (255,))  # noqa: E731
        if kontur:
            dick = Image.new("L", img.size, 0)
            dick.paste(a, (rand, rand))
            dick.paste(a, (rand + k, rand + k), a)
            dick = dick.filter(ImageFilter.MaxFilter(kontur * 2 + 1))
            img.paste(Image.new("RGBA", img.size, (0, 0, 0, 255)), (0, 0), dick)
        if schatten:
            img.paste(voll(tuple(c // 4 for c in farbe[:3])), (rand + k, rand + k), a)
        img.paste(voll(farbe), (rand, rand), a)
        return img

    def setzen(self, img, x, y):
        box = (int(x), int(y), int(x) + img.width, int(y) + img.height)
        self.bild.alpha_composite(img, (max(0, box[0]), max(0, box[1])), (max(0, -box[0]), max(0, -box[1])))
        self.belegt.append(box)
        return box

    # --- Items als Symbol -------------------------------------------------------------------------------------
    def item_symbol(self, name):
        """16×16-Symbol: Item-Textur oder ein Block als kleiner Iso-Würfel (wie im Inventar)."""
        name = name.replace("minecraft:", "")
        it = self.textur("item", f"{name}.png")
        if it:
            return it.crop((0, 0, 16, 16)) if it.height > 16 else it
        flach = self.textur("block", f"{name}.png")
        if flach is not None and min(flach.split()[3].getextrema()) < 128 and not self.textur("block", f"{name}_top.png"):
            return flach.crop((0, 0, 16, 16))  # durchsichtige Textur (Fackel, Blume, Leiter): im Inventar flach
        oben = self.textur("block", f"{name}_top.png") or self.textur("block", f"{name}.png")
        seite = self.textur("block", f"{name}_side.png") or self.textur("block", f"{name}.png")
        if not oben or not seite:
            return None
        oben, seite = oben.crop((0, 0, 16, 16)), seite.crop((0, 0, 16, 16))
        n = 64
        wuerfel = Image.new("RGBA", (n, n), (0, 0, 0, 0))

        def flaeche(tex, ecken, hell):
            t = tex.resize((n, n), Image.NEAREST).convert("RGBA")
            if hell != 1.0:
                t = Image.eval(t.convert("RGB"), lambda c: int(c * hell)).convert("RGBA")
                t.putalpha(tex.resize((n, n), Image.NEAREST).split()[3])
            # affine Abbildung des Quadrats auf das Parallelogramm (ecken: oben links, oben rechts, unten links)
            (x0, y0), (x1, y1), (x2, y2) = ecken
            a, b, c = (x1 - x0) / n, (x2 - x0) / n, x0
            d, e, f = (y1 - y0) / n, (y2 - y0) / n, y0
            det = a * e - b * d
            inv = (e / det, -b / det, (b * f - e * c) / det, -d / det, a / det, (d * c - a * f) / det)
            wuerfel.alpha_composite(t.transform((n, n), Image.AFFINE, inv, Image.NEAREST))

        m = n / 2
        flaeche(oben, ((m, 2), (n - 2, n * 0.27), (2, n * 0.27)), 1.0)
        flaeche(seite, ((2, n * 0.27), (m, n * 0.52), (2, n * 0.78)), 0.86)
        flaeche(seite, ((m, n * 0.52), (n - 2, n * 0.27), (m, n - 2)), 0.7)
        return wuerfel.resize((16, 16), Image.LANCZOS)

    # --- Elemente -----------------------------------------------------------------------------------------------
    def hud(self, e):
        """Hotbar unten mittig wie im Spiel, darüber XP-Leiste mit Level, Herzen links und Hunger rechts."""
        s = self.s
        hotbar = self.textur("gui", "sprites", "hud", "hotbar.png")
        if hotbar is None:
            return
        x0 = (self.w - hotbar.width * s) // 2
        y0 = self.h - hotbar.height * s - s
        oben = y0
        vorher = self.bild.copy()
        self.setzen(self.gross(hotbar), x0, y0)
        for i, name in enumerate((e.get("items") or [])[:9]):
            sym = self.item_symbol(str(name))
            if sym:
                self.setzen(self.gross(sym), x0 + (3 + i * 20) * s, y0 + 3 * s)
        auswahl = self.textur("gui", "sprites", "hud", "hotbar_selection.png")
        if auswahl is not None and e.get("auswahl") is not None:
            self.setzen(self.gross(auswahl), x0 + (-1 + int(e["auswahl"]) * 20) * s, y0 - s)
        xp_hg = self.textur("gui", "sprites", "hud", "experience_bar_background.png")
        xp = self.textur("gui", "sprites", "hud", "experience_bar_progress.png")
        if xp_hg is not None:
            yx = y0 - 7 * s
            self.setzen(self.gross(xp_hg), x0 + s, yx)
            if xp is not None:
                anteil = float(e.get("xp", 0.6))
                self.setzen(self.gross(xp.crop((0, 0, max(1, int(xp.width * anteil)), xp.height))), x0 + s, yx)
            oben = yx
            if e.get("level") is not None:
                t = self.mc_text(str(e["level"]), 8 * s, XP_GRUEN, kontur=s)
                self.setzen(t, (self.w - t.width) // 2, yx - t.height + 2 * s)
        yh = oben - 10 * s
        herzen = int(round(float(e.get("herzen", 10)) * 2))
        for i in range(10):
            voll = herzen - i * 2
            name = "full.png" if voll >= 2 else "half.png" if voll == 1 else None
            hg = self.textur("gui", "sprites", "hud", "heart", "container.png")
            if hg is not None:
                self.setzen(self.gross(hg), x0 + i * 8 * s, yh)
            if name:
                h = self.textur("gui", "sprites", "hud", "heart", name)
                if h is not None:
                    self.setzen(self.gross(h), x0 + i * 8 * s, yh)
        hunger = int(round(float(e.get("hunger", 10)) * 2))
        for i in range(10):
            voll = hunger - i * 2
            x = x0 + (hotbar.width - 9 - i * 8) * s
            hg = self.textur("gui", "sprites", "hud", "food_empty.png")
            if hg is not None:
                self.setzen(self.gross(hg), x, yh)
            name = "food_full.png" if voll >= 2 else "food_half.png" if voll == 1 else None
            if name:
                f = self.textur("gui", "sprites", "hud", name)
                if f is not None:
                    self.setzen(self.gross(f), x, yh)
        # Figuren stehen vor der Leiste (Nether-Test 02.10.: Hotbar lag über die eigenen Körper) – wie eine Ebene in
        # Photoshop: wo die Figurenmaske ist, kommt das Bild von vorher wieder obenauf
        if self.maske is not None:
            box = (max(0, x0 - s), max(0, yh - s), min(self.w, x0 + (hotbar.width + 1) * s), self.h)
            self.bild.paste(vorher.crop(box), box[:2], self.maske.crop(box))

    def level(self, e):
        """„Level 19“ in XP-Grün mit XP-Leiste darunter, groß und oben mittig (Basti 05, 09)."""
        s = self.s * 2
        t = self.mc_text(f"Level {e.get('zahl', 1)}" if e.get("text") is None else str(e["text"]), 8 * s, XP_GRUEN, kontur=self.s)
        xp_hg = self.textur("gui", "sprites", "hud", "experience_bar_background.png")
        xp = self.textur("gui", "sprites", "hud", "experience_bar_progress.png")
        leiste = self.gross(xp_hg, max(1, s // 2)) if xp_hg is not None else None
        if leiste is not None and leiste.width > self.w * 0.5:
            leiste = leiste.resize((int(self.w * 0.5), leiste.height), Image.NEAREST)
        breite = max(t.width, leiste.width if leiste else 0)
        hoehe = t.height + (leiste.height if leiste else 0)
        kandidaten = [(x, y) for y in (int(self.h * 0.04), int(self.h * 0.2)) for x in ((self.w - breite) // 2, int(self.w * 0.04), int(self.w * 0.96) - breite)]
        x, y = min(kandidaten, key=lambda p: self.frei((p[0], p[1], p[0] + breite, p[1] + hoehe)) + 0.001 * kandidaten.index(p))
        self.setzen(t, x + (breite - t.width) // 2, y)
        if leiste is not None:
            yl = y + t.height
            self.setzen(leiste, x + (breite - leiste.width) // 2, yl)
            if xp is not None:
                p = xp.crop((0, 0, max(1, int(xp.width * float(e.get("xp", 0.7)))), xp.height))
                p = p.resize((max(1, int(leiste.width * p.width / xp.width)), leiste.height), Image.NEAREST)
                self.setzen(p, x + (breite - leiste.width) // 2, yl)

    def etikett(self, e):
        """Text auf einem Minecraft-Knopf (Basti 09 „100% STRONGHOLDS“, Preisschilder 10€/100€)."""
        s = self.s
        t = self.mc_text(str(e.get("text", "")), 8 * s * (2 if e.get("gross", True) else 1) // 2 * 2, FARBEN.get(e.get("farbe"), (255, 255, 255)))
        knopf = self.textur("gui", "sprites", "widget", "button.png")
        rand = 3 * s
        bw, bh = t.width + rand * 4, t.height + rand * 2
        if knopf is not None:
            # 9-Slice: 3 px Rand der 200×20-Textur bleiben scharf, die Mitte wird gestreckt
            k = knopf
            r = 3
            teile = Image.new("RGBA", (bw // s + 1, bh // s + 1))
            W, H = teile.size
            mitte = k.crop((r, r, k.width - r, k.height - r)).resize((max(1, W - 2 * r), max(1, H - 2 * r)), Image.NEAREST)
            teile.paste(mitte, (r, r))
            for (sx, sy, sw, sh, dx, dy, dw, dh) in (
                (0, 0, r, r, 0, 0, r, r), (k.width - r, 0, r, r, W - r, 0, r, r), (0, k.height - r, r, r, 0, H - r, r, r),
                (k.width - r, k.height - r, r, r, W - r, H - r, r, r), (r, 0, k.width - 2 * r, r, r, 0, W - 2 * r, r),
                (r, k.height - r, k.width - 2 * r, r, r, H - r, W - 2 * r, r), (0, r, r, k.height - 2 * r, 0, r, r, H - 2 * r),
                (k.width - r, r, r, k.height - 2 * r, W - r, r, r, H - 2 * r)):
                teile.paste(k.crop((sx, sy, sx + sw, sy + sh)).resize((max(1, dw), max(1, dh)), Image.NEAREST), (dx, dy))
            grund = self.gross(teile)
        else:
            grund = Image.new("RGBA", (bw, bh), (40, 40, 40, 230))
        grund.alpha_composite(t, ((grund.width - t.width) // 2, (grund.height - t.height) // 2))
        platz = e.get("platz", "oben")
        kandidaten = {"oben": [((self.w - grund.width) // 2, int(self.h * 0.05))],
                      "unten": [((self.w - grund.width) // 2, int(self.h * 0.95) - grund.height)]}.get(platz) if isinstance(platz, str) else None
        if kandidaten is None and isinstance(platz, (list, tuple)):
            kandidaten = [(int(platz[0] * self.w - grund.width / 2), int(platz[1] * self.h - grund.height / 2))]
        kandidaten = (kandidaten or []) + [((self.w - grund.width) // 2, int(self.h * 0.05)), (int(self.w * 0.04), int(self.h * 0.05)),
                                          (int(self.w * 0.96) - grund.width, int(self.h * 0.05))]
        x, y = min(kandidaten, key=lambda p: self.frei((p[0], p[1], p[0] + grund.width, p[1] + grund.height)))
        self.setzen(grund, x, y)

    def abzeichen(self, e):
        """Runder Abzeichen-Knopf über dem Kopf: grüner Haken, rotes Kreuz oder Zahl (Basti 04, 08)."""
        typ = e.get("typ", "zahl")
        kb = self.kopf_box(e.get("ueber", "ich"))
        d = max(int(self.h * 0.11), int((kb[2] - kb[0]) * 0.55))
        farbe = (60, 200, 70) if typ == "haken" else ROT if typ == "kreuz" else ZAHL_FARBEN.get(int(e.get("zahl", 1)), ROT)
        g = 4
        img = Image.new("RGBA", (d * g, d * g), (0, 0, 0, 0))
        dr = ImageDraw.Draw(img)
        dr.ellipse((0, 0, d * g - 1, d * g - 1), fill=(255, 255, 255, 255))
        rand = int(d * g * 0.07)
        dr.ellipse((rand, rand, d * g - 1 - rand, d * g - 1 - rand), fill=farbe + (255,))
        m, st = d * g / 2, int(d * g * 0.11)
        if typ == "haken":
            dr.line([(m - d * g * 0.22, m), (m - d * g * 0.05, m + d * g * 0.17), (m + d * g * 0.25, m - d * g * 0.18)], fill=(255, 255, 255, 255), width=st, joint="curve")
        elif typ == "kreuz":
            q = d * g * 0.2
            dr.line([(m - q, m - q), (m + q, m + q)], fill=(255, 255, 255, 255), width=st)
            dr.line([(m - q, m + q), (m + q, m - q)], fill=(255, 255, 255, 255), width=st)
        img = img.resize((d, d), Image.LANCZOS)
        if typ == "zahl":
            t = self.mc_text(str(e.get("zahl", 1)), int(d * 0.55) // 8 * 8 or 8, (255, 255, 255))
            img.alpha_composite(t, ((d - t.width) // 2 + d // 30, (d - t.height) // 2))
        schatten = Image.new("RGBA", img.size, (0, 0, 0, 0))
        schatten.putalpha(img.split()[3].point(lambda a: int(a * 0.45)))
        x = (kb[0] + kb[2]) // 2 - d // 2
        y = max(int(self.h * 0.02), kb[1] - d - int(self.h * 0.02))
        self.setzen(schatten.filter(ImageFilter.GaussianBlur(d * 0.04)), x + d // 25, y + d // 25)
        self.belegt.pop()
        self.setzen(img, x, y)

    def lupe(self, e):
        """Rote Lupe (Kreis mit weißem Rand) mit vergrößertem Ausschnitt und rotem Pfeil zum Ziel (Basti 07)."""
        zx, zy = self.punkt(e.get("ziel", "mob:0"))
        r = int(self.h * float(e.get("groesse", 0.2)))
        ausschnitt = max(8, int(r / float(e.get("zoom", 2.2))))
        ding = self._ding_box(e.get("ziel"))
        if ding:  # großer Block: ein gutes Stück davon zeigen statt zwei Texturpixel
            bw, bh = (ding[2] - ding[0]) * self.w, (ding[3] - ding[1]) * self.h
            ausschnitt = min(r, max(ausschnitt, int(min(bw, bh) * 0.3)))
        quelle = self.bild.crop((zx - ausschnitt, zy - ausschnitt, zx + ausschnitt, zy + ausschnitt)).resize((2 * r, 2 * r), Image.LANCZOS)
        # Platz für die Lupe: nie über einem Gesicht, nie über dem Ziel selbst, möglichst auf freier Fläche und nicht
        # zu weit weg (Test 01.10.: Lupe lag über die eigenen Gesicht, weil nur vier Stellen auf Zielhöhe probiert wurden)
        ys = {min(max(y, r + 10), self.h - r - 10) for y in (zy, int(self.h * 0.28), int(self.h * 0.7))}
        kandidaten = [(int(self.w * f), y) for f in (0.15, 0.3, 0.5, 0.7, 0.85) for y in ys]

        def wertung(p):
            box = (p[0] - r, p[1] - r, p[0] + r, p[1] + r)
            f = max(1, 4 * r * r)
            gesicht = sum(self._schnitt(box, g) for g in self.geschuetzt) / f
            ueber_ziel = max(0.0, 1.0 - math.hypot(p[0] - zx, p[1] - zy) / (r + ausschnitt * 1.5))
            ecke = 1.0 if box[2] > self.w * 0.8 and box[3] > self.h * 0.8 else 0.0  # Videolänge unten rechts
            weg = math.hypot(p[0] - zx, p[1] - zy) / self.w
            return gesicht * 5 + self.frei(box) + ueber_ziel * 2 + ecke + weg * 0.3

        cx, cy = min(kandidaten, key=wertung)
        g = 3
        maske = Image.new("L", (2 * r * g, 2 * r * g), 0)
        ImageDraw.Draw(maske).ellipse((0, 0, 2 * r * g - 1, 2 * r * g - 1), fill=255)
        maske = maske.resize((2 * r, 2 * r), Image.LANCZOS)
        rund = Image.new("RGBA", (2 * r, 2 * r), (0, 0, 0, 0))
        rund.paste(quelle, (0, 0), maske)
        ring = Image.new("RGBA", (2 * r * g + 40 * g, 2 * r * g + 40 * g), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ring)
        w = int(r * g * 0.07)
        dr.ellipse((20 * g - w, 20 * g - w, 20 * g + 2 * r * g + w, 20 * g + 2 * r * g + w), outline=ROT + (255,), width=w)
        dr.ellipse((20 * g, 20 * g, 20 * g + 2 * r * g, 20 * g + 2 * r * g), outline=(255, 255, 255, 255), width=max(2, w // 2))
        ring = ring.resize((ring.width // g, ring.height // g), Image.LANCZOS)
        self.setzen(rund, cx - r, cy - r)
        self.setzen(ring, cx - r - 20, cy - r - 20)
        # Pfeil vom Kreisrand zum Ziel
        wink = math.atan2(zy - cy, zx - cx)
        sx, sy = cx + math.cos(wink) * r * 1.08, cy + math.sin(wink) * r * 1.08
        ex, ey = zx - math.cos(wink) * ausschnitt * 1.1, zy - math.sin(wink) * ausschnitt * 1.1
        if math.hypot(ex - sx, ey - sy) > r * 0.4:
            self._pfeil((sx, sy), (ex, ey), int(self.h * 0.022))
        # Kreis ums Ziel
        ziel = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        ImageDraw.Draw(ziel).ellipse((zx - ausschnitt, zy - ausschnitt, zx + ausschnitt, zy + ausschnitt), outline=ROT + (255,), width=max(3, int(self.h * 0.008)))
        self.bild.alpha_composite(ziel)

    def _pfeil(self, a, b, dicke):
        g = 3
        img = Image.new("RGBA", (self.w * g, self.h * g), (0, 0, 0, 0))
        dr = ImageDraw.Draw(img)
        ax, ay, bx, by = a[0] * g, a[1] * g, b[0] * g, b[1] * g
        wink = math.atan2(by - ay, bx - ax)
        spitze = dicke * g * 3.2
        hals = (bx - math.cos(wink) * spitze * 0.8, by - math.sin(wink) * spitze * 0.8)
        for farbe, extra in (((255, 255, 255, 255), dicke * g * 0.5), (ROT + (255,), 0)):
            dr.line([(ax, ay), hals], fill=farbe, width=int(dicke * g + extra))
            q = spitze * 0.55 + extra
            links = (hals[0] + math.cos(wink + math.pi / 2) * q, hals[1] + math.sin(wink + math.pi / 2) * q)
            rechts = (hals[0] + math.cos(wink - math.pi / 2) * q, hals[1] + math.sin(wink - math.pi / 2) * q)
            vorn = (bx + math.cos(wink) * extra, by + math.sin(wink) * extra)
            dr.polygon([links, vorn, rechts], fill=farbe)
        self.bild.alpha_composite(img.resize((self.w, self.h), Image.LANCZOS))

    def grosstext(self, e):
        """Großer gestapelter Text, jede Zeile gleich breit gestreckt (Basti 10 „KEIN ANGREIFEN …“)."""
        zeilen = [str(z).upper() for z in (e.get("zeilen") or [e.get("text", "")]) if str(z).strip()][:5]
        if not zeilen:
            return
        farbe = FARBEN.get(e.get("farbe", "rot"), ROT)
        # Rot auf rotem Grund (Nether, Lava) ist unlesbar – dann Gelb bzw. Weiß (Test 30.09.)
        grund = self.bild.convert("RGB").resize((1, 1), Image.BOX).getpixel((0, 0))
        if farbe == ROT and grund[0] > 1.6 * max(grund[1], grund[2], 1):
            farbe = FARBEN["gelb"]
        bestes = None
        for anteil in (float(e.get("breite", 0.46)), 0.4, 0.34):
            breite = int(self.w * anteil)
            bilder = []
            for z in zeilen:
                t = self.mc_text(z, 64, farbe, kontur=7)
                bilder.append(t.resize((breite, max(8, int(t.height * breite / t.width))), Image.NEAREST))
            hoehe = sum(b.height for b in bilder)
            if hoehe > self.h * 0.8:
                f = self.h * 0.8 / hoehe
                bilder = [b.resize((int(b.width * f), int(b.height * f)), Image.NEAREST) for b in bilder]
                hoehe, breite = sum(b.height for b in bilder), bilder[0].width
            for x in (int(self.w * 0.96) - breite, int(self.w * 0.04)):
                for y in ((self.h - hoehe) // 2, int(self.h * 0.06), int(self.h * 0.94) - hoehe):
                    wert = self.frei((x, y, x + breite, y + hoehe))
                    if bestes is None or wert < bestes[0] - 1e-6:
                        bestes = (wert, x, y, bilder)
            if bestes[0] < 0.02:
                break
        _, x, y, bilder = bestes
        for b in bilder:
            self.setzen(b, x, y)
            y += b.height


def main(bild, bericht_pfad, grafik_pfad, assets, ausgabe):
    with open(bericht_pfad, encoding="utf-8") as fh:
        bericht = json.load(fh)
    with open(grafik_pfad, encoding="utf-8") as fh:
        grafik = json.load(fh)
    lw = Leinwand(Image.open(bild), bericht, assets)
    maske = bericht_pfad.replace(".bericht.json", ".maske.png")
    if maske != bericht_pfad and os.path.exists(maske):
        m = Image.open(maske).convert("RGBA").resize(lw.bild.size)
        r, _, _, a = m.split()
        lw.maske = ImageChops.multiply(r, a)
    # Reihenfolge: große Flächen zuerst, damit kleine Elemente ihnen ausweichen
    ordnung = {"grosstext": 0, "hud": 1, "abzeichen": 2, "lupe": 3, "level": 4, "etikett": 5}
    for e in sorted(grafik, key=lambda e: ordnung.get(e.get("art"), 9)):
        f = getattr(lw, e.get("art", ""), None)
        if callable(f) and not e.get("art", "").startswith("_"):
            f(e)
        else:
            print("CS_WARNUNG unbekanntes Grafik-Element", e.get("art"))
    lw.bild.convert("RGB").save(ausgabe)
    print("CS_GRAFIK", json.dumps({"boxen": [[b[0] / lw.w, b[1] / lw.h, b[2] / lw.w, b[3] / lw.h] for b in lw.belegt]}))


if __name__ == "__main__":
    main(*sys.argv[1:6])
