# Leistungsbericht: integrierte Intel-Grafik (ROADMAP 8.4)

Laptop mit Intel Core Ultra 9 und integrierter Intel-Grafik, ohne eigene Grafikkarte. Hardware-Test und Leistungsbericht
wie in der App (Einstellungen → Hardware), ausgeführt mit `tests/echt/hardware.test.ts`, ContentStudio 0.7.10, 05.10.2026.

## Gerät

- Windows 10.0.26300
- CPU: Intel(R) Core(TM) Ultra 9 386H (16 Threads), RAM 31.5 GB
- GPU: Intel(R) Graphics

## Entscheidungen aus dem Hardware-Test

- Blender: 5.2.2, CYCLES/CPU, 1920×1080, 64 Samples, ≈ 71 s je Endbild
- Encoder: h264_qsv
- Whisper: medium (cpu, int8)
- ONNX: directml

## Messungen

| Aufgabe | Sekunden | Ergebnis |
|---|---|---|
| Export 20 s Full HD (h264_qsv) | 2.9 | 6.9× Echtzeit |
| Export 20 s Full HD (libx264) | 4.4 | 4.5× Echtzeit |
| Spracherkennung 20 s (Whisper medium, cpu) | 33.1 | 1.7× Videolänge, 3 Abschnitte |
| Blender 5.2.2 WORKBENCH/CPU | 0.9 | Testbild gerendert |
| Blender 5.2.2 EEVEE/CPU | 2.2 | Testbild gerendert |
| Blender 5.2.2 CYCLES/ONEAPI | 5.1 | Testbild gerendert |
| Blender 5.2.2 CYCLES/CPU | 1.1 | Testbild gerendert |

## Einordnung

- Die integrierte GPU wird genutzt, wo sie hilft: Video-Export über Intel Quick Sync (h264_qsv, 6,9× Echtzeit statt 4,5×
  mit libx264) und Freistellen über DirectML.
- Blender Cycles läuft über oneAPI, ist auf der integrierten Grafik aber langsamer als auf der CPU (5,1 s gegen 1,1 s
  für das Testbild) – der Hardware-Test wählt richtig die CPU. Ein Endbild in Full HD braucht etwa 71 s.
- Die Spracherkennung wählt Whisper medium; auf der CPU braucht sie 1,7× die Videolänge (eine Stunde Video ≈ 1,7 Stunden).
  Für lange Videos wäre small schneller; das wird in M9 geprüft.
- Ein Lauf mit eigener Grafikkarte (NVIDIA/AMD) steht noch aus: dafür auf einem solchen PC Einstellungen → Hardware →
  Leistungsbericht starten.
