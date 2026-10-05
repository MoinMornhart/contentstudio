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

# OpenCV neben onnxruntime (rembg) im selben Prozess: ohne diese Einstellung zufällig „Unknown C++ exception“
cv2.ocl.setUseOpenCL(False)
cv2.setNumThreads(1)
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


def lama_schrittweise(arr, loch, runden=3):
    """Große Löcher von außen nach innen füllen: je Runde nur einen Ring am Rand übernehmen, die nächste Runde sieht
    ihn schon als Hintergrund. In einem Schritt erfand LaMa in der Mitte großer Flächen Geisterformen der alten
    Person (Red Dead 01.10.: verschwommene Hand links neben der Figur)."""
    h, w = arr.shape[:2]
    if (loch > 127).sum() < 0.12 * h * w:
        return lama(arr, loch)
    arbeit, rest = arr.copy(), (loch > 127).astype(np.uint8) * 255
    dicke = max(9, int(np.sqrt((rest > 0).sum()) / (2 * runden + 2))) | 1
    for _ in range(runden):
        innen = cv2.erode(rest, np.ones((dicke, dicke), np.uint8))
        if not innen.any():
            break
        gefuellt = lama(arbeit, rest)
        if gefuellt is None:
            return None
        ring = (rest > 0) & (innen == 0)
        arbeit[ring] = gefuellt[ring]
        rest = innen
    gefuellt = lama(arbeit, rest) if rest.any() else arbeit
    if gefuellt is None:
        return None
    arbeit[rest > 0] = gefuellt[rest > 0]
    return arbeit


