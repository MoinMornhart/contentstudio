# Changelog

Alle nennenswerten Änderungen an ContentStudio. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

Neue Einträge kommen unter „Unreleased“. `node scripts/release.mts` macht daraus eine Version; die Zeile mit `>` ist die
Kurzbeschreibung für die README.

## [Unreleased]

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
