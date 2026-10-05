# Freiform-Pilot (ROADMAP 8.1), 05.10.2026

Vor dem großen Lauf (5 Richtungen × 20 Thumbnails + 20 Wünsche) ein Pilot mit den ersten 4 Thumbnail-Aufgaben je
Richtung, KI-Weg `claude-cli` (nur Tests, siehe [docs/ki-anbieter.md](../ki-anbieter.md)). Die Bilder liegen nur lokal
unter `%LOCALAPPDATA%\ContentStudio\test-echt\freiform\` (nie im Repo). Bewertung streng nach
[freiform.md](freiform.md): gut / mittel / schwach.

## Runde 1 (ContentStudio 0.7.7)

| Richtung | Aufgabe | Bewertung | Befund |
|---|---|---|---|
| Minecraft | Brücke über Lavameer brennt | mittel | Thema da, aber zur Kamera gestreckter Arm riesig (Kamera „gefahr“, 30 mm) |
| Minecraft | Creeper hinter mir | gut | ahnungslos lächelnd, Lupe auf dem Creeper |
| Minecraft | Diamanten von Lava umgeben | mittel | Figur zu nah, Arm steif und aufgebläht (gleiche Ursache) |
| Minecraft | Haus nachts von Zombies belagert | gut | Nacht, Haus, Laterne, zwei Zombies, Schwert |
| Vlog | allein im leeren Bahnhof | mittel | Ort falsch: Tanzsaal statt Bahnhof („hall“ passte) |
| Vlog | Zug fällt aus, Nacht am Flughafen | mittel | Ort falsch: Industriegelände („terminal“ passte); Symbole tragen das Thema |
| Vlog | Sushi zum ersten Mal, hasse es | mittel | Thema klar, aber lächelndes Testfoto widerspricht |
| Vlog | 24 Stunden mit 10 € | gut | Straße, Geld, Stoppuhr |
| Kochen | Drei-Gänge-Menü in 15 Minuten | gut | Salat, Pasta, Kuchen, „15 MIN!“ |
| Kochen | Kuchen schiefgegangen | gut | brennender Kuchen, Knall, „FAIL!“ |
| Kochen | Profi-Pizza gegen meine | mittel | zwei gleiche Pizzastücke, Gegensatz fehlt |
| Kochen | schärfstes Chili, ich weine | gut | Chili, Feuer, weinendes Gesicht |
| Bildung | Himmel blau in einer Minute | mittel | Regenbogen passt nicht, Figur steif |
| Bildung | zeige auf riesiges Fragezeichen | gut | genau umgesetzt |
| Bildung | wie funktioniert ein Prozessor | mittel | Computer statt Prozessor, Text vage |
| Bildung | größte Lüge über Handy-Akkus | mittel | Thema klar, aber Jubel-Pose statt Schreck |
| Fitness | 100 Liegestütze 30 Tage | schwach | Porträt oben und links gerade abgeschnitten, harte Kanten mitten im Bild |
| Fitness | schlimmste Übung für den Rücken | schwach | gleiche harte Kanten |
| Fitness | Anfänger gegen Profi | schwach | harte Kanten, Gegensatz fehlt |
| Fitness | eine Woche wie ein Olympionike | schwach | harte Kanten |

Summe: 8 gut, 8 mittel, 4 schwach. Die frühere Schwäche „kein Thema erkennbar“ (Kochen) ist mit Orten und Gegenständen
behoben.

### Behoben

- **Abgeschnittene Fotos:** Die Foto-Engine kannte nur links, rechts und unten abgeschnittene Fotos. Jetzt auch oben;
  ein eng zugeschnittenes Porträt sitzt am Bildrand seiner Seite und schließt oben und unten bündig ab, und was dann
  noch im Bild läge, läuft weich aus (Figur, Rand und Schatten).
- **Falsche Orte:** Die KI bekommt die Liste der Orte, für die es Fotos gibt, und nimmt einen davon oder einen
  Farbverlauf. Die Suche nimmt einen Ort nur noch, wenn mindestens die Hälfte der Suchwörter passt.
- **Kamera „gefahr“:** 40 statt 30 mm und etwas mehr Umgebung, damit Arme nicht aufblähen und die Gefahr zu sehen ist.

### Offen (nicht im Code behebbar oder später)

- Mimik: Die Testpersonen haben je nur ein (lächelndes) Foto, der Test-Avatar ein festes Gesicht. Mit mehreren Fotos
  wählt ContentStudio den Ausdruck; für den großen Lauf bleibt das eine Grenze der Testdaten.
- „X gegen Y“ ohne Minecraft: Foto-Thumbnails kennen noch kein geteiltes Bild (Minecraft schon).

## Runde 2 (nach den Fixes, ContentStudio 0.7.8)

Neu erzeugt wurden alle Aufgaben, die nicht „gut“ waren und einen der behobenen Fehler zeigten.

| Richtung | Aufgabe | vorher | jetzt | Befund |
|---|---|---|---|---|
| Minecraft | Brücke über Lavameer brennt | mittel | gut | Panik-Pose, Arm nicht mehr aufgebläht, Feuer auf der Brücke |
| Minecraft | Diamanten von Lava umgeben | mittel | mittel | Arm zur Kamera wirkt weiter steif |
| Vlog | allein im leeren Bahnhof | mittel | gut | echter Güterbahnhof mit Kran statt Tanzsaal |
| Vlog | Zug fällt aus, Flughafen | mittel | gut | kein Flughafen im Katalog → Farbverlauf mit Flugzeug und Schlafgesicht |
| Kochen | Profi-Pizza gegen meine | mittel | gut | Koch mit gekreuzten Schwertern gegen mich |
| Fitness | 100 Liegestütze 30 Tage | schwach | gut | großes Porträt am Rand, keine harten Kanten |
| Fitness | schlimmste Übung für den Rücken | schwach | gut | dito |
| Fitness | Anfänger gegen Profi | schwach | gut | Baby-Gesicht gegen Bizeps |
| Fitness | eine Woche wie ein Olympionike | schwach | mittel | langer Text, kleine Kante links |

**Pilot gesamt: 14 gut, 6 mittel, 0 schwach** (Runde 1: 8 / 8 / 4). Schwächste Richtung ist Bildung (1 gut,
3 mittel): Der Test-Avatar hat ein festes Gesicht, und die KI wählte einmal eine Jubel-Pose für eine schlechte
Nachricht. Das ist der nächste Ansatzpunkt im großen Lauf.