def _kopf_in(bild, m, w, h):
    """Kopfmitte und -höhe einer Personenmaske: größtes Gesicht darin (OpenCV), sonst oberer Teil der Person."""
    ys, xs = np.nonzero(m)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    gesichter = []
    if hasattr(cv2, "CascadeClassifier"):
        grau = cv2.cvtColor(np.array(bild), cv2.COLOR_RGB2GRAY)
        kaskade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
        gesichter = [g for g in kaskade.detectMultiScale(grau, 1.1, 5, minSize=(h // 14, h // 14)) if m[g[1] + g[3] // 2, g[0] + g[2] // 2] > 0]
    if len(gesichter):
        gx, gy, gw, gh = max(gesichter, key=lambda g: g[2] * g[3])
        return [float((gx + gw / 2) / w), float((gy + gh / 2) / h)], float(gh * 1.5 / h)
    kopf_bis = y0 + int((y1 - y0) * 0.3)
    kx = xs[ys < kopf_bis]
    return [float((kx.min() + kx.max()) / 2 / w) if len(kx) else float((x0 + x1) / 2 / w), float((y0 + kopf_bis) / 2 / h)], float((kopf_bis - y0) / h)


def personen_trennen(bild, boxen):
    """Eine Maske je Person (die Hauptfigur, 29./30.09.: zwei Personen, die sich berühren oder über eine Kette verbunden sind,
    verschmelzen sonst zu einer Fläche). `boxen`: Kästen [x0, y0, x1, y1] (0–1) aus Claudes Analyse. Jedes Pixel der
    Personenmaske gehört zu dem Kasten, in dem es liegt – bei Überlappung zu dem, dessen Mitte am nächsten ist.
    Findet das Personen-Modell in einem Kasten kaum etwas (Spielfiguren, Roboter, Comic), nimmt es das allgemeine
    Objekt-Modell und zuletzt eine Ellipse im Kasten – so bleibt nie eine alte Person stehen."""
    w, h = bild.size
    mensch = (np.array(remove(bild, session=new_session("u2net_human_seg"), only_mask=True)) > 110).astype(np.uint8)
    objekt = None
    yy, xx = np.mgrid[0:h, 0:w]
    abstand = np.full((h, w), np.inf, dtype=np.float32)
    zu = np.full((h, w), -1, dtype=np.int16)
    raster = []
    for i, (x0, y0, x1, y1) in enumerate(boxen):
        rx, ry = 0.06 * (x1 - x0), 0.04 * (y1 - y0)
        a, b = max(0, int((x0 - rx) * w)), min(w, int((x1 + rx) * w) + 1)
        c, d = max(0, int((y0 - ry) * h)), min(h, int((y1 + ry) * h) + 1)
        raster.append((a, b, c, d))
        cx, cy, sx, sy = (a + b) / 2, (c + d) / 2, max(1, b - a), max(1, d - c)
        dist = ((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2
        drin = np.zeros((h, w), bool)
        drin[c:d, a:b] = True
        besser = drin & (dist < abstand)
        abstand[besser] = dist[besser]
        zu[besser] = i
    masken = []
    sam = None
    for i, (a, b, c, d) in enumerate(raster):
        # SAM (Segment Anything) schneidet das Objekt im Kasten aus – egal ob Mensch, Spielfigur oder Comic; dazu die
        # Personenmaske (Haare, feine Ränder). Löcher (Kette, Gürtel, Lücken zwischen Armen und Körper) werden geschlossen.
        s = None
        for versuch in range(2):  # bei knappem Speicher („bad allocation“) einmal aufräumen und neu versuchen
            try:
                if sam is None:
                    sam = new_session("sam")
                s = np.array(remove(bild, session=sam, only_mask=True, sam_prompt=[{"type": "rectangle", "data": [a, c, b, d], "label": 1}])) > 127
                break
            except Exception as fehler:  # ohne SAM-Modell (offline) oder ohne Speicher: nur die Personenmaske
                print("CS_WARNUNG SAM:", fehler)
                import gc
                import time

                sam = None
                gc.collect()
                time.sleep(3)
        if s is None:
            s = np.zeros((h, w), bool)
        # SAM gilt im ganzen (erweiterten) Kasten – auch dort, wo er einen anderen überlappt (ausgestreckte Hand);
        # die Personenmaske nur in dem Teil, der zu diesem Kasten gehört
        drin = np.zeros((h, w), bool)
        drin[c:d, a:b] = True
        m = ((drin & s) | ((zu == i) & (mensch > 0))).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        flaeche = max(1, (b - a) * (d - c))
        if m.sum() / 255 < 0.12 * flaeche:
            if objekt is None:
                objekt = (np.array(remove(bild, session=new_session("u2net"), only_mask=True)) > 110).astype(np.uint8)
            m = ((zu == i) & (objekt > 0)).astype(np.uint8) * 255
        if m.sum() / 255 < 0.12 * flaeche:
            m = np.zeros((h, w), np.uint8)
            cv2.ellipse(m, ((a + b) // 2, (c + d) // 2), (max(1, (b - a) // 2), max(1, (d - c) // 2)), 0, 0, 360, 255, -1)
            m[zu != i] = 0
            print("CS_WARNUNG Person", i, "nur als Ellipse im Kasten gefunden")
        # nur die größte Fläche im Kasten (Reste anderer Dinge weg), aber nahe Teile (Arm, Bein) behalten
        try:
            anzahl, beschr, werte, _ = cv2.connectedComponentsWithStats(np.ascontiguousarray(m), 8)
        except cv2.error:  # selten wirft OpenCV hier ohne Grund – dann alle Teile behalten
            anzahl = 0
        if anzahl > 2:
            groesste = 1 + int(np.argmax(werte[1:, cv2.CC_STAT_AREA]))
            # Kleine Teile direkt an der Person bleiben (Hand mit Taschenlampe, Ärmel, Patronengurt) – mit der alten
            # 5-%-Grenze blieben sie als Rest im Bild stehen (Spiele-Vorlage-Tests 8, 10, 14)
            nah = cv2.dilate((beschr == groesste).astype(np.uint8), np.ones((max(9, h // 25),) * 2, np.uint8)) > 0
            behalten = [j for j in range(1, anzahl) if j == groesste
                        or werte[j, cv2.CC_STAT_AREA] >= 0.05 * werte[groesste, cv2.CC_STAT_AREA]
                        or (werte[j, cv2.CC_STAT_AREA] >= 0.002 * werte[groesste, cv2.CC_STAT_AREA] and nah[beschr == j].any())]
            m = np.where(np.isin(beschr, behalten), 255, 0).astype(np.uint8)
        masken.append(m)
    return masken


def main(vorlage, ordner, dazu=(), personen=1, titel=(), boxen=()):
    os.makedirs(ordner, exist_ok=True)
    bild = Image.open(vorlage).convert("RGB")
    w, h = bild.size
    if boxen:
        return main_boxen(bild, vorlage, ordner, dazu, titel, boxen)
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
    info = {"box": [float(x0 / w), float(y0 / h), float(x1 / w), float(y1 / h)], "kopf": kopf, "kopf_hoehe": kopf_hoehe, "hoehe": float((y1 - y0) / h), "breite": w, "hoehe_px": h}
    auffuellen(bild, ordner, alle, dazu, titel, info)


def main_boxen(bild, vorlage, ordner, dazu, titel, boxen):
    """Mehrere oder schwierige Personen: je Person eine eigene Maske (maske-0.png, maske-1.png …) und Lage."""
    w, h = bild.size
    masken = personen_trennen(bild, boxen)
    liste = []
    for i, m in enumerate(masken):
        ys, xs = np.nonzero(m)
        if not len(xs):
            x0, y0, x1, y1 = (int(boxen[i][0] * w), int(boxen[i][1] * h), int(boxen[i][2] * w), int(boxen[i][3] * h))
        else:
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        kopf, kopf_hoehe = _kopf_in(bild, m, w, h) if len(xs) else ([(boxen[i][0] + boxen[i][2]) / 2, boxen[i][1] + 0.1], 0.2)
        cv2.imwrite(os.path.join(ordner, f"maske-{i}.png"), cv2.dilate(m, np.ones((9, 9), np.uint8)))
        liste.append({"box": [float(x0 / w), float(y0 / h), float(x1 / w), float(y1 / h)], "kopf": kopf, "kopf_hoehe": kopf_hoehe,
                      "hoehe": float((y1 - y0) / h), "unten_angeschnitten": bool(y1 >= h - 3), "maske": f"maske-{i}.png"})
    alle = np.max(np.stack(masken), axis=0) if masken else np.zeros((h, w), np.uint8)
    info = {**liste[0], "breite": w, "hoehe_px": h, "personen": liste}
    auffuellen(bild, ordner, alle, dazu, titel, info)


def auffuellen(bild, ordner, alle, dazu, titel, info):
    w, h = bild.size
    # Maske großzügig erweitern (Haare, Ränder, Schatten), dann auffüllen
    k = max(25, min(w, h) // 30)  # mit der Bildgröße wachsen: bei 1080p ~36 px statt fest 25
    # Lücken schließen und Löcher füllen: Gewehr, Gurt oder Hand zwischen den Armen gehören für SAM oft nicht zur
    # Person – die stehen gebliebenen Originalpixel malt LaMa dann zu neuen Schatten der Person aus (Red Dead 01.10.)
    nah = max(31, min(w, h) // 12) | 1
    alle = cv2.morphologyEx(alle, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (nah, nah)))
    aussen = np.zeros((h + 2, w + 2), np.uint8)
    flut = alle.copy()
    for ecke in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if flut[ecke[1], ecke[0]] == 0:
            cv2.floodFill(flut, aussen, ecke, 255)
    alle = np.maximum(alle, cv2.bitwise_not(flut))  # was von außen nicht erreichbar ist, ist ein Loch
    groesser = cv2.dilate(alle, np.ones((k, k), np.uint8), iterations=2)
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
    gefuellt = lama_schrittweise(arr, loch) if os.path.exists(LAMA) else None
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
    with open(os.path.join(ordner, "person.json"), "w", encoding="utf-8") as fh:
        json.dump(info, fh, indent=1)
    print("CS_PERSON", json.dumps(info))


if __name__ == "__main__":
    personen = next((int(a.split("=")[1]) for a in sys.argv[3:] if a.startswith("--personen=")), 1)
    titel = [(a[len("--titel="):].split(":")[0], [float(z) for z in a.split(":")[1].split(",")]) for a in sys.argv[3:] if a.startswith("--titel=")]
    # --person=x0,y0,x1,y1 je zu ersetzender Person (die Hauptfigur zuerst, dann die Freunde): eigene Maske je Person
    boxen = [[float(z) for z in a[len("--person="):].split(",")] for a in sys.argv[3:] if a.startswith("--person=")]
    main(sys.argv[1], sys.argv[2], [tuple(float(z) for z in a.split(",")) for a in sys.argv[3:] if not a.startswith("--")], personen, titel, boxen)
