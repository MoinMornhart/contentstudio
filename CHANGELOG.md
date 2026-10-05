# Changelog

Alle nennenswerten Änderungen an ContentStudio. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

Neue Einträge kommen unter „Unreleased“. `node scripts/release.mts` macht daraus eine Version; die Zeile mit `>` ist die
Kurzbeschreibung für die README.

## [Unreleased]

### Changed

- Minecraft-Thumbnails nach dem Vergleich mit großen Kanälen: Die Welt hinter der Figur bleibt detailreich und satt statt
  verwaschen (weniger Weichzeichner, Blende 5,6), die Figur bekommt mehr Farbe und Kontrast.

### Added

- Leistungsbericht auf einem Laptop mit integrierter Intel-Grafik: Export über Quick Sync, Freistellen über DirectML
  (docs/tests/hardware-intel.md).

## [0.7.10] - 2026-10-05

> Freiform-Tests bestanden: Thumbnails und Schnittwünsche in allen 5 Richtungen überwiegend gut

### Fixed

- Schnitt-Wünsche: Die KI sieht das Transkript jetzt Satz für Satz mit genauen Zeiten, auch wenn die Spracherkennung einen
  langen Block liefert – Effekte wie „zensier das Wort …“ oder „schreib … wenn ich … sage“ sitzen genau. Eine Zensur
  deckt immer ganze Wörter ab.

## [0.7.9] - 2026-10-05

> Thumbnails in allen 5 Testrichtungen überwiegend gut: geteilte Bilder, genauere Prüfung, Posen nach Stimmung

### Fixed

- Minecraft: Nennt die Beschreibung zwei Seiten oder Welten („links … rechts …“, Oberwelt und Nether), wird ein geteiltes
  Bild geplant statt beides in eine Szene zu bauen. Die Bildprüfung sagt genauer, was nicht stimmt („Mob zu nah an der
  Kamera“, „ragt rechts aus dem Bild“), damit die Korrektur trifft.
- 3D-Avatar: Die Pose passt zur Stimmung (Schreck bei schlechten Nachrichten, Jubel nur bei Erfolg).

## [0.7.8] - 2026-10-05

> Bessere Thumbnails: keine harten Kanten bei Porträts, passende Orte, ruhigere Gefahr-Kamera

### Fixed

- Foto-Thumbnails: Eng zugeschnittene Porträts zeigen keine harten Schnittkanten mehr mitten im Bild – sie sitzen am
  Bildrand ihrer Seite und schließen oben und unten bündig ab, was dann noch im Bild läge, läuft weich aus.
- Orte im Hintergrund: Die KI wählt aus den Orten, für die es Fotos gibt; ein Ort wird nur genommen, wenn er wirklich
  passt (kein Tanzsaal mehr für „Bahnhof“). Sonst gibt es einen Farbverlauf mit passenden Gegenständen.
- Minecraft: Kamera „Gefahr“ mit längerer Brennweite – zur Kamera gestreckte Arme blähen nicht mehr auf, die Gefahr
  (Lava, Abgrund) hat mehr Platz im Bild.

## [0.7.7] - 2026-10-05

> Premiere-Brücke (UXP-Plugin, ungetestet); damit ist MoinStudio bis v0.50.1 übernommen

### Added

- Premiere-Brücke (ungetestet): UXP-Plugin „ContentStudio Bridge“ für Premiere Pro (`premiere-plugin/`) und die
  Gegenstelle in ContentStudio (nur 127.0.0.1, eigener Port). Das Plugin kennt nur feste Befehle und führt sie nur mit
  dem Zufallsschlüssel aus, den ContentStudio bei jedem Start lokal ablegt (aus MoinStudio v0.47.0).

## [0.7.6] - 2026-10-05

> Skin-Intro Sting im Schnitt für Minecraft-Konten

### Added

- Schnitt: Skin-Intro „Sting“ für Minecraft-Konten – deine Figur springt ins Bild und reckt die Faust (oder winkt, oder
  schlägt mit dem Schwert zur Kamera), darunter erscheint dein Kanalname mit Wusch, Knall und Ding. Sag einfach „mach
  ein Intro mit mir“; erst kommt der stärkste Moment, der Sting dauert höchstens 3 Sekunden. Gerendert wird er einmal
  und dann wiederverwendet (aus MoinStudio v0.44.0/v0.45.0).

