# Changelog

Alle nennenswerten Änderungen an ContentStudio. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

Neue Einträge kommen unter „Unreleased“. `node scripts/release.mts` macht daraus eine Version; die Zeile mit `>` ist die
Kurzbeschreibung für die README.

## [Unreleased]

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
