# Testberichte (ROADMAP M8)

Hier stehen die Berichte der Qualitätsrunde. Bilder mit Minecraft-Inhalten (Texturen, Renders) bleiben lokal auf dem
Testrechner und kommen nie ins Repository; hier steht dann nur die Bewertung in Worten.

| Bericht | Inhalt | Stand |
|---|---|---|
| [ki-wege.md](ki-wege.md) | Jede KI-Funktion mit jedem Weg und ohne KI (8.3) | ohne KI und Test-KI fertig; echte Wege warten auf Zugang |
| [freiform.md](freiform.md) | Freiform-Tests je Richtung (8.1): Ablauf und Bewertung | Lauf vorbereitet, wartet auf einen KI-Weg |
| [hardware-cpu.md](hardware-cpu.md) | Leistungsbericht nur mit CPU und Software-OpenGL (8.4) | fertig |
| hardware-gpu.md | Leistungsbericht mit Grafikkarte (8.4) | wartet auf einen Lauf auf einem Rechner mit GPU |

## So entsteht ein Leistungsbericht

In ContentStudio: **Einstellungen → Hardware → Leistungsbericht**. Die App misst Export und Spracherkennung, übernimmt
die Blender-Messungen aus dem Hardware-Test und öffnet eine Markdown-Datei zum Weitergeben. Es wird nichts
nachinstalliert und nichts hochgeladen.

## So läuft ein Freiform-Test

Siehe [freiform.md](freiform.md): Aufgaben in `tests/freiform/aufgaben.json`, Lauf mit `tests/echt/freiform.test.ts`
und einem KI-Weg, danach Bewertung jedes Ergebnisses als gut, mittel oder schwach.