## [0.7.5] - 2026-10-05

> Neuer Reiter Logo: Logos erstellen und verwalten, Logo mit Ecke und Größe in jedem Thumbnail

### Added

- Neuer Reiter „Logo“: Logos aus einer Beschreibung erstellen (Kanal-, Serien- oder Server-Logo). Bei Minecraft-Konten
  baut ContentStudio sie aus echten Minecraft-Dateien – Minecraft-Schrift, Blocktexturen, Items, Mob-Köpfe oder dein
  eigener Kopf, flach oder als echter 3D-Blocktext –, für alle anderen in der Schrift deiner Marke mit Farbverlauf,
  Kontur, Schatten und einem 3D-Sticker als Symbol. Immer mit transparentem Hintergrund; Änderungen in Worten stehen
  als Verlauf darunter (aus MoinStudio v0.38.0).
- Logo-Bibliothek: die Logos deiner Marke hochladen (PNG, JPG, SVG; ohne Transparenz wird der Hintergrund entfernt),
  umbenennen, löschen, als Standard für ein Konto festlegen und als PNG in 512, 1024 oder 2048 px oder als
  YouTube-Wasserzeichen (150 × 150) speichern.
- Thumbnail: Logo, Ecke (oder automatisch) und Größe wählbar, in jeder Art inklusive Vorlage. Es steht nie über
  Gesichtern, Figuren, Titeln oder der Videolänge unten rechts; „Logo kleiner“, „Logo nach links“ oder „Logo weg“ gehen
  als Änderung in Worten.

## [0.7.4] - 2026-10-05

> Thumbnail-Vorlage für jede Art von Bild: eigene Maske je Person, Hände, Ketten, Schlussprüfung mit Korrektur

### Added

- Thumbnail-Vorlage für jede Art von Bild: echte Menschen, Spielfiguren, Comic; eine oder mehrere Personen; von vorn,
  hinten oder der Seite; springend, kletternd, sitzend, fallend. Jede ersetzte Person bekommt ihre eigene Maske, die
  Figur wird genau in ihren Umriss eingepasst, die Arme zeigen dorthin, wo im Original die Hände waren, und Ketten oder
  Seile zwischen Personen werden neu gezeichnet. Fehlt bei Poly Haven das genaue Modell, kommt ein ähnliches in die
  Hand (Gewehr statt Schrotflinte), lange Dinge sind lang. Zum Schluss legt die Bild-KI Original und Ergebnis
  nebeneinander und korrigiert bis zu zweimal Größe, Haltung, Reste der alten Person und verdeckte Titel (aus
  MoinStudio v0.38.0–v0.41.0).

## [0.7.3] - 2026-10-05

> Aus MoinStudio: Minecraft-Engine mit Grafik-Ebene und geteilten Bildern, Effekt-Bibliothek mit Greenscreen, Verlauf, Namensvorschläge

### Added

- Thumbnail: Änderungen erscheinen als Verlauf wie in einem Chat unter ihrem Thumbnail – oben der Auftrag, darunter jede
  Änderung mit Wunsch und neuem Bild, ganz unten das Eingabefeld. Geändert wird das neueste oder das per „Ändern“
  gewählte Bild; wer den Auftrag löscht, löscht alle Änderungen mit.
- Schnitt: „Namen vorschlagen“ im Projekt – die KI liest das ganze Transkript und schlägt 5 Titel im Stil des Kontos vor;
  ein Klick übernimmt den Namen und den Titel für Export und Planungskarte. Projekte lassen sich auch selbst umbenennen
  (auch über MCP: `video_edit`, Aktion `umbenennen`).
- Planung: Videos im Schnitt landen von selbst in der Planung – eine passende Karte (gleiches Konto, ähnlicher Titel)
  wird verknüpft, sonst entsteht eine neue in „Schnitt“. Karten zeigen „Im Schnitt“, „Thumbnail“ und „Text fertig“.
