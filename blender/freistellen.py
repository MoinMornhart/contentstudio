"""Spiele-Vorlage: die Person aus einem fremden Thumbnail entfernen und den Hintergrund auffüllen.

Läuft in der eigenen Python-Umgebung (uv, rembg + OpenCV, CPU):
    python freistellen.py <vorlage.jpg> <ausgabe-ordner> [x0,y0,x1,y1 …]
Weitere Rechtecke (Bildkoordinaten 0–1) werden mit entfernt, z. B. ein Gegenstand, den die Person hält.
Schreibt hintergrund.png (Person entfernt, Lücke aufgefüllt), maske.png und person.json mit der Lage der Person
(Bildkoordinaten 0–1, oben links = 0,0): box, kopf (geschätzte Kopfmitte), hoehe.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove


# LaMa (Apache-2.0, Carve/LaMa-ONNX): füllt die Lücke mit echtem Hintergrund statt Verschmieren; CPU reicht
LAMA = os.environ.get("CS_LAMA") or os.path.join(os.environ.get("LOCALAPPDATA", ""), "ContentStudio", "py", "modelle", "lama_fp32.onnx")


def lama(arr, maske, groesse=512):
    """Füllt `maske` (255 = Loch) in `arr` (BGR) mit LaMa; arbeitet auf 512×512 und setzt nur das Loch zurück ins Bild."""
    try:
        import onnxruntime as ort

        h, w = arr.shape[:2]
        sitzung = ort.InferenceSession(LAMA, providers=["CPUExecutionProvider"])
        bild = cv2.resize(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB), (groesse, groesse), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        m = (cv2.resize(maske, (groesse, groesse), interpolation=cv2.INTER_NEAREST) > 127).astype(np.float32)
        aus = sitzung.run(None, {"image": bild.transpose(2, 0, 1)[None], "mask": m[None, None]})[0][0].transpose(1, 2, 0)
        if aus.max() <= 1.5:
            aus = aus * 255
        aus = cv2.cvtColor(np.clip(aus, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        return cv2.resize(aus, (w, h), interpolation=cv2.INTER_CUBIC)
    except Exception as fehler:  # Modell kaputt oder zu wenig Speicher: Rückfall auf OpenCV
        print("CS_LAMA_FEHLER", fehler)
        return None


def main(vorlage, ordner, dazu=(), personen=1, titel=()):
    os.makedirs(ordner, exist_ok=True)
    bild = Image.open(vorlage).convert("RGB")
    w, h = bild.size
    maske = remove(bild, session=new_session("u2net_human_seg"), only_mask=True)
    m = (np.array(maske) > 110).astype(np.uint8) * 255
    # größte zusammenhängende Fläche = die Person (kleine Flecken weg)
    anzahl, beschriftung, werte, _ = cv2.connectedComponentsWithStats(m, 8)
    alle = m.copy()
    if anzahl > 1:
        groesste = 1 + int(np.argmax(werte[1:, cv2.CC_STAT_AREA]))
        m = np.where(beschriftung == groesste, 255, 0).astype(np.uint8)
        # Mehrere Personen ersetzen (Hauptfigur mit Freunden): alle großen Personenflächen entfernen, nicht nur die größte
        gross = [i for i in range(1, anzahl) if werte[i, cv2.CC_STAT_AREA] >= 0.12 * werte[groesste, cv2.CC_STAT_AREA]]
        alle = np.where(np.isin(beschriftung, gross), 255, 0).astype(np.uint8) if personen > 1 else m
    ys, xs = np.nonzero(m)
    if not len(xs):
        raise SystemExit("Keine Person gefunden")
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    # Kopf: Gesichtserkennung (OpenCV), größtes Gesicht innerhalb der Person; sonst oberer Teil der Person
    gesichter = []
    try:  # YuNet (OpenCV 5) bzw. Haar-Kaskade (OpenCV 4), gemeinsam mit dem Foto-Compositing
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "bild"))
        from komposit import gesicht_box

        g = gesicht_box(bild.convert("RGBA").crop((int(x0), int(y0), int(x1) + 1, int(y1) + 1)))
        if g:
            gesichter = [(int(x0) + g[0], int(y0) + g[1], g[2] - g[0], g[3] - g[1])]
    except Exception:
        gesichter = []
    if len(gesichter):
        gx, gy, gw, gh = max(gesichter, key=lambda g: g[2] * g[3])
        kopf = [float((gx + gw / 2) / w), float((gy + gh / 2) / h)]
        kopf_hoehe = float(gh * 1.5 / h)  # Kopf mit Haaren/Kappe etwas größer als das Gesicht
    else:
        kopf_bis = y0 + int((y1 - y0) * 0.3)
        kx = xs[ys < kopf_bis]
        kopf = [float((kx.min() + kx.max()) / 2 / w) if len(kx) else float((x0 + x1) / 2 / w), float((y0 + kopf_bis) / 2 / h)]
        kopf_hoehe = float((kopf_bis - y0) / h)
    # Maske großzügig erweitern (Haare, Ränder, Schatten), dann auffüllen
    groesser = cv2.dilate(alle, np.ones((25, 25), np.uint8), iterations=2)
    for x_0, y_0, x_1, y_1 in dazu:
        # Gegenstände samt Rand (Claudes Kästen sind oft knapp; Reste wie ein Laufende sehen sonst verloren aus)
        rx, ry = 0.04 * (x_1 - x_0) + 0.015, 0.06 * (y_1 - y_0) + 0.02
        groesser[max(0, int((y_0 - ry) * h)):int((y_1 + ry) * h), max(0, int((x_0 - rx) * w)):int((x_1 + rx) * w)] = 255
    arr = cv2.cvtColor(np.array(bild), cv2.COLOR_RGB2BGR)
    # Titel ganz mit entfernen: sonst bleiben halbe Buchstaben im Auffüllbereich, die sich später mit dem
    # wiederhergestellten Titel mischen (zerstückeltes „F“). vorlage_titel.py legt ihn danach vollständig wieder auf.
    loch = groesser.copy()
    if titel:
        from vorlage_titel import maske_farbe

        for farbe, box in titel:
            schrift, _ = maske_farbe(arr, box, farbe)
            # samt Schlagschatten (liegt einige Pixel versetzt neben der Schrift)
            loch = np.maximum(loch, cv2.dilate((schrift > 0.2).astype(np.uint8) * 255, np.ones((17, 17), np.uint8)))
    gefuellt = lama(arr, loch) if os.path.exists(LAMA) else None
    if gefuellt is None:
        # Rückfall ohne Modell: OpenCV füllt weich (verwaschen, aber immer verfügbar)
        klein = cv2.resize(arr, (w // 2, h // 2))
        mk = cv2.resize(loch, (w // 2, h // 2), interpolation=cv2.INTER_NEAREST)
        gefuellt = cv2.inpaint(klein, mk, 21, cv2.INPAINT_TELEA)
        gefuellt = cv2.resize(gefuellt, (w, h))
        gefuellt = cv2.GaussianBlur(gefuellt, (0, 0), 3)
    rand = cv2.GaussianBlur(loch.astype(np.float32) / 255, (0, 0), 6)[..., None]
    ergebnis = (arr * (1 - rand) + gefuellt * rand).astype(np.uint8)
    cv2.imwrite(os.path.join(ordner, "hintergrund.png"), ergebnis)
    cv2.imwrite(os.path.join(ordner, "maske.png"), groesser)
    info = {"box": [float(x0 / w), float(y0 / h), float(x1 / w), float(y1 / h)], "kopf": kopf, "kopf_hoehe": kopf_hoehe, "hoehe": float((y1 - y0) / h), "breite": w, "hoehe_px": h}
    with open(os.path.join(ordner, "person.json"), "w", encoding="utf-8") as fh:
        json.dump(info, fh, indent=1)
    print("CS_PERSON", json.dumps(info))


if __name__ == "__main__":
    personen = next((int(a.split("=")[1]) for a in sys.argv[3:] if a.startswith("--personen=")), 1)
    titel = [(a[len("--titel="):].split(":")[0], [float(z) for z in a.split(":")[1].split(",")]) for a in sys.argv[3:] if a.startswith("--titel=")]
    main(sys.argv[1], sys.argv[2], [tuple(float(z) for z in a.split(",")) for a in sys.argv[3:] if not a.startswith("--")], personen, titel)
