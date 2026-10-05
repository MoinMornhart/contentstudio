# Upstream

Quelle: https://github.com/MoinMornhart/moinstudio
Zuletzt übernommen: v0.36.2 vollständig (Commit cece641) am 2026-09-30; aus v0.37.0–v0.50.1 (Commit 5c28eae) die Fehlerbehebungen am 2026-10-05, der Rest folgt Version für Version (siehe Tabelle)

Der Neubau beruht auf MoinStudio v0.36.2. Neuere MoinStudio-Versionen werden nach dem Ablauf in
[docs/auftrag.md](docs/auftrag.md), Abschnitt 8, nachgezogen. Nichts wird stillschweigend ausgelassen: Was nicht
übernommen wird, steht mit Begründung in der Tabelle.

| MoinStudio | Art | Entscheidung | ContentStudio |
|---|---|---|---|
| v0.36.2 und älter | alles | Grundlage des Neubaus, verallgemeinert nach ROADMAP | ab v0.1.0 |
| v0.36.2 und älter: `config/channels.yaml` | Philip-spezifisch | übersprungen: Philips Kanäle; ersetzt durch Konten im Creator-Profil | – |
| v0.36.2 und älter: `scripts/progress.mts`, Werkstatt-/Fortschrittsseite | Philip-spezifisch | übersprungen: Philips Fernkontrolle | – |
| v0.36.2 und älter: `docs/tests/*`, Screenshots | Philip-spezifisch | übersprungen: Testberichte mit Philips Daten; ContentStudio schreibt eigene | – |
| v0.36.2 und älter: `.github/workflows/vibeworks-check.yml` | Philip-spezifisch | übersprungen: an Philips VibeWorks gebunden (VibeWorks legt für ContentStudio am 30.09.2026 selbst einen eigenen Check an) | – |
| v0.36.2 und älter: `config/vorbilder.json`, `docs/research/stilbuch.md` | Richtungsspezifisch | übernommen als Beispiel-Stilbuch der Richtung „Minecraft“, nur Regeln und öffentliche Titel, keine Bilder | ab v0.4.0 |
| v0.36.2 und älter: `blender/moin/*`, `blender/*.py` (Szenen-Bauer, Reaction, Vorlage, Text) | Richtungsspezifisch | übernommen als Minecraft-Engine (`blender/minecraft/`), persönliche Bezüge entfernt, Marker `MOIN_` → `CS_` | ab v0.4.0 |
| v0.36.2 und älter: `resources/minecraft/mobs.json` (geprüfte Mob-Tabelle) | aus Spieldaten abgeleitet | übersprungen: enthält aus Mojang-Daten abgeleitete Geometrie; ContentStudio importiert Mobs nur zur Laufzeit aus `bedrock-samples` | – |
| v0.36.2 und älter: `src/main/thumbnail/*` (Planung, Job, Reaction, Spiele-Vorlage, Video, Änderung, Mob-Import) | allgemein und richtungsspezifisch | übernommen und verallgemeinert: KI-Schicht statt Claude-Abo, Creator-Profil statt Skin-Bibliothek, Foto- und 3D-Modell-Engine neu | ab v0.4.0 |
| v0.36.2 und älter: Minecraft-Texturen aus `client.jar` ohne Rückfrage | Datenquelle | geändert: zuerst die Installation des Nutzers, Download nur mit bestätigtem Besitz (docs/datenquellen.md) | ab v0.4.0 |
| v0.36.2 und älter: `skins/skins.json` im Datenordner | Philip-spezifisch | ersetzt durch Darstellungen und Freunde im Creator-Profil | ab v0.2.0 |
| v0.36.2 und älter: `src/main/schnitt/*`, `blender/transkript.py`, Schnitt-Reiter, `components/SchnittWunsch.tsx`, `shared/effekt-text.ts` | allgemein | übernommen und verallgemeinert: Konto statt fester Kanäle, KI-Schicht statt Claude-Abo, Sprache und Fachbegriffe aus dem Konto, Stil je Richtung, Hochformat mit Verfolgung, mehrere Spuren, Export je Plattform, alle Texte übersetzbar | ab v0.5.0 |
| v0.36.2 und älter: Schnitt-Text-Bilder nur in Minecraft-Schrift (`blender/text_bild.py`) | Richtungsspezifisch | erweitert: Minecraft-Schrift nur für Minecraft-Kanäle, sonst die Schrift der Marke (`blender/bild/text_bild_ttf.py`) | ab v0.5.0 |
| v0.36.2 und älter: Export „Für Premiere“ im Schnitt-Reiter | allgemein | verschoben nach M7 (Export in Schnittprogramme mit Selbsttests) | M7 |
| v0.36.2 und älter: `tests/echt/schnitt-wuensche.test.ts` (30 Wünsche auf Philips Projekten) | Philip-spezifisch | ersetzt: echter Test mit selbst erzeugten Testvideos (`tests/echt/schnitt.test.ts`); Freiform-Wünsche folgen in M8 | ab v0.5.0 |
| v0.36.2 und älter: `src/main/planung/*`, Planungs-Reiter, `PlanungKalender`, `PlanungClaude`, `KartenVideo` | allgemein | übernommen und verallgemeinert: Konten aus dem Profil statt `MoinMornhart`/`MoinMorni`, Rhythmus im Profil, KI-Schicht statt Claude-Abo, Texte je Plattform statt nur YouTube, neu: Textregeln je Plattform, Cross-Posting, Upload-Paket und optionaler YouTube-Upload | ab v0.6.0 |
| v0.36.2 und älter: `KANAL_BESCHREIBUNG`, `KANAL_REGELN` (Beschreibung von Philips Kanälen im Ideen-Prompt) | Philip-spezifisch | ersetzt durch die Beschreibung des Kontos aus dem Creator-Profil (Richtung, Plattform, Sprache, Spiele, Formate, Vorbilder) | ab v0.6.0 |
| v0.36.2 und älter: Kanal-Farben `.k-mornhart`/`.k-morni` | Philip-spezifisch | ersetzt durch Farben je Konto in Profil-Reihenfolge | ab v0.6.0 |
| v0.36.2 und älter: MCP-Werkzeuge `video_edit`, `planning` | allgemein | übernommen, englische Beschreibungen, Konto-IDs statt fester Kanäle; `planning` läuft über die App (Rhythmus liegt im Profil) | ab v0.6.0 |
| v0.36.2 und älter: `src/main/adobe/*` (Erkennung, Premiere-XML, PSD, Photoshop-COM, Selbsttest) | allgemein | übernommen nach `src/main/programme/`, Marker übersetzbar; PSD über ag-psd statt eigenem Schreiber, mit „Feinschliff“-Ebene; erweitert um After Effects (Skript), DaVinci Resolve (FCPXML/EDL) und CapCut (Ordner) | ab v0.7.0 |
| v0.48.2 Auswahl-Ausdruck als flacher Baum, Einblendungen nur solange sichtbar | Schnitt | übernommen | v0.7.2 |
| v0.48.2 Installer für jede Version (CI) | Fundament | übernommen | v0.7.2 |
| v0.48.1 Whisper-Modell ohne Internet laden, Download mit Wiederholungen | Schnitt | übernommen | v0.7.2 |
| v0.48.0 iCloud-Sperren abwarten, Datenordner immer lokal | Fundament | übernommen und erweitert auf OneDrive und Dropbox | v0.7.2 |
| v0.41.4 Thumbnail-Runden nicht als Sync-Konflikte | Fundament | übernommen | v0.7.2 |
| v0.41.5 Minecraft-Spieldateien lokal statt im Datenordner | Fundament | schon so: ContentStudio legt sie seit v0.4.0 in den lokalen Werkzeugordner | – |
| v0.47.1, v0.47.2, v0.48.3 Rohvideo und Premiere-Sequenzen auf jedem Gerät | Export | übernommen und erweitert auf After Effects, Resolve und Cloud-Ordner wie Dropbox | v0.7.2 |
| v0.46.1 Zeitlimit für Claude-Aufrufe, faire Auswahl über alle Versuche | KI, Thumbnail | übernommen über die KI-Schicht für alle Anbieter; die Bildprüfung lief in ContentStudio schon bei jedem Versuch | v0.7.2 |
| v0.38.0 OpenCV 4 statt 5 | Bild | übernommen | v0.7.2 |
| v0.50.1 Abhängigkeiten (Electron 44.5.1, eslint 10.12, MCP 2.3) | Fundament | übernommen | v0.7.2 |
| v0.38.0–v0.45.1 `blender/moin/*` (Gesichter, Posen, Werkzeuge, Blockmodelle, Nether-Biome, Mobs, Kamera, Duelle, Reaction-Gruppen) | Minecraft | übernommen per 3-Wege-Merge in `blender/minecraft/`, persönliche Bezüge neutralisiert | v0.7.3 |
| v0.39.0 Grafik-Ebene (`grafik_setzen.py`), geteilte Bilder (`split_setzen.py`), Bodenmarkierung | Minecraft | übernommen; Python-Umgebung „grafik“ nur mit Pillow und numpy | v0.7.3 |
| v0.40.0 Bildprüfung groß und in Handygröße | Thumbnail | übernommen über die KI-Schicht für alle Engines und alle Anbieter mit Bildern (Handy-Vorschau in Node statt Python) | v0.7.3 |
| v0.42.0 Veredeln nach dem Render (`veredeln.py`) | Minecraft | übernommen | v0.7.3 |
| v0.43.1 Prüfung auf zu kleine Hauptfigur | Minecraft | übernommen; Teil „Übernahme übersteht iCloud-Platzhalter“: schon so (Spieldateien liegen lokal) | v0.7.3 |
| v0.38.0, v0.40.0 `freistellen.py` (Maske je Person, SAM), `vorlage_titel.py` | Vorlage | Python übernommen (rückwärtskompatibel); die zugehörige Vorlagen-Planung folgt mit der Spiele-Vorlage | v0.7.3 |
| v0.38.0–v0.41.0 Spiele-Vorlage für jede Art von Bild (Planung, Schlussprüfung, Handziele, Verbindungen, Ersatzmodelle) | Vorlage | offen: folgt in einer der nächsten Versionen über die KI-Schicht | – |
| v0.38.0, v0.40.1 Logo in Reaction/Gaming, Logo-Reiter und -Bibliothek | Thumbnail | offen: ContentStudio setzt das Marken-Logo schon in jedes Thumbnail; Reiter und Bibliothek folgen | – |
| v0.46.0 Video-Einblendung mit Alphakanal und Ton | Schnitt | übernommen, Dateien kommen aus der Effekt-Bibliothek | v0.7.3 |
| v0.46.0 Testschalter `--moin-schnitt-export` | Test | übersprungen: ContentStudio testet den Export direkt im Echt-Test (`tests/echt/schnitt.test.ts`) | – |
| v0.49.0 Kanal und Videotyp per Knopf | Schnitt | schon so: Konto und Richtung je Projekt (aus dem Profil, änderbar); die KI rät nichts | – |
| v0.49.0 Schnitt-Regeln je Videotyp (Recherche) | Schnitt | übernommen und verallgemeinert: gemeinsame Regeln für jede Richtung, eigene für Reactions, Gaming und Hochformat; Pausen Reaction 0,5 s, Gaming 0,6 s | v0.7.3 |
| v0.50.0 Effekt-Bibliothek mit Greenscreen-Entfernung | Schnitt | übernommen: Konten und Richtungen statt fester Kanäle und Typen; ergänzt um das automatische Einsetzen nach dem Rohschnitt (Häufigkeit, Platzierung) und um die Bibliothek im Wunsch-Prompt | v0.7.3 |