- Sprechende Dateinamen: Thumbnails heißen beim Speichern `Thumbnail_2026-10-05_19-05.png` (mit Videoname, Variante,
  Format), das fertige Video heißt wie das Video, Shorts und Clips `<Video>_Short_1.mp4`; Titel, Beschreibung und
  Kapitel liegen als `<Video>.txt` daneben.

- Schnitt: Effekt-Bibliothek. Eigene Effekte mit Namen anlegen (z. B. „Abo-Animation“, „Boom“) aus Video mit
  Transparenz, Greenscreen-Video, Bild und/oder Sound. Per Knopf: Häufigkeit (in jedem Video / nur in manchen – jedes
  n-te oder X % / nur manuell), Konten, Richtungen, fester Zeitpunkt oder automatisch nach dem ersten Höhepunkt,
  Position und Größe. Nach dem Rohschnitt setzt ContentStudio sie selbst ein; per Wunsch geht es auch („blend die
  Abo-Animation bei 2:14 ein“). Die Bibliothek liegt im Datenordner, alle Geräte teilen sie.
- Greenscreen entfernen ohne Adobe: Die Hintergrundfarbe wird beim Hochladen erkannt, sonst per Pipette gewählt; Regler
  für Toleranz, Kantenweichheit und Grünstich mit Live-Vorschau über einem Standbild aus dem neuesten Projekt. Videos mit
  Transparenz (WebM, MOV) behalten ihren Alphakanal.
- Schnitt: Regeln aus einer Recherche erfolgreicher Creator für jede Richtung (Hook, Rhythmus, Sounds, Text, Abo-Hinweis)
  und eigene Regeln für Reactions, Gaming und Hochformat; Reactions werden enger geschnitten (Pausen ab 0,5 s).

- Minecraft-Thumbnails: Grafik-Ebene wie bei großen Minecraft-Kanälen – Hotbar mit Herzen, Hunger und XP, „Level 19“,
  Etiketten im Knopf-Stil, rote Lupe mit Pfeil, Haken-/Kreuz-/Zahl-Abzeichen und großer Regel-Text, alles aus den
  echten Texturen und der Schrift der Spieldatei; dazu leuchtende Bodenmarkierungen. Der Text weicht der Grafik aus.
- Minecraft-Thumbnails: geteilte Bilder für Vergleiche und Steigerungen (10€/100€/1000€, Noob/Pro, Vorher/Nachher) –
  jeder Teil wird im Format seines Streifens gerendert und mit schräger Trennlinie und Etikett zusammengesetzt.
- Minecraft-Thumbnails werden nach dem Render veredelt wie im Photoshop-Schritt großer Kanäle: Hintergrund weicher und
  dunkler, Figuren knackiger, Randlicht in der Farbe der Umgebung.
- Bildprüfung durch die KI (alle Thumbnail-Arten): Die KI sieht das Bild jetzt auch so klein, wie es auf dem Handy in der
  Liste erscheint, und achtet auf Grafikfehler.
- Minecraft: ausdrucksstarke Gesichter (Brauen, Glanzpunkte, Lachaugen, Mundformen, Wangen in den Farben des Skins),
  sieben neue Posen, Knie und Ellbogen knicken wie Blockgelenke; Blöcke mit eigener Form (Laterne, Lagerfeuer, Treppe,
  Zaun …) aus den Blockmodellen; Nether als riesige Höhle mit fünf Biomen; Klippen-Kamera, wenn jemand fast fällt.

### Fixed

- Schnitt: Der flache Auswahl-Baum aus 0.7.2 wirkte nur beim Podcast-Export, nicht beim Video-Render – jetzt überall.

- Minecraft: Werkzeuge und Waffen sitzen in jeder Hand richtig in der Faust, zeigen ihre Fläche statt der Kante, Bogen
  gespannt, Dreizack als 3D-Modell, flache Items aufrecht; Beine fließen nicht mehr ineinander; Hotbar hinter der
  Figur; Lava weniger grell; weiße Mobs im Nether bleiben weiß; Piglin-Ohren, Drachenflügel, Fuchs, Schaf, Schildkröte
  und Fische sehen aus wie im Spiel; Geschosse gelten nicht mehr als Mobs; keine schwebenden Blöcke; zu kleine oder am
  Rand klebende Hauptfigur wird gemeldet und korrigiert (aus MoinStudio v0.38.0–v0.45.1).

