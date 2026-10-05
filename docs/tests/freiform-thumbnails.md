# Freiform-Lauf Thumbnails (ROADMAP 8.1), 05.10.2026

Alle 100 Thumbnail-Aufgaben aus [tests/freiform/aufgaben.json](../../tests/freiform/aufgaben.json) (5 Richtungen × 20),
KI-Weg `claude-cli` (nur Tests), ContentStudio 0.7.8 plus die Fixes dieses Laufs. Jedes Bild wurde angesehen und streng
nach [freiform.md](freiform.md) bewertet. Die Bilder liegen nur lokal (nie im Repo). Vorlauf: [freiform-pilot.md](freiform-pilot.md).

## Ergebnis

| Richtung | gut | mittel | schwach | Weg |
|---|---|---|---|---|
| Minecraft-Gaming | 16 | 4 | 0 | claude-cli |
| Vlog (Foto) | 17 | 3 | 0 | claude-cli |
| Kochen (Foto) | 17 | 3 | 0 | claude-cli |
| Bildung/Tech (3D-Avatar) | 16 | 4 | 0 | claude-cli |
| Fitness, englisch (Foto) | 17 | 3 | 0 | claude-cli |

**Alle fünf Richtungen sind überwiegend „gut“** – das Thumbnail-Ziel von 8.1 ist erfüllt.

## Was „mittel“ blieb

- **Minecraft:** Ghast über einer Schlucht (Ghast nicht im Bild), Höhle mit leuchtenden Augen (Augen fehlen), Flug mit
  der Elytra durch eine enge Schlucht und Säule über der Leere (Figur zu klein oder zu dunkel).
- **Vlog:** Sushi „hasse es“ (das einzige Testfoto lächelt), Zimmer vorher/nachher (kein geteiltes Foto-Bild),
  „das ehrlichste Video“ (sehr allgemeines Bild).
- **Kochen:** Lasagne in Zeitlupe (Schildkröte statt Lasagne), virale TikTok-Rezepte (TikTok nicht erkennbar), Torte
  wie ein Burger (nur ein Burger).
- **Bildung:** drei Pilotbilder vor der Posen-Regel, ein verdrehter Arm; die Pose „zeigen“ wiederholt sich oft.
- **Fitness:** 12-3-30-Laufband (kein Laufband), Old school vs modern (Gegensatz schwach), ein Pilotbild.

## Behoben in diesem Lauf

| Befund | Fix |
|---|---|
| Porträtfotos mit harten Schnittkanten mitten im Bild (Fitness 4× schwach) | Porträt an den Bildrand, oben und unten bündig, Rest läuft weich aus |
| Orte passten nicht (Tanzsaal für „Bahnhof“) | KI wählt aus den vorhandenen Orten, Suche verlangt die Hälfte der Wörter |
| Arme bei Kamera „gefahr“ aufgebläht | 40 statt 30 mm, mehr Umgebung |
| „Zwei Welten links/rechts“ als eine Szene mit Netherrack-Klotz vor der Kamera | geteiltes Bild ist dann Pflicht |
| Mob als unscharfer Riesenblock vor der Linse, Korrektur wusste nicht warum | Prüfmeldung „zu nah an der Kamera“ und „ragt rechts/oben aus dem Bild“ |
| 3D-Avatar jubelt bei schlechten Nachrichten | Posen-Regel nach Stimmung (Schreck, Nachdenken, Zeigen, Jubel nur bei Erfolg) |

## Offen für später

- Geteilte Bilder („X gegen Y“, vorher/nachher) auch für Foto- und Modell-Thumbnails (Minecraft kann es).
- Mehr Abwechslung bei den Posen des 3D-Avatars.
- Minecraft: Figur in sehr weiten oder dunklen Szenen (Elytra, Leere) größer und heller.
