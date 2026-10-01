"""Foto-Compositing (ROADMAP 4.4): Personen oder Figuren freistellen und auf einen Hintergrund setzen.

Aufruf (Python der Bild-Umgebung, nicht Blender):
  python komposit.py <spec.json> <ausgabe.png> <bericht.json>

spec:
{
  "breite": 1280, "hoehe": 720,
  "hintergrund": {"art": "bild", "pfad": "...", "unschaerfe": 6, "abdunkeln": 0.15}
               | {"art": "verlauf", "farben": ["#1b2a6b", "#e0141e"], "winkel": 30},
  "personen": [{"id": "ich", "bild": "...", "freistellen": true, "modell": "u2net_human_seg",
                "seite": "links" | "mitte" | "rechts", "mitte_x": 0.27 (optional, 0–1),
                "hoehe": 0.95 (Höhe der Figur als Anteil der Bildhöhe), "anschnitt": 0.2 (Anteil unten abgeschnitten),
                "spiegeln": false, "rand": 3, "randfarbe": "#ffffff", "schatten": true}],
  "objekte": [{"pfad": "...png", "x": 0.75, "y": 0.6, "groesse": 0.35, "drehung": -8}] (Gegenstände als Sticker),
  "licht_angleichen": 0.25,
  "look": {"kontrast": 1.08, "saettigung": 1.12, "vignette": 0.2},
  "ebenen": "<ordner>" (optional: einzelne Ebenen für den PSD-Export)
}

bericht: {"figuren": {id: {"box": [u0, v0, u1, v1], "kopf_box": [...], "gesicht": true|false}},
         "items": {"objekt-1": {"box": [...]}}, "warnungen": [...]}
Alle Boxen in Bildanteilen (0–1, oben links = 0,0). Personen werden nie gezeichnet, nur freigestellt und gesetzt.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def cover(bild, w, h, fokus=(0.5, 0.5)):
    """Bild bildfüllend zuschneiden (wie CSS object-fit: cover)."""
    f = max(w / bild.width, h / bild.height)
    neu = bild.resize((max(w, round(bild.width * f)), max(h, round(bild.height * f))), Image.LANCZOS)
    x = int((neu.width - w) * fokus[0])
    y = int((neu.height - h) * fokus[1])
    return neu.crop((x, y, x + w, y + h))


def verlauf(w, h, farben, winkel):
    a = np.array(hex_rgb(farben[0]), dtype=np.float32)
    b = np.array(hex_rgb(farben[-1] if len(farben) > 1 else farben[0]), dtype=np.float32)
    r = math.radians(winkel)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    t = ((xs / w - 0.5) * math.cos(r) + (ys / h - 0.5) * math.sin(r)) + 0.5
    t = np.clip(t, 0, 1)[..., None]
    rgb = a * (1 - t) + b * t
    # leichtes Licht in der Mitte, damit die Fläche nicht flach wirkt
    licht = 1 + 0.18 * np.exp(-(((xs / w - 0.5) ** 2) / 0.08 + ((ys / h - 0.4) ** 2) / 0.12))[..., None]
    return Image.fromarray(np.clip(rgb * licht, 0, 255).astype(np.uint8), "RGB")


def hintergrund(spec, w, h):
    hg = spec.get("hintergrund") or {"art": "verlauf", "farben": ["#1d2b64", "#f8cdda"], "winkel": 30}
    if hg.get("art") in ("bild", "standbild") and hg.get("pfad") and os.path.exists(hg["pfad"]):
        bild = cover(Image.open(hg["pfad"]).convert("RGB"), w, h, tuple(hg.get("fokus", (0.5, 0.5))))
        if hg.get("unschaerfe"):
            bild = bild.filter(ImageFilter.GaussianBlur(float(hg["unschaerfe"]) * w / 1280))
        if hg.get("abdunkeln"):
            bild = ImageEnhance.Brightness(bild).enhance(1 - float(hg["abdunkeln"]))
        return bild
    return verlauf(w, h, hg.get("farben") or ["#1d2b64", "#f8cdda"], float(hg.get("winkel", 30)))


_SITZUNGEN = {}


def freistellen(bild, modell):
    from rembg import new_session, remove

    if modell not in _SITZUNGEN:
        _SITZUNGEN[modell] = new_session(modell)
    maske = remove(bild.convert("RGB"), session=_SITZUNGEN[modell], only_mask=True, post_process_mask=True)
    maske = maske.convert("L")
    # Kante minimal weich, damit keine Treppen entstehen
    maske = maske.filter(ImageFilter.GaussianBlur(0.8))
    rgba = bild.convert("RGBA")
    rgba.putalpha(maske)
    return rgba


GESICHT_MODELL = os.environ.get("CS_GESICHT_MODELL", "")
_DETEKTOR = {}


def gesicht_box(rgba):
    """Größtes Gesicht in Pixeln der Figur, None wenn keins erkannt wird. YuNet (OpenCV-Modell, MIT), sonst Haar-Kaskade
    (nur in OpenCV 4)."""
    try:
        import cv2

        # OpenCV neben onnxruntime (rembg) im selben Prozess: ohne diese Einstellung zufällig „Unknown C++ exception“
        cv2.ocl.setUseOpenCL(False)
        cv2.setNumThreads(1)
    except ImportError:
        return None
    rgb = np.asarray(rgba.convert("RGB"))
    kandidaten = []
    yunet_ok = False
    if GESICHT_MODELL and os.path.exists(GESICHT_MODELL) and hasattr(cv2, "FaceDetectorYN"):
        try:
            # YuNet arbeitet am besten auf ~640 px
            f = min(1.0, 640 / max(rgb.shape[:2]))
            klein = cv2.resize(rgb, (max(1, int(rgb.shape[1] * f)), max(1, int(rgb.shape[0] * f))))
            bgr = cv2.cvtColor(klein, cv2.COLOR_RGB2BGR)
            # Einmal laden, dann nur die Bildgröße anpassen (Verfolgung ruft das für tausende Bilder auf)
            det = _DETEKTOR.get("yunet")
            if det is None:
                det = cv2.FaceDetectorYN.create(GESICHT_MODELL, "", (bgr.shape[1], bgr.shape[0]), 0.7, 0.3, 5000)
                _DETEKTOR["yunet"] = det
            det.setInputSize((bgr.shape[1], bgr.shape[0]))
            _, faces = det.detect(bgr)
            for fc in faces if faces is not None else []:
                x, y, w, h = (float(v) / f for v in fc[:4])
                kandidaten.append((w * h, (int(x), int(y), int(x + w), int(y + h))))
            yunet_ok = True
        except cv2.error as e:
            # z. B. zu wenig Speicher: Detektor neu laden lassen und für dieses Bild die Haar-Kaskade nehmen
            _DETEKTOR.pop("yunet", None)
            print(f"CS_HINWEIS YuNet fehlgeschlagen, nehme Haar-Kaskade: {e}", file=sys.stderr)
    if not yunet_ok and hasattr(cv2, "CascadeClassifier"):
        try:
            grau = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
            for name in ("haarcascade_frontalface_default.xml", "haarcascade_profileface.xml"):
                kaskade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, name))
                mindest = max(24, int(min(grau.shape) * 0.06))
                for (x, y, w, h) in kaskade.detectMultiScale(grau, scaleFactor=1.1, minNeighbors=6, minSize=(mindest, mindest)):
                    kandidaten.append((w * h, (int(x), int(y), int(x + w), int(y + h))))
        except cv2.error as e:
            # ohne Gesicht geht es weiter: der Aufbau nimmt dann die Figur als Ganzes
            print(f"CS_HINWEIS Gesichtserkennung fehlgeschlagen: {e}", file=sys.stderr)
    if not kandidaten:
        return None
    return max(kandidaten)[1]


def kontur(rgba, px, farbe):
    """Dünne helle Randkante um die Figur (Stilbuch: 2–4 px, kein Sticker-Rand)."""
    if px <= 0:
        return None
    a = rgba.getchannel("A")
    gross = a.filter(ImageFilter.MaxFilter(int(px) * 2 + 1)).filter(ImageFilter.GaussianBlur(0.6))
    rand = Image.new("RGBA", rgba.size, hex_rgb(farbe) + (0,))
    rand.putalpha(gross)
    return rand


def schatten(rgba, w_ges):
    a = rgba.getchannel("A").filter(ImageFilter.GaussianBlur(max(4, w_ges * 0.012)))
    s = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    s.putalpha(a.point(lambda v: int(v * 0.45)))
    return s


def angleichen(rgba, grund, staerke):
    """Figur farblich an den Hintergrund angleichen (Licht und Farbton), ohne sie flach zu machen."""
    if staerke <= 0:
        return rgba
    arr = np.asarray(rgba).astype(np.float32)
    a = arr[..., 3] > 128
    if not a.any():
        return rgba
    fig = arr[..., :3][a].mean(axis=0)
    ziel = np.asarray(grund).reshape(-1, 3).astype(np.float32).mean(axis=0)
    # Nur Farbstich und ein Teil der Helligkeit übertragen
    faktor = 1 + staerke * ((ziel + 30) / (fig + 30) - 1)
    faktor = np.clip(faktor, 0.75, 1.3)
    arr[..., :3] = np.clip(arr[..., :3] * faktor, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def ueberlappung(a, b):
    """Anteil von b, den a überdeckt (Boxen in Bildanteilen)"""
    x = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    y = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return x * y / max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))


def objekte_setzen(leinwand, objekte, bericht, ebenen):
    """Gegenstände (3D-Sticker, freigestellte PNGs) mit weichem Schatten über die Personen setzen."""
    W, H = leinwand.size
    ebene = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, o in enumerate(objekte):
        try:
            bild = Image.open(o["pfad"]).convert("RGBA")
        except Exception:
            bericht["warnungen"].append(f"Gegenstand {i + 1} nicht lesbar – weggelassen")
            continue
        bbox = bild.getchannel("A").getbbox()
        if not bbox:
            continue
        bild = bild.crop(bbox)
        h = max(8, int(float(o.get("groesse", 0.3)) * H))
        w = max(8, int(bild.width * h / bild.height))
        bild = bild.resize((w, h), Image.LANCZOS)
        if o.get("drehung"):
            bild = bild.rotate(float(o["drehung"]), resample=Image.BICUBIC, expand=True)
        x0 = int(float(o.get("x", 0.75)) * W - bild.width / 2)
        y0 = int(float(o.get("y", 0.6)) * H - bild.height / 2)
        s = schatten(bild, W)
        ebene.paste(s, (x0 + int(W * 0.01), y0 + int(H * 0.015)), s)
        oben = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        oben.paste(bild, (x0, y0), bild)
        ebene = Image.alpha_composite(ebene, oben)
        box = [max(0, x0) / W, max(0, y0) / H, min(W, x0 + bild.width) / W, min(H, y0 + bild.height) / H]
        bericht.setdefault("items", {})[f"objekt-{i + 1}"] = {"box": [round(v, 4) for v in box]}
        for fid, fig in bericht["figuren"].items():
            if fig.get("kopf_box") and ueberlappung(box, fig["kopf_box"]) > 0.1:
                bericht["warnungen"].append(f"Gegenstand {i + 1} verdeckt das Gesicht von {fid}")
    if ebenen and objekte:
        ebene.save(os.path.join(ebenen, "objekte.png"))
    return Image.alpha_composite(leinwand, ebene)


def look(bild, spec):
    l = spec.get("look") or {}
    if l.get("kontrast"):
        bild = ImageEnhance.Contrast(bild).enhance(float(l["kontrast"]))
    if l.get("saettigung"):
        bild = ImageEnhance.Color(bild).enhance(float(l["saettigung"]))
    v = float(l.get("vignette", 0))
    if v > 0:
        w, h = bild.size
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((xs / w - 0.5) / 0.75) ** 2 + ((ys / h - 0.5) / 0.75) ** 2)
        m = np.clip(1 - v * np.clip(d - 0.35, 0, 1) * 1.6, 0, 1)[..., None]
        bild = Image.fromarray(np.clip(np.asarray(bild).astype(np.float32) * m, 0, 255).astype(np.uint8), "RGB")
    return bild


def baue(spec, ausgabe, bericht_pfad):
    W, H = int(spec.get("breite", 1280)), int(spec.get("hoehe", 720))
    grund = hintergrund(spec, W, H)
    leinwand = grund.convert("RGBA")
    bericht = {"figuren": {}, "warnungen": []}
    ebenen = spec.get("ebenen")
    if ebenen:
        os.makedirs(ebenen, exist_ok=True)
        grund.save(os.path.join(ebenen, "hintergrund.png"))

    personen = spec.get("personen", [])
    for i, p in enumerate(personen):
        quelle = Image.open(p["bild"])
        quelle = ImageOps.exif_transpose(quelle)
        fig = freistellen(quelle, p.get("modell", "u2net_human_seg")) if p.get("freistellen", True) else quelle.convert("RGBA")
        bbox = fig.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if not bbox:
            bericht["warnungen"].append(f"Bild einer Figur ({p.get('id')}) ist nach dem Freistellen leer")
            continue
        # Welche Ränder des Originalfotos schneiden die Figur ab? (vor dem Zuschneiden prüfen)
        voll = np.asarray(fig.getchannel("A"))
        offen = {"links": voll[:, :3].max() > 128, "rechts": voll[:, -3:].max() > 128, "unten": voll[-3:].max() > 128}
        if p.get("art") == "modell":  # 3D-Modell: Blender rendert es frei, nur ein Anschnitt unten ist gewollt
            offen["links"] = offen["rechts"] = False
        qw = fig.width
        fig = fig.crop(bbox)
        # Kopf schon bekannt (3D-Modell: Blender kennt ihn genau), in Pixeln des Zuschnitts
        kr = p.get("kopf_rel")
        kopf_bekannt = None
        if kr:
            kopf_bekannt = [kr[0] * qw - bbox[0], kr[1] * voll.shape[0] - bbox[1], kr[2] * qw - bbox[0], kr[3] * voll.shape[0] - bbox[1]]
        # Seitlich abgeschnittene Fotos so spiegeln, dass die Schnittkante zum nahen Bildrand zeigt
        seite_vorab = p.get("seite", "links" if i == 0 else "rechts")
        def falsch(o):
            return (seite_vorab == "rechts" and o["links"] and not o["rechts"]) or (seite_vorab == "links" and o["rechts"] and not o["links"])

        gespiegelt = {"links": offen["rechts"], "rechts": offen["links"], "unten": offen["unten"]}
        if (bool(p.get("spiegeln")) or falsch(offen)) and not falsch(gespiegelt):
            fig = ImageOps.mirror(fig)
            offen["links"], offen["rechts"] = offen["rechts"], offen["links"]
            if kopf_bekannt:
                kopf_bekannt = [fig.width - kopf_bekannt[2], kopf_bekannt[1], fig.width - kopf_bekannt[0], kopf_bekannt[3]]
        gesicht = tuple(int(v) for v in kopf_bekannt) if kopf_bekannt else gesicht_box(fig)
        # Unten abgeschnittenes Foto (Brustbild): der Körper muss über den unteren Bildrand hinausgehen, sonst schwebt er
        unten_offen = offen["unten"]
        anschnitt = float(p.get("anschnitt", 0.15))
        kopf_anteil = p.get("kopf_anteil")
        if gesicht and kopf_anteil:
            # Größe nach dem Gesicht (Stilbuch: Kopfhöhe als Anteil der Bildhöhe), Gesichtsmitte auf kopf_y
            f = float(kopf_anteil) * H / max(1, gesicht[3] - gesicht[1])
            ky = float(p.get("kopf_y", 0.42))
            y0_f = ky * H - (gesicht[1] + gesicht[3]) / 2 * f
            if unten_offen and y0_f + fig.height * f < H:
                # erst tiefer setzen (Kopf höchstens bis 60 % der Bildhöhe), dann vergrößern
                y0_f = min(H - fig.height * f, (0.6 - ky) * H + y0_f)
                if y0_f + fig.height * f < H:
                    f = (H - y0_f) / fig.height
            neu = (max(1, int(fig.width * f)), max(1, int(fig.height * f)))
            fig = fig.resize(neu, Image.LANCZOS)
            gesicht = tuple(int(v * f) for v in gesicht)
            y0 = int(y0_f)
        else:
            # Größe: Figurhöhe als Anteil der Bildhöhe (inkl. Anschnitt unten)
            ziel_h = int(H * float(p.get("hoehe", 0.95)) / max(0.3, 1 - anschnitt))
            f = ziel_h / fig.height
            fig = fig.resize((max(1, int(fig.width * f)), max(1, ziel_h)), Image.LANCZOS)
            if gesicht:
                gesicht = tuple(int(v * f) for v in gesicht)
            y0 = int(H - fig.height * (1 - anschnitt))
            if not unten_offen and p.get("steht", False):
                y0 = int(H * 0.97 - fig.height)
        seite = p.get("seite", "links" if i == 0 else "rechts")
        mx = p.get("mitte_x")
        if mx is None:
            mx = {"links": 0.27, "mitte": 0.5, "rechts": 0.73}.get(seite, 0.27)
        # Mitte nach dem Gesicht ausrichten, wenn bekannt (sonst nach der Figur)
        x0 = int(mx * W - ((gesicht[0] + gesicht[2]) / 2 if gesicht else fig.width / 2))
        # Seitlich abgeschnittenes Foto: die gerade Kante muss aus dem Bild hinausragen
        links_offen, rechts_offen = offen["links"], offen["rechts"]
        if rechts_offen and not links_offen and x0 + fig.width < W:
            x0 = W - fig.width
        elif links_offen and not rechts_offen and x0 > 0:
            x0 = 0
        elif links_offen and rechts_offen and (x0 > 0 or x0 + fig.width < W):
            bericht["warnungen"].append(f"Foto von {p.get('id')} ist an beiden Seiten abgeschnitten – Kante sichtbar")
        fig = angleichen(fig, grund, float(spec.get("licht_angleichen", 0.25)))

        # Schatten, Rand und Figur auf eine eigene Ebene – Teile außerhalb des Bildes fallen weg
        ebene = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        if p.get("schatten", True):
            s = schatten(fig, W)
            ebene.paste(s, (x0 + int(W * 0.012), y0 + int(H * 0.012)), s)
        rand = kontur(fig, int(p.get("rand", 3) * W / 1280), p.get("randfarbe", "#ffffff"))
        oben = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        if rand is not None:
            oben.paste(rand, (x0, y0), rand)
        oben.paste(fig, (x0, y0), fig)
        ebene = Image.alpha_composite(ebene, oben)
        leinwand = Image.alpha_composite(leinwand, ebene)
        if ebenen:
            ebene.save(os.path.join(ebenen, f"person-{p.get('id', i)}.png"))

        box = [max(0, x0) / W, max(0, y0) / H, min(W, x0 + fig.width) / W, min(H, y0 + fig.height) / H]
        eintrag = {"box": [round(v, 4) for v in box], "gesicht": gesicht is not None}
        if gesicht:
            kb = [(x0 + gesicht[0]) / W, (y0 + gesicht[1]) / H, (x0 + gesicht[2]) / W, (y0 + gesicht[3]) / H]
        else:
            # ohne erkanntes Gesicht: oberes Fünftel der Figur gilt als Kopf
            kb = [box[0] + (box[2] - box[0]) * 0.25, box[1], box[2] - (box[2] - box[0]) * 0.25, box[1] + (box[3] - box[1]) * 0.22]
            if p.get("freistellen", True) and p.get("art", "foto") == "foto":
                bericht["warnungen"].append(f"Gesicht von {p.get('id')} nicht erkannt – Kopf geschätzt")
        eintrag["kopf_box"] = [round(max(0.0, min(1.0, v)), 4) for v in kb]
        if kb[0] < 0 or kb[2] > 1 or kb[1] < 0:
            bericht["warnungen"].append(f"Gesicht von {p.get('id')} angeschnitten")
        bericht["figuren"][str(p.get("id", i))] = eintrag

    leinwand = objekte_setzen(leinwand, spec.get("objekte") or [], bericht, ebenen)
    bild = look(leinwand.convert("RGB"), spec)
    bild.save(ausgabe)
    with open(bericht_pfad, "w", encoding="utf-8") as fh:
        json.dump(bericht, fh, ensure_ascii=False, indent=1)
    return bericht


if __name__ == "__main__":
    spec_pfad, ausgabe, bericht_pfad = sys.argv[1:4]
    with open(spec_pfad, encoding="utf-8") as fh:
        spec = json.load(fh)
    try:
        baue(spec, ausgabe, bericht_pfad)
        print("CS_OK", ausgabe)
    except Exception as err:  # für die App lesbar zurückgeben
        import traceback

        with open(bericht_pfad, "w", encoding="utf-8") as fh:
            json.dump({"fehler": str(err), "spur": traceback.format_exc()}, fh, ensure_ascii=False, indent=1)
        print("CS_FEHLER", err)
        sys.exit(1)
