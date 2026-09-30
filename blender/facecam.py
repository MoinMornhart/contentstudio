"""Schnitt (ROADMAP 6.8): Facecam im Stream finden – für Shorts im Hochformat (Facecam oben, Gameplay unten).

    python facecam.py <video> <dauer> <ffmpeg>

Personenerkennung (rembg u2net_human_seg) auf 8 Standbildern über das ganze Video. Minecraft-Figuren im Gameplay
bewegen sich, die Person in der Facecam bleibt an derselben Stelle: gezählt wird nur, was in mindestens 6 von 8 Bildern
an derselben Stelle als Person erkannt wird. Ausgabe: „CS_FACECAM x0 y0 x1 y1“ (Anteile 0–1) oder „CS_FACECAM -“.
"""
import subprocess
import sys

import cv2

# OpenCV neben onnxruntime (rembg) im selben Prozess: ohne diese Einstellung zufällig „Unknown C++ exception“
cv2.ocl.setUseOpenCL(False)
cv2.setNumThreads(1)
import numpy as np
from PIL import Image
from rembg import new_session, remove


def bild(ffmpeg, video, sek):
    roh = subprocess.run(
        [ffmpeg, "-v", "error", "-ss", f"{sek:.2f}", "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", "-f", "image2pipe", "-vcodec", "png", "pipe:1"],
        capture_output=True, check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    ).stdout
    return cv2.imdecode(np.frombuffer(roh, np.uint8), cv2.IMREAD_COLOR)


def main(video, dauer, ffmpeg):
    sitzung = new_session("u2net_human_seg")
    masken = []
    for i in range(8):
        b = bild(ffmpeg, video, dauer * (i + 0.5) / 8)
        if b is None:
            continue
        m = np.array(remove(Image.fromarray(cv2.cvtColor(b, cv2.COLOR_BGR2RGB)), session=sitzung, only_mask=True)) > 128
        masken.append(m)
    if len(masken) < 4:
        print("CS_FACECAM -")
        return
    haeufig = np.mean(masken, axis=0) >= 0.75
    anzahl, beschr, werte, _ = cv2.connectedComponentsWithStats(haeufig.astype(np.uint8), 8)
    if anzahl <= 1:
        print("CS_FACECAM -")
        return
    groesste = 1 + int(np.argmax(werte[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, flaeche = werte[groesste]
    H, W = haeufig.shape
    # zu klein (Rauschen) oder zu groß (Vollbild-Kamera statt Einblendung): keine Facecam
    if flaeche < 0.01 * W * H or w * h > 0.45 * W * H:
        print("CS_FACECAM -")
        return
    # Kopf und Schultern mit etwas Rand, damit die Einblendung nicht angeschnitten wirkt
    rx, ry = int(w * 0.25), int(h * 0.2)
    x0, y0, x1, y1 = max(0, x - rx), max(0, y - ry), min(W, x + w + rx), min(H, y + h + ry)
    print("CS_FACECAM", round(x0 / W, 4), round(y0 / H, 4), round(x1 / W, 4), round(y1 / H, 4))


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]), sys.argv[3])
