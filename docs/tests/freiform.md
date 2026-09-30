# Freiform-Tests je Richtung (ROADMAP 8.1)

Ziel: ContentStudio soll mit ungewöhnlichen Wünschen in Worten klarkommen, nicht nur mit den Beispielen aus der
Entwicklung. Je Inhaltsrichtung gibt es 20 Thumbnail-Beschreibungen und 20 Schnittwünsche
([tests/freiform/aufgaben.json](../../tests/freiform/aufgaben.json)). Erfüllt ist 8.1, wenn mindestens fünf Richtungen
überwiegend „gut“ sind. Fehler werden behoben, nicht gestrichen: Eine Aufgabe, die scheitert, bleibt in der Liste.

## Richtungen und neutrale Testdaten

| Richtung | Darstellung | Sprache | Testvideo |
|---|---|---|---|
| Minecraft-Gaming | Minecraft-Welt mit dem Standardskin „Alex“ aus der Spieldatei | Deutsch | Höhlen-Abenteuer (Sprachausgabe) |
| Vlog | Foto (CC0-Porträt „mann-bart“) | Deutsch | Mein Montag |
| Kochen | Foto (CC0-Porträt „frau-pink“) | Deutsch | Pfannkuchen |
| Bildung/Tech | eigener 3D-Avatar (GLB, im Test gebaut) | Deutsch | Warum ist der Himmel blau? |
| Fitness | Foto (CC0-Porträt „mann-locken“) | Englisch | 10-Minuten-Workout |

Die Testvideos entstehen aus der Windows-Sprachausgabe (mit Pausen, Füllwort und abgebrochenem Satz), das Bild ist ein
wanderndes Motiv. Schnittwünsche, die sich auf das Bild beziehen („wenn der Creeper explodiert“), müssen deshalb über
das Transkript gefunden werden.

## Ablauf

1. KI-Weg wählen und Schlüssel in `%LOCALAPPDATA%\ContentStudio-dev\ki-<weg>.txt` ablegen (nie im Repo).
2. `set CS_KI_WEG=<weg>` und `npx vitest run -c vitest.echt.config.ts tests/echt/freiform.test.ts` (fortsetzbar, eine
   Richtung mit `CS_FREIFORM_NUR=kochen`).
3. Ergebnisse unter `%LOCALAPPDATA%\ContentStudio\test-echt\freiform\<weg>\<richtung>\`: `thumb-NN.png`,
   `wunsch-NN.jpg` (Bilderbogen der Vorschau) und je eine JSON-Datei mit Antwort, Dauer und Tokens.
4. Jedes Ergebnis wird angesehen und bewertet:
   - **gut:** Beschreibung bzw. Wunsch ist erkennbar umgesetzt, nichts Störendes (angeschnittene Gesichter, Text über
     Gesichtern, falsche Stelle im Video).
   - **mittel:** umgesetzt, aber mit sichtbaren Schwächen.
   - **schwach:** nicht oder falsch umgesetzt, oder Fehler.
5. Schwache Ergebnisse werden als Fehler behoben (Prompt, Katalog, Regeln, Code) und die Aufgabe erneut ausgeführt.

## Stand

| Richtung | Thumbnails gut/mittel/schwach | Wünsche gut/mittel/schwach | Weg |
|---|---|---|---|
| Minecraft-Gaming | – | – | – |
| Vlog | – | – | – |
| Kochen | – | – | – |
| Bildung/Tech | – | – | – |
| Fitness (englisch) | – | – | – |

Der Lauf ist vorbereitet und mit dem lokalen Testmodell (llama.cpp, Qwen2.5 0,5B) technisch geprüft. Für eine
aussagekräftige Bewertung braucht es einen starken KI-Weg (API-Schlüssel oder lokales Modell ab etwa 8B); der fehlt auf
dem Entwicklungsrechner noch.
