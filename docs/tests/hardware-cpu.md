# Leistungsbericht: nur CPU, Software-OpenGL (ROADMAP 8.4)

Entwicklungsrechner: virtuelle Maschine ohne Grafikkarte. Erzeugt mit dem Leistungsbericht der App (Einstellungen →
Hardware → Leistungsbericht) und ergänzt um Messungen aus den echten Tests. Stand 30.09.2026, ContentStudio 0.7.

## Gerät

- Windows 10.0.26200
- CPU: QEMU Virtual CPU version 2.5+ (6 Threads), RAM 14.6 GB
- GPU: Microsoft Basic Display Adapter (virtuell)

## Entscheidungen aus dem Hardware-Test

- Blender: 4.5.9 (Software-OpenGL), CYCLES/CPU, 1920×1080, 32 Samples, ≈ 100 s je Endbild
- Encoder: libx264
- Whisper: small (cpu, int8)
- ONNX: cpu

## Messungen

| Aufgabe | Sekunden | Ergebnis |
|---|---|---|
| Export 20 s Full HD (libx264) | 8.2 | 2.4× Echtzeit |
| Spracherkennung 20 s (Whisper small, cpu) | 20.2 | 1× Videolänge, 4 Abschnitte |
| Blender 5.2.2 WORKBENCH/CPU | – | crash |
| Blender 5.2.2 EEVEE/CPU | – | crash |
| Blender 5.2.2 CYCLES/CPU | – | illegal-instruction |
| Blender 4.5.9 WORKBENCH/CPU | – | crash |
| Blender 4.5.9 EEVEE/CPU | – | crash |
| Blender 4.5.9 CYCLES/CPU | 3.1 | Testbild gerendert |
| Blender 4.5.9 WORKBENCH/CPU | 3.8 | Testbild gerendert |
| Blender 4.5.9 EEVEE/CPU | 32.2 | Testbild gerendert |

## Aus den echten Tests

| Aufgabe | Dauer | Quelle |
|---|---|---|
| Foto-Thumbnail ohne KI (Freistellen, Licht, Rand, Export) | 8–12 s, im Mittel 9,3 s (20 Läufe) | `tests/echt/freiform.test.ts`, Weg „ohne“ |
| Schnitt: Import, Transkript, Rohschnitt, 4 Exporte, Spur-Sync (2 Testvideos à ~45 s) | 125 s gesamt | `tests/echt/schnitt.test.ts` |

## Einordnung

- Blender 5.2 startet auf dieser virtuellen CPU nicht (fehlende Befehlssätze); der Hardware-Test fällt richtig auf
  Blender 4.5 LTS mit Software-OpenGL zurück. Ein Minecraft- oder 3D-Endbild braucht hier etwa 100 s.
- Die Spracherkennung (Whisper small) läuft etwa in Echtzeit; eine Stunde Video braucht also etwa eine Stunde.
- Der Export läuft mit dem Prozessor gut doppelt so schnell wie Echtzeit.
- Während der Qualitätsrunde fiel auf: OpenCV brach nach dem Freistellen im selben Prozess zufällig ab (etwa jeder vierte
  Lauf, auch ohne Last). Behoben ab 0.7.1 (OpenCL aus, ein Thread): 20 von 20 statt 9 von 20.
