# Vergleich mit den Vorbildern (ROADMAP 8.2), 05.10.2026

Die Minecraft-Ergebnisse des Freiform-Laufs ([freiform-thumbnails.md](freiform-thumbnails.md)) neben den 16 Vorbildern
des mitgelieferten Beispiel-Stilbuchs „Minecraft“ (GommeHD, BastiGHG, Paluten, Castcrafter, TriDan). Die Vorbilder
wurden wie beim Vorbild-Link der App nur als öffentliches Thumbnail geladen und liegen nur lokal; im Repo stehen weder
sie noch unsere Renders. Für die anderen Richtungen gibt es kein mitgeliefertes Stilbuch – dort vergleicht jeder
Creator mit seinen eigenen Vorbildern.

## Was die Vorbilder anders machen (strenge Bewertung)

| Merkmal | Vorbilder | ContentStudio vorher | Bewertung |
|---|---|---|---|
| Hintergrund | detailreiche Welt mit Tiefe, leicht weich | stark verwaschen | **schwach** |
| Farbe | sehr satt, kräftig, warm/kalt-Kontraste | blasser, Hintergrund absichtlich entsättigt | **mittel** |
| Licht | farbiges Rand- und Glühlicht (Feuer, Mond, Magie) | Randlicht vorhanden, dezent | mittel |
| Figurgröße | Figur füllt 50–70 % des Bildes, oft angeschnitten | Figur oft halbnah und kleiner | mittel |
| Text | selten; wenn, dann farbig leuchtend („50.000.000“, „x400“) | weiße Pixelschrift mit Schatten | mittel |
| Ausdruck | eigene, sehr ausdrucksstarke Skins und Gesichter | Standard-Skin mit Mimik | gut (Grenze der Testdaten) |
| Aufbau | Figur und Thema klar getrennt, Diagonalen | Figur und Thema klar getrennt | gut |

## Was geändert wurde

- **Veredeln:** Der Hintergrund wird nur noch um 1,2 statt 3 px weichgezeichnet (gemessen behielt er vorher nur ein
  Fünftel seiner Details) und **satter** statt blasser (+8 % statt −12 % Sättigung), nur leicht dunkler. Die Figur bekommt
  mehr Sättigung (+20 %) und Kontrast.
- **Tiefenschärfe:** Blende 5,6 statt 2,0 – die Welt hinter der Figur bleibt erkennbar.

Ergebnis an derselben Szene (unveränderte Szenendaten neu gerendert): Detailschärfe des Hintergrunds 1,2 → 2,6 (Vorbilder
sichtbar ähnlich), Farben deutlich kräftiger. Der Hintergrund wirkt jetzt wie bei Paluten und BastiGHG eine echte Welt
statt eines Weichzeichners.

## Nachtest mit Planung

Vier Freiform-Aufgaben komplett neu (Planung, Render, Veredeln) und neben die alten Ergebnisse gelegt:

| Aufgabe | vorher | nachher |
|---|---|---|
| Creeper hinter mir | gut | gut, Welt scharf und satt – näher an den Vorbildern |
| Haus von Zombies belagert | gut | gut, mehr Zombies, detailreiche Nacht |
| Brücke über Lavameer brennt | gut | mittel, Brücke schlechter zu sehen |
| nur Kohle nach drei Stunden | gut | mittel, Spitzhacke hinter dem Kopf als dunkler Fleck |

Hintergrund und Farben halten jetzt mit den Vorbildern mit. Noch nicht: Figurgröße und Leuchteffekte – 8.2 bleibt
offen, bis auch das sitzt.

## Leuchtschrift

Die Minecraft-Pixelschrift bekommt hinter dem Spielschatten einen weichen Schein in ihrer eigenen Farbe (abschaltbar je
Text mit `leuchten: false`). Nachtest: „HINTER DIR!“ in Türkis auf der Creeper-Szene – der Schein hebt den Text vom
Hintergrund ab wie „50.000.000“ bei Castcrafter, die Pixelkanten bleiben scharf. Bewertung Text: mittel → gut.

## Offen

- Figur häufiger groß und angeschnitten planen.