## [0.7.2] - 2026-10-05

> MoinStudio-Fehlerbehebungen übernommen: lange Videos, Cloud-Ordner, Media offline, KI-Zeitlimit; Orte und Gegenstände im Thumbnail

### Added

- Thumbnails ohne eigene Engine (Kochen, Vlog, Fitness, Bildung …): echte Orte als Hintergrund (Fotos von Poly Haven,
  CC0) und bis zu drei Gegenstände als 3D-Sticker (Microsoft Fluent Emoji, MIT), damit das Thema auf einen Blick
  erkennbar ist. Verdeckt ein Gegenstand ein Gesicht, rückt die Korrektur ihn zur Seite. Ohne Netz bleibt es beim
  Farbverlauf, mit Hinweis.

### Changed

- Jede Version bekommt jetzt ein Installationspaket, auch reine Fehlerbehebungen (aus MoinStudio v0.48.2).
- Abhängigkeiten: Electron 44.5.1, eslint 10.12, MCP 2.3 (aus MoinStudio v0.50.1).

### Fixed

- Vorschau und Export langer Videos brachen mit „FFmpeg … Cannot allocate memory“ ab: Die Auswahl der behaltenen
  Stücke ist jetzt ein flacher Baum, Texteinblendungen entstehen nur, solange sie zu sehen sind (aus MoinStudio v0.48.2).
- Transkript: Ein vorhandenes Sprachmodell wird ohne Internet geladen, ein fehlendes mit bis zu fünf Versuchen (aus
  MoinStudio v0.48.1).
- Datenordner in iCloud, OneDrive oder Dropbox: Kurze Sperren während der Synchronisierung werden bis zu zehn Sekunden
  abgewartet statt als Fehler gezeigt; der Datenordner bleibt immer auf dem Gerät (aus MoinStudio v0.48.0).
- Zwischenstände der Thumbnails galten fälschlich als Sync-Konflikte (aus MoinStudio v0.41.4).
- Premiere, After Effects, Resolve: kein „Media offline“ mehr auf dem zweiten Gerät. Das Rohvideo wird auf jedem Gerät
  gefunden (auch unter einem anderen Windows-Benutzer), liegt es außerhalb des Datenordners, kommt eine Kopie ins
  Projekt; Programmdateien mit Pfaden eines anderen Geräts werden beim Start neu geschrieben (aus MoinStudio v0.47.1,
  v0.47.2, v0.48.3).
- Ein hängender KI-Aufruf blockierte einen Auftrag: Jeder Aufruf hat jetzt ein Zeitlimit (Bildprüfung 5 Minuten, sonst
  30), danach kommt der nächste KI-Weg dran. Bei mehreren Thumbnail-Versuchen wiegen gemessene Fehler dreifach (aus
  MoinStudio v0.46.1).
- Bildwerkzeuge: OpenCV bleibt auf Version 4, Version 5 stürzte zufällig ab (aus MoinStudio v0.38.0).
- Thumbnail-Gegenstände: schon geladene Bilder werden nicht noch einmal im Netz gesucht.

## [0.7.1] - 2026-09-30

> Fix: Foto-Thumbnails brachen zufällig ab; Leistungsbericht; Qualitätsrunde vorbereitet

### Added

- Einstellungen → Hardware → Leistungsbericht: misst Export und Spracherkennung auf dem eigenen Rechner und öffnet einen
  Bericht zum Weitergeben.
- Qualitätsrunde vorbereitet: Freiform-Aufgaben für fünf Richtungen (je 20 Thumbnail-Beschreibungen und 20
  Schnittwünsche, eine Richtung englisch), Lauf für jeden KI-Weg, Testmatrix „jede KI-Funktion mit jedem Weg und ohne
  KI“, CPU-Bericht.

### Changed

- Datumsangaben in Kalender und Wochenplan im Format der Oberflächensprache.

### Fixed

- Foto-Thumbnails, Vorlagen und Facecam-Suche: OpenCV brach nach dem Freistellen zufällig ab (etwa jeder vierte Lauf).
  OpenCV läuft jetzt ohne OpenCL mit einem Thread; scheitert die Gesichtserkennung trotzdem, geht es ohne Gesicht weiter.

