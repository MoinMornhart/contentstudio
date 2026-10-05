# Upstream

Quelle: https://github.com/MoinMornhart/moinstudio
Zuletzt übernommen: v0.56.0 vollständig (Commit a3e1b7f) am 2026-10-05 – v0.37.0–v0.50.1 in ContentStudio v0.7.2–v0.7.7, v0.51.0–v0.56.0 in v0.7.13 (siehe Tabelle)

Der Neubau beruht auf MoinStudio v0.36.2. Neuere MoinStudio-Versionen werden nach dem Ablauf in
[docs/auftrag.md](docs/auftrag.md), Abschnitt 8, nachgezogen. Nichts wird stillschweigend ausgelassen: Was nicht
übernommen wird, steht mit Begründung in der Tabelle.

| MoinStudio | Art | Entscheidung | ContentStudio |
|---|---|---|---|
| v0.36.2 und älter | alles | Grundlage des Neubaus, verallgemeinert nach ROADMAP | ab v0.1.0 |
| v0.36.2 und älter: `config/channels.yaml` | persönlich | übersprungen: die persönlichen Kanäle; ersetzt durch Konten im Creator-Profil | – |
| v0.36.2 und älter: `scripts/progress.mts`, Werkstatt-/Fortschrittsseite | persönlich | übersprungen: die persönliche Fernkontrolle | – |
| v0.36.2 und älter: `docs/tests/*`, Screenshots | persönlich | übersprungen: Testberichte mit persönlichen Daten; ContentStudio schreibt eigene | – |
| v0.36.2 und älter: `.github/workflows/vibeworks-check.yml` | persönlich | übersprungen: an ein persönliches VibeWorks gebunden (VibeWorks legt für ContentStudio am 30.09.2026 selbst einen eigenen Check an) | – |
| v0.36.2 und älter: `config/vorbilder.json`, `docs/research/stilbuch.md` | Richtungsspezifisch | übernommen als Beispiel-Stilbuch der Richtung „Minecraft“, nur Regeln und öffentliche Titel, keine Bilder | ab v0.4.0 |
| v0.36.2 und älter: `blender/moin/*`, `blender/*.py` (Szenen-Bauer, Reaction, Vorlage, Text) | Richtungsspezifisch | übernommen als Minecraft-Engine (`blender/minecraft/`), persönliche Bezüge entfernt, Marker `MOIN_` → `CS_` | ab v0.4.0 |
| v0.36.2 und älter: `resources/minecraft/mobs.json` (geprüfte Mob-Tabelle) | aus Spieldaten abgeleitet | übersprungen: enthält aus Mojang-Daten abgeleitete Geometrie; ContentStudio importiert Mobs nur zur Laufzeit aus `bedrock-samples` | – |
| v0.36.2 und älter: `src/main/thumbnail/*` (Planung, Job, Reaction, Spiele-Vorlage, Video, Änderung, Mob-Import) | allgemein und richtungsspezifisch | übernommen und verallgemeinert: KI-Schicht statt Claude-Abo, Creator-Profil statt Skin-Bibliothek, Foto- und 3D-Modell-Engine neu | ab v0.4.0 |
| v0.36.2 und älter: Minecraft-Texturen aus `client.jar` ohne Rückfrage | Datenquelle | geändert: zuerst die Installation des Nutzers, Download nur mit bestätigtem Besitz (docs/datenquellen.md) | ab v0.4.0 |
| v0.36.2 und älter: `skins/skins.json` im Datenordner | persönlich | ersetzt durch Darstellungen und Freunde im Creator-Profil | ab v0.2.0 |
| v0.36.2 und älter: `src/main/schnitt/*`, `blender/transkript.py`, Schnitt-Reiter, `components/SchnittWunsch.tsx`, `shared/effekt-text.ts` | allgemein | übernommen und verallgemeinert: Konto statt fester Kanäle, KI-Schicht statt Claude-Abo, Sprache und Fachbegriffe aus dem Konto, Stil je Richtung, Hochformat mit Verfolgung, mehrere Spuren, Export je Plattform, alle Texte übersetzbar | ab v0.5.0 |
| v0.36.2 und älter: Schnitt-Text-Bilder nur in Minecraft-Schrift (`blender/text_bild.py`) | Richtungsspezifisch | erweitert: Minecraft-Schrift nur für Minecraft-Kanäle, sonst die Schrift der Marke (`blender/bild/text_bild_ttf.py`) | ab v0.5.0 |
| v0.36.2 und älter: Export „Für Premiere“ im Schnitt-Reiter | allgemein | verschoben nach M7 (Export in Schnittprogramme mit Selbsttests) | M7 |
| v0.36.2 und älter: `tests/echt/schnitt-wuensche.test.ts` (30 Wünsche auf persönlichen Projekten) | persönlich | ersetzt: echter Test mit selbst erzeugten Testvideos (`tests/echt/schnitt.test.ts`); Freiform-Wünsche folgen in M8 | ab v0.5.0 |
| v0.36.2 und älter: `src/main/planung/*`, Planungs-Reiter, `PlanungKalender`, `PlanungClaude`, `KartenVideo` | allgemein | übernommen und verallgemeinert: Konten aus dem Profil statt fest eingebauter Kanäle, Rhythmus im Profil, KI-Schicht statt Claude-Abo, Texte je Plattform statt nur YouTube, neu: Textregeln je Plattform, Cross-Posting, Upload-Paket und optionaler YouTube-Upload | ab v0.6.0 |
| v0.36.2 und älter: `KANAL_BESCHREIBUNG`, `KANAL_REGELN` (Beschreibung der persönlichen Kanäle im Ideen-Prompt) | persönlich | ersetzt durch die Beschreibung des Kontos aus dem Creator-Profil (Richtung, Plattform, Sprache, Spiele, Formate, Vorbilder) | ab v0.6.0 |
| v0.36.2 und älter: feste Kanal-Farben je Kanal | persönlich | ersetzt durch Farben je Konto in Profil-Reihenfolge | ab v0.6.0 |
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
| v0.38.0, v0.40.0 `freistellen.py` (Maske je Person, SAM), `vorlage_titel.py` | Vorlage | Python übernommen (rückwärtskompatibel); die zugehörige Planung kam mit der Spiele-Vorlage in v0.7.4 | v0.7.3 |
| v0.38.0–v0.41.0 Spiele-Vorlage für jede Art von Bild (Box je Person, Handziele, Verbindungen, Ersatzmodelle, Schlussprüfung mit Korrektur) | Vorlage | übernommen über die KI-Schicht für alle Anbieter mit Bildern; Box je Person und Schlussprüfung auch für die Foto-Engine (dort nur Lage und Größe korrigierbar); korrigiert die Prüfung Größe oder Lage, übersteuert das jetzt das Einpassen in den Umriss (in MoinStudio blieb die Korrektur dann wirkungslos); ohne Bild-KI bleibt der Rückfall aus der erkannten Person. Logo in der Vorlage folgt mit dem Logo-Reiter | v0.7.4 |
| v0.38.0 Logo-Reiter: Logos aus einer Beschreibung erstellen, ändern in Worten, Verlauf | Logo | übernommen über die KI-Schicht; Minecraft-Blockschrift (`blender/minecraft/logobau.py`, `logo_bauen.py`) als Richtungsmodul für Minecraft-Konten, für alle anderen neu ein Schrift-Logo in der Schrift der Marke mit Fluent-Emoji als Symbol (`blender/bild/logo_schrift.py`); ohne KI schlichte Logos aus dem Kanalnamen | v0.7.5 |
| v0.38.0 Logo-Bibliothek (hochladen, freistellen, umbenennen, Standard je Kanal, Export 512/1024/2048 und YouTube-Wasserzeichen) | Logo | übernommen; die Bibliothek sind die Logos der Marke im Creator-Profil (Assistent und Reiter teilen eine Liste), Standard je Konto | v0.7.5 |
| v0.38.0, v0.40.1 Logo in jedem Thumbnail mit Ecke und Größe, freie Ecke statt über Figuren und Titeln | Thumbnail | übernommen (Platzwahl aus `logo/platz.ts`), auch in der Vorlage; Logo-Wünsche in Worten („Logo kleiner“, „Logo weg“, „logo left“) ohne KI per Regel statt über ein Feld im KI-Plan; MoinStudios Pixel-Setzen in Blender (`logo_setzen.py`) übersprungen, ContentStudio setzt das Logo schon in TypeScript mit eigener PSD-Ebene | v0.7.5 |
| v0.46.0 Video-Einblendung mit Alphakanal und Ton | Schnitt | übernommen, Dateien kommen aus der Effekt-Bibliothek | v0.7.3 |
| v0.46.0 Testschalter `--moin-schnitt-export` | Test | übersprungen: ContentStudio testet den Export direkt im Echt-Test (`tests/echt/schnitt.test.ts`) | – |
| v0.49.0 Kanal und Videotyp per Knopf | Schnitt | schon so: Konto und Richtung je Projekt (aus dem Profil, änderbar); die KI rät nichts | – |
| v0.49.0 Schnitt-Regeln je Videotyp (Recherche) | Schnitt | übernommen und verallgemeinert: gemeinsame Regeln für jede Richtung, eigene für Reactions, Gaming und Hochformat; Pausen Reaction 0,5 s, Gaming 0,6 s | v0.7.3 |
| v0.50.0 Effekt-Bibliothek mit Greenscreen-Entfernung | Schnitt | übernommen: Konten und Richtungen statt fester Kanäle und Typen; ergänzt um das automatische Einsetzen nach dem Rohschnitt (Häufigkeit, Platzierung) und um die Bibliothek im Wunsch-Prompt | v0.7.3 |
| v0.51.0 Bibliotheks-Effekte automatisch platzieren (KI mit festen Grenzen, Regel als Rettung, „neu verteilen“) | Schnitt | übernommen: KI-Schicht statt Claude-Abo, Konten und Richtungen statt Kanäle; die Bibliothek im Wunsch gab es schon (v0.7.3) | v0.7.13 |
| v0.52.0 Timeline über der Aufnahme, Export mindestens 1080p, Gaming 60 fps, YouTube-Lautheit, Bibliothek in voller Breite | Schnitt | übernommen: Gaming an der Richtung erkannt statt am Videotyp; Lautheit je Plattform (Video −14 LUFS, Podcast −16 LUFS); 4K im Hochformat bleibt erhalten | v0.7.13 |
| v0.53.1 Lautheits-Filter benannte jedes „a“ im Graphen um | Schnitt | Fehler nicht übernommen (nur die Marke „[a]“ wird ersetzt), Test übernommen | v0.7.13 |
| v0.53.0 Kalender-Abgleich: Apple Kalender (CalDAV) in beide Richtungen, andere Kalender per iCal-Link, Wochenplan kennt andere Termine | Planung | übernommen: Konten aus dem Profil statt fester Kanäle, KI-Schicht, Passwort nur verschlüsselt (kein Rückfall ohne Verschlüsselung), Kalender „ContentStudio“ | v0.7.13 |
| v0.54.0 Schalter „Zuschauen“ (Schritte, Live-Bild beim Rendern; aus = Hintergrund bis zum Export mit Benachrichtigung), Reparatur von iCloud-Konfliktkopien („(1)“, Felder zusammenführen, Kopien sichern statt löschen), Projektstand aus den Dateien | Schnitt, Daten | übernommen: Live-Bild und Sicherung unter %LOCALAPPDATA%\ContentStudio; Dropbox-Kopien erkennt ContentStudio schon länger; der Stand zählt auch den Podcast-Export (export.m4a) | v0.7.13 |
| v0.55.0 Premiere: Bibliotheks-Effekte als echte Clips (Videos/Bilder als eigene Spur, Geräusche und Ton auf A2), Greenscreen/WebM einmal als ProRes 4444 mit Alpha | Programme | übernommen: FFmpeg aus dem Werkzeug-Manager statt fester Pfade, Medien unter <Projekt>/programme/medien, ohne FFmpeg bleibt es bei Markern; beim Start auffrischen behält die Clips | v0.7.13 |
| v0.56.0 Effekt-Ordner beobachten: neue Dateien werden automatisch zu Effekten (Art erkannt), Fenster zum Einrichten, Windows-Benachrichtigung im Hintergrund | Schnitt | übernommen: Ordnerliste im Datenordner für alle Geräte, Texte zweisprachig | v0.7.13 |
| v0.37.0 Thumbnail-Änderungen als Verlauf | Thumbnail | übernommen; die Text-Fixes derselben Version waren in ContentStudio nicht nötig (Textfeld steht immer im Plan) | v0.7.3 |
| v0.38.0 Sprechende Dateinamen | Fundament | übernommen; Shorts/Clips und Thumbnails mit Format-Zusatz | v0.7.3 |
| v0.38.0 Namensvorschläge und Umbenennen im Schnitt | Schnitt | übernommen über die KI-Schicht und den Titel-Auftrag der Planung; Stichprobe des Transkripts reicht jetzt bis zum Ende | v0.7.3 |
| v0.41.0 Videos im Schnitt landen automatisch in der Planung, Karten zeigen ihren Stand | Planung | übernommen mit Konten statt Kanälen und mehrsprachigen Füllwörtern | v0.7.3 |
| v0.44.0 Animation: bewegte Szenen mit dem Skin (`blender/moin/animation.py`, `render_animation.py`) | Minecraft | übernommen nach `blender/minecraft/animation.py` | v0.7.6 |
| v0.45.0 Skin-Intro „Sting“ im Schnitt (Sprung, Winken, Schwert, Kanalname mit Wusch, Knall und Ding) | Schnitt, Minecraft | übernommen für Konten mit Minecraft-Skin (Skin aus der Darstellung des Kontos); die KI bietet den Baustein nur diesen Konten an; ohne Blender bleibt Hintergrund mit Kanalname | v0.7.6 |
| v0.47.0 Premiere-Brücke: UXP-Plugin und WebSocket-Server (nur 127.0.0.1, Zufallsschlüssel, feste Befehle) | Export | übernommen als `premiere-plugin/contentstudio-bridge` und `src/main/premiere/`, eigener Port 47812 und eigener Schlüsselpfad; ungetestet wie in MoinStudio und wie dort noch nicht in der App eingeschaltet | v0.7.7 |
