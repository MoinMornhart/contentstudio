"""Schnitt (ROADMAP 6.3): Transkript lokal mit faster-whisper – kostenlos, ohne Cloud.

    python transkript.py <video> <abschnitte.jsonl> <modell> <geraet> <genauigkeit> <ffmpeg> <dauer> [--modelle=<ordner>] [--sprache=de|en|…|auto] [--begriffe=<wörter>]

- Wortgenaue Zeiten (word_timestamps) für den Rohschnitt.
- Füllwörter („ähm“, „um“) sollen im Text bleiben (Hinweis über initial_prompt), damit der Rohschnitt sie findet.
- Sprache aus dem Konto (oder automatisch), Fachbegriffe des Kanals (Spiele, Richtungen) als hotwords.
- Der Ton kommt in 10-Minuten-Stücken über FFmpeg (kein PyAV nötig). Jeder fertige Abschnitt wird sofort als JSON-Zeile
  angehängt; gibt es die Datei schon, geht es ab dem Ende des letzten Abschnitts weiter – so übersteht ein Stunden-Stream
  Pausen und Neustarts.
- Fortschritt als „CS_FORTSCHRITT <sekunde>“, am Ende „CS_FERTIG <dauer> <rechenzeit>“.
"""
import json
import os
import subprocess
import sys
import time

import numpy as np

# Füllwörter je Sprache, damit Whisper sie nicht glättet
HINWEISE = {"de": "Ähm, also, äh, ja, genau.", "en": "Um, so, uh, yeah, like, right.", "es": "Eh, bueno, este, o sea.", "fr": "Euh, bon, alors, voilà."}


def main(video, ziel, modell, geraet, genauigkeit, ffmpeg, dauer, modelle=None, sprache="de", begriffe=""):
    from faster_whisper import WhisperModel

    start = 0.0
    if os.path.exists(ziel):
        with open(ziel, encoding="utf-8") as fh:
            zeilen = [json.loads(z) for z in fh if z.strip()]
        if zeilen:
            start = zeilen[-1]["ende"]
    beginn = time.time()
    try:
        m = WhisperModel(modell, device=geraet, compute_type=genauigkeit, download_root=modelle)
    except Exception as fehler:  # z. B. CUDA-Bibliotheken fehlen: auf der CPU weiter
        if geraet == "cpu":
            raise
        print("CS_RUECKFALL", fehler, flush=True)
        m = WhisperModel(modell, device="cpu", compute_type="int8", download_root=modelle)
    # Ton in 10-Minuten-Stücken über FFmpeg lesen (16 kHz mono): wenig Speicher auch bei Stunden-Streams, jedes Stück
    # ist ein Fortsetzpunkt. Gestartet wird am Ende des letzten gespeicherten Abschnitts.
    stueck = 600.0
    with open(ziel, "a", encoding="utf-8") as fh:
        while start < dauer - 0.5:
            roh = subprocess.run(
                [ffmpeg, "-v", "error", "-ss", f"{start:.3f}", "-t", f"{stueck:.3f}", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"],
                capture_output=True, check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            ).stdout
            ton = np.frombuffer(roh, dtype=np.int16).astype(np.float32) / 32768.0
            if len(ton) < 1600:
                break
            abschnitte, _ = m.transcribe(
                ton,
                language=None if sprache == "auto" else sprache,
                word_timestamps=True,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 700},
                initial_prompt=HINWEISE.get(sprache),
                hotwords=begriffe or None,
                condition_on_previous_text=False,
            )
            letzter = start
            for a in abschnitte:
                woerter = [{"start": round(start + w.start, 2), "ende": round(start + w.end, 2), "wort": w.word.strip(), "p": round(w.probability, 3)} for w in (a.words or [])]
                fh.write(json.dumps({"start": round(start + a.start, 2), "ende": round(start + a.end, 2), "text": a.text.strip(), "woerter": woerter}, ensure_ascii=False) + "\n")
                fh.flush()
                letzter = start + a.end
                print("CS_FORTSCHRITT", round(letzter, 2), flush=True)
            # nächstes Stück: am Ende des letzten Satzes weiter, damit kein Wort zerschnitten wird
            start = max(letzter, start + stueck - 30) if letzter > start + stueck - 30 else start + stueck
    print("CS_FERTIG", round(dauer, 2), round(time.time() - beginn, 2), flush=True)


if __name__ == "__main__":
    ordner = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--modelle=")), None)
    sprache = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--sprache=")), "de")
    begriffe = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--begriffe=")), "")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0], args[1], args[2], args[3], args[4], args[5], float(args[6]), ordner, sprache, begriffe)