## [0.7.0] - 2026-09-30

> Export: Premiere, After Effects, DaVinci Resolve, CapCut, Photoshop, Selbsttests

### Added

- Schnitt weitergeben: Premiere Pro (FCP7-XML mit Zooms, Texten, Markern und Untertiteln), After Effects (Skript, das die
  Komposition anlegt), DaVinci Resolve (FCPXML und EDL) und CapCut (Ordner mit Clips in Reihenfolge, Untertiteln und
  Liste).
- Photoshop-Dateien ergeben übereinander genau das fertige Thumbnail (Ebene „Feinschliff“ für Farbangleich und Licht).
- Einstellungen → Programme: Erkennung von Premiere, After Effects, Resolve, CapCut und Photoshop mit Version und
  Selbsttest je Programm (ohne Programm „übersprungen“).

## [0.6.0] - 2026-09-30

> Planung: Board je Konto, Kalender, KI-Ideen, Cross-Posting, Upload-Paket

### Added

- Planungs-Reiter: Board je Konto (Idee, Aufnahme, Schnitt, Thumbnail, Upload, Veröffentlicht) mit Ziehen und Ablegen,
  Karten mit Termin, Notizen und Checkliste; eine Datei je Karte, Konfliktkopien von iCloud/OneDrive werden Feld für
  Feld zusammengeführt.
- Kalender für alle Konten mit Farben, Upload-Rhythmus aus dem Profil, freien Terminen und Wochen-/Monatsansicht.
- Verbindung zu Schnitt und Thumbnail: Karte startet beides und rückt nach Import, Export und Thumbnail-Wahl selbst
  weiter; Titel, Text und Kapitel aus dem Export.
- Ideen, Titelvorschläge und Wochenplan über die KI-Schicht, abgestimmt auf Richtung, Plattform und Sprache; Titel und
  Hashtags nach den Regeln jeder Plattform.
- Cross-Posting-Plan: Langvideo am Termin, danach Kurzvideos aus den Höhepunkten auf TikTok, Reels und Shorts.
- Upload-Paket (Video, Thumbnail, Texte); optional YouTube-Upload über die offizielle Anmeldung (OAuth, verschlüsselt,
  trennbar, immer privat bzw. geplant) – ungetestet mit echtem Konto.
- MCP-Werkzeuge `video_edit` und `planning` für Claude Desktop und andere MCP-Apps.

### Changed

- Wiederholungen bei Ideen werden sprachunabhängig über Wortstämme erkannt.

## [0.5.0] - 2026-09-30

> Schnitt: Transkript, Rohschnitt nach Stil, Effekte in Worten, Hochformat, Spuren, Export je Plattform

### Added

- Schnitt-Reiter: Rohvideo für ein Konto wählen, Vorschau mit Wellenform und Standbild-Leiste, Transkript lokal mit
  faster-whisper in der Sprache des Kontos (Fachbegriffe des Kanals als Hilfe), Rohschnitt mit Pausen, Füllwörtern und
  abgebrochenen Sätzen, Sätze und Schnitte per Klick rein und raus.
- Stil je Richtung: Gaming, Comedy und Streams schneiden eng mit vielen Akzenten, Kochen, Bildung und Podcasts lassen
  Pausen stehen; freie Richtungen bekommen den Stil der ähnlichsten. Richtung je Projekt änderbar.
- Wünsche in Worten über die KI-Schicht („Zeitlupe beim lustigsten Moment“): Schnitt und alle Effekt-Bausteine aus
  MoinStudio (Tempo, Standbild, Zoom, Wackeln, Farbe, Blitz, Blenden, Text, Bild, Geräusch, Zensur, Lautstärke, Intro),
  Effektliste zum An- und Ausschalten; Texte in der Schrift der Marke, Geräusche lizenzfrei erzeugt.
