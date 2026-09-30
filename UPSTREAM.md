# Upstream

Quelle: https://github.com/MoinMornhart/moinstudio
Zuletzt übernommen: v0.36.2 (Commit cece641) am 2026-09-30

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