- Hochformat 9:16: mit Facecam oben Gesicht und unten Bild, sonst folgt der Ausschnitt Gesicht oder Bewegung.
- Weitere Spuren (Facecam, Gameplay, getrennter Ton), automatisch am Ton ausgerichtet, Versatz von Hand korrigierbar.
- Export je Plattform (YouTube, Shorts, TikTok, Reels, Facebook, X, Twitch, Kick, Podcast als M4A mit Kapiteln,
  Website) mit Prüfliste nach den Vorgaben der Plattform, Titel-, Text- und Kapitelvorschlag; Höhepunkte und
  Kurzvideos aus langen Videos und Streams.

## [0.4.0] - 2026-09-30

> Thumbnails: Vorbilder, Stilbuch, 3D, Foto, Vorlagen, Selbstprüfung, Export

### Added

- Thumbnail-Reiter: Beschreibung, Kanal, Freunde, Art (frei, Reaction, Vorlage, aus dem Video), Varianten mit
  Großansicht, Selbstprüfung, Änderungswünsche in Worten und Export.
- Vorbilder und Stilbuch je Kanal: per Datei, Ablegen, Zwischenablage oder YouTube-Link (nur das öffentliche
  Thumbnail); lokale Messung (Farben, Helligkeit, Kontrast, Aufbau) und Beschreibung durch die Bild-KI; automatisches
  Stilbuch mit Regeln und Belegen; gewichten, deaktivieren, löschen. Beispiel-Stilbuch „Minecraft“ (nur Regeln).
- Vorbilder nur für einen Auftrag („so ähnlich wie das hier“) mit Auswahl, was übernommen wird; Farben und Licht werden
  nachprüfbar übertragen, der Aufbau bleibt.
- Vier Engines: Minecraft-Welt in Blender (aus MoinStudio, Texturen aus der eigenen Spielinstallation), eigenes
  3D-Modell (GLB, glTF, VRM, FBX) mit Posen für gängige Skelette, Foto-Compositing (lokales Freistellen, Gesichter,
  Randkante, Licht angleichen) und Grafik ohne Person.
- Planung durch die gewählte KI: mehrere Varianten, jede nach einem Vorbild; ohne KI ein sicherer Standardaufbau.
- Text in der Markenschrift und Logo in einer freien Ecke, nie über Gesichtern; Freunde in jeder Art.
- Selbstprüfung vor dem Zeigen: technisch immer, dazu die Bild-KI, falls vorhanden; bis zu zwei Korrekturen.
- Reaction- und Vorlagen-Modus für Minecraft-Skins und Fotos; „Aus dem Video“ findet starke Momente lokal und schlägt mit
  Bild-KI Thumbnail-Ideen vor; Standbilder als Hintergrund nutzbar.
- Export als PNG oder JPG in 16:9, 9:16 und 1:1 (Text wird fürs neue Format neu gesetzt) und als PSD mit Ebenen.
- MCP-Werkzeuge `channels_list` und `thumbnail_create`; `job_image` zeigt einzelne Varianten.

### Changed

- Minecraft-Mobs werden nur zur Laufzeit aus Mojangs `bedrock-samples` importiert; aufrechte Wesen wie der Creeper
  stehen jetzt richtig.
- Bei Speichermangel rendert Blender automatisch kleiner und mit weniger Samples (Minecraft) bzw. ohne Entrauschen
  (3D-Modell).
- Aufgaben sehen nach dem Speichern eines Zwischenstands sofort den neuen Stand.
- README neu mit Bildern der Thumbnail-Arten und der Oberfläche.

## [0.3.0] - 2026-09-30

> KI-Schicht für alle Anbieter und MCP

### Added

- KI-Schicht für alle Anbieter: ein Auftrag mit JSON-Schema, jeder Anbieter übersetzt ihn; Rückfall auf den nächsten Weg,
  Reparaturschleife für ungültiges JSON, immer nur ein KI-Auftrag gleichzeitig, Warten bis zum Reset bei Limits.
- Wege: Ollama, LM Studio, llama.cpp (lokal, kostenlos), ChatGPT über die offizielle Codex-CLI (Abo), eigene API-Schlüssel
  für Anthropic (offizielles SDK, Standardmodell Claude Opus 5.5), OpenAI, Google Gemini und OpenRouter.
- API-Schlüssel nur verschlüsselt über den Windows-Schlüsselspeicher; Kostenschätzung vor jedem Aufruf und Monatssumme.
- Vor dem ersten Senden an einen Anbieter zeigt die App, was wohin geht; ohne Zustimmung wird nichts gesendet.
- „KI-Wege“ im Assistenten und in den Einstellungen: Erkennung, Fähigkeiten, Reihenfolge, Modellwahl, Test.
- MCP-Server: Claude Desktop und ChatGPT Desktop können ContentStudio als Werkzeug nutzen.
- Nutzungsbedingungen aller Anbieter geprüft und belegt (`docs/ki-anbieter.md`). Claude mit Abo läuft über Claude
  Desktop; der Weg über Claude Code ist ohne Freigabe von Anthropic nicht eingebaut. Gemini nur mit bezahltem Schlüssel.
- YouTube-Kanaldaten werden nach 30 Tagen automatisch gelöscht, mit Löschknopf und Quellenangabe.

## [0.2.0] - 2026-09-30

> Creator-Profil und Einrichtungsassistent

### Added

- Creator-Profil (`creator-profile.json` im Datenordner): versioniert, mit Migration, Standards für alles
  Übersprungene; ungültige Werte werden abgelehnt statt still übernommen. Jede spätere Funktion liest daraus.
- Einrichtungsassistent in 12 Schritten: Sprache, Datenordner, Über dich (Sprachen, Team), beliebig viele Kanäle auf
  allen Plattformen (Richtungen frei wählbar, Spiele, Formate, Upload-Rhythmus), Aussehen im Bild je Kanal (Foto,
  Spiel-Avatar mit Minecraft-Skin per Datei oder Name, VTuber/3D-Modell, Maskottchen, keine Person), Freunde,
  Vorbilder, Marke (Logos, Farben, Schrift-Vorschläge je Richtung), KI (folgt), Programme mit Erkennung, Hardware-Test,
  nur die nötigen Werkzeuge (Blender nur bei 3D), Zusammenfassung mit erstem Vorschlag.
- Jeder Schritt ist überspringbar; der Thumbnail-Reiter fragt fehlende Angaben im passenden Moment nach.
- Öffentliche YouTube-Daten per Link, nur mit Zustimmung (eigener API-Schlüssel oder einzelner Feed-Abruf), siehe
  `docs/datenquellen.md`.
- Profil in den Einstellungen bearbeitbar, Änderungen wirken sofort.
- Ende-zu-Ende-Durchläufe des Assistenten (`scripts/e2e.mts`, `tests/e2e/`).

### Fixed

- Schnelle Eingaben hintereinander gingen verloren (Änderungen rechneten aus einem veralteten Stand).

## [0.1.0] - 2026-09-30

> Fundament

### Added

- App-Fundament aus MoinStudio übernommen und verallgemeinert: Electron-App mit den Reitern Thumbnail, Schnitt,
  Planung und Einstellungen, Installer ohne Admin-Rechte, Selbst-Update über GitHub-Releases, Aufgaben mit echter Pause
  und Fortsetzen nach Neustart, Named Pipe für Fernsteuerung.
- Oberfläche auf Deutsch und Englisch; die Sprache folgt Windows oder wird in den Einstellungen gewählt. Tests prüfen
  gleiche Schlüssel in beiden Sprachen und finden feste Texte in der Oberfläche.
- Datenordner in OneDrive, iCloud Drive, Dropbox oder Google Drive: Konfliktkopien aller vier Dienste werden erkannt,
  Caches ausgenommen.
- Hardware-Test pro Gerät mit Wahl des ONNX-Anbieters (CUDA, DirectML oder CPU); Blender wird nur geladen und gemessen,
  wenn 3D gebraucht wird.
- Werkzeug-Manager: FFmpeg und uv als Grundwerkzeuge, Blender optional, alles per SHA256 geprüft.
- Eigenes App-Symbol und eigene Farben.
- Doku: Architektur, Entwicklungsumgebung, installierte Werkzeuge.

## [0.0.1] - 2026-09-30

> Projekt angelegt

### Added

- Repo mit Lizenz (MIT, Herkunft MoinStudio), `.gitignore`, gitleaks-Hook vor jedem Push.
- ROADMAP für den Neubau, UPSTREAM.md mit der MoinStudio-Grundlage v0.36.2, Auftrag in `docs/auftrag.md`.
