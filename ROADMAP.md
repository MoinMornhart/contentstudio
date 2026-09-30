# ROADMAP – ContentStudio

ContentStudio ist der verallgemeinerte Nachbau von [MoinStudio](https://github.com/MoinMornhart/moinstudio): gleicher
Funktionsumfang, gleiche Qualität, aber für jeden Creator. Was MoinStudio für seinen Besitzer fest weiß, fragt
ContentStudio ab, erkennt es selbst oder lernt es aus Beispielen. Der vollständige Auftrag steht in
[docs/auftrag.md](docs/auftrag.md).

Es wird **immer nur ein Schritt** bearbeitet: umsetzen → testen → abhaken → Commit (Conventional Commits) → Tag →
CHANGELOG → Push. Nach jedem Release geht es ohne Rückfrage weiter. Gefragt wird nur bei echten Blockern und vor
Installationen mit Admin-Rechten, Käufen, Anmeldungen und Lizenzannahmen.

**Versionen:** Fixes und kleine Schritte erhöhen die letzte Stelle, ein fertiger Meilenstein die mittlere. Die erste
stabile Version ist **1.0.0**. Jede mittlere Version erscheint als GitHub-Release mit Installer.

**Legende:** ✅ = Abnahmekriterium (prüfbar). „ungetestet“ = ohne das fremde Programm oder die fremde Hardware nicht
prüfbar; bleibt so markiert, bis ein Selbsttest auf einem passenden Rechner grün war.

**Grundlage:** MoinStudio v0.36.2 (Stand in [UPSTREAM.md](UPSTREAM.md)).

---

## Übersicht

| Meilenstein | Version | Inhalt | Status |
|---|---|---|---|
| M0 Setup | 0.0.1 | Repo, Lizenz, Secret-Scan, ROADMAP, UPSTREAM | ✅ |
| M1 Fundament | → 0.1.0 | Electron-App, Installer, Update, Datenordner, Werkzeuge, Hardware-Test, Jobs, RPC, zweisprachige Oberfläche | 🔄 |
| M2 Assistent und Profil | → 0.2.0 | Creator-Profil, Einrichtungsassistent in 12 Schritten, Profil in den Einstellungen | ⬜ |
| M3 KI-Schicht | → 0.3.0 | Anbieter-Schicht, Abo-CLIs, lokale Modelle, API-Schlüssel, Kosten, MCP-Server | ⬜ |
| M4 Thumbnail | → 0.4.0 | Vorbilder und Stilbuch je Kanal, 3D-Szene, Foto-Compositing, Vorlagen, Freiform, Selbstprüfung | ⬜ |
| M5 Schnitt | → 0.5.0 | Import bis Export, Effekte in Worten, Stil je Richtung, Hochformat, mehrere Spuren | ⬜ |
| M6 Planung | → 0.6.0 | Board je Konto, Kalender, Ideen mit KI, Plattform-Regeln, Cross-Posting | ⬜ |
| M7 Export | → 0.7.0 | Premiere/After Effects, DaVinci Resolve, CapCut, Photoshop, Selbsttests | ⬜ |
| M8 Qualität | → 0.8.0 | Freiform-Tests je Richtung, Vergleich mit Vorbildern, jeder KI-Weg, CPU und GPU | ⬜ |
| M9 Stabil | **1.0.0** | Politur, Abnahme, Release | ⬜ |

---

## M0 – Setup → 0.0.x

- [x] **0.1 Lokales Projekt:** Ordner `contentstudio`, `git init`, `.gitignore`, `.gitattributes`, Lizenz (MIT mit
  Herkunftsangabe MoinStudio), README. ✅ Erster Commit steht.
- [x] **0.2 GitHub-Repo:** öffentlich als `MoinMornhart/contentstudio` (Entscheidung des Menschen, 30.09.2026). ✅ Push
  und Tag `v0.0.1` sichtbar.
- [x] **0.3 Secret-Scan:** gitleaks im `pre-push`-Hook, `.env.example` ohne Schlüssel, private Daten per `.gitignore`
  ausgeschlossen. ✅ Push läuft nur nach grünem Scan.
- [x] **0.4 MoinStudio lesen:** schreibgeschützter Klon in `upstream/moinstudio` (nie committet), README, ROADMAP,
  CHANGELOG, `docs/`, `src/`, `blender/`, `resources/prompts/` gelesen. ✅ Diese ROADMAP und [UPSTREAM.md](UPSTREAM.md).
- [x] **0.5 Doku-Gerüst:** [docs/plugins.md](docs/plugins.md) (jede Installation), [docs/auftrag.md](docs/auftrag.md)
  (Auftrag für Neubau und Update). ✅ Dateien im Repo.

## M1 – Fundament → 0.1.0

Übernahme der App-Architektur von MoinStudio (`docs/architecture.md`): Electron, electron-vite, React, TypeScript.
Alles, was nach Philip, seinen Kanälen oder nur nach Claude klingt, wird dabei neutral.

- [x] **1.1 Electron-Grundgerüst:** Main, Preload, Renderer getrennt, `contextIsolation`, typisierte IPC-Brücke
  (`window.cs`), Reiter Thumbnail, Schnitt, Planung, Einstellungen; ESLint, Vitest. ✅ `npm run check` grün, App startet,
  Screenshot aller Reiter.
- [x] **1.2 Zweisprachige Oberfläche von Anfang an:** Wörterbücher Deutsch und Englisch, keine fest verdrahteten Texte in
  der Oberfläche, Sprache aus der Systemsprache vorgewählt, jederzeit umschaltbar. ✅ Unit-Test: beide Wörterbücher haben
  dieselben Schlüssel; Test sucht nach festen Texten in `.tsx`-Dateien; Screenshots auf Deutsch und Englisch.
- [x] **1.3 Installer ohne Admin-Rechte:** NSIS per Benutzer, Startmenü, Desktop-Verknüpfung, optionaler Autostart.
  ✅ `npm run dist` baut `ContentStudio-Setup-x.y.z.exe`; Installation und Deinstallation auf der Test-VM.
- [ ] **1.4 Release-Pipeline und Selbst-Update:** Tag `vX.Y.0` baut auf GitHub Actions den Installer und veröffentlicht
  ihn mit `latest.yml`; electron-updater prüft, lädt und installiert auf Knopfdruck. ✅ Release erscheint mit `.exe`,
  `.blockmap`, `latest.yml`; Update von einer Version auf die nächste in der App.
- [x] **1.5 Datenordner mit sicherem Speichern:** frei wählbar (auch OneDrive, iCloud Drive, Dropbox, Google Drive);
  atomar schreiben; Konfliktkopien aller vier Dienste erkennen und Feld für Feld zusammenführen; Download-Caches und
  große Zwischendateien liegen nie im Datenordner. ✅ Unit-Tests für jede Konfliktkopie-Schreibweise und für atomares
  Schreiben.
- [x] **1.6 Werkzeug-Manager:** Blender, FFmpeg, uv laden unsichtbar, SHA256-geprüft, ohne Admin nach
  `%LOCALAPPDATA%\ContentStudio`; nur was gebraucht wird. ✅ Unit-Tests mit gefälschten Downloads (falsche Prüfsumme →
  Abbruch); echter FFmpeg-Download auf der Test-VM.
- [x] **1.7 Hardware-Test pro Gerät:** erkennt CPU, RAM, GPUs, misst Blender-Engines, Video-Encoder, Whisper-Stufe,
  ONNX-/GPU-Provider; Rückfall-Kette bis zur reinen CPU; Geräteprofil lokal, nie im Datenordner. ✅ Unit-Tests mit
  simulierten NVIDIA-, AMD-, Intel- und Nur-CPU-Profilen; echter Lauf auf der Test-VM (nur CPU).
- [x] **1.8 Job-System:** persistente Warteschlange, Pause hält Blender/FFmpeg wirklich an, Fortsetzen nach Neustart,
  Knopf „Rechenlast pausieren“. ✅ Unit-Tests; Integrationstest pausiert ein Probebild und setzt fort.
- [x] **1.9 Named-Pipe-RPC:** Pipe je Windows-Benutzer mit Zufallstoken für MCP und Fernsteuerung. ✅ Unit-Test mit
  falschem Token → abgelehnt.
- [x] **1.10 Screenshot-Modus und Release-Werkzeug:** `npm run screenshot` nimmt alle Reiter auf; `scripts/release.mts`
  erhöht Version, schreibt CHANGELOG und README-Block, taggt und pusht. ✅ Probelauf `--dry-run`, Screenshots liegen vor.

**→ 0.1.0, sobald 1.1–1.10 erledigt sind.**

## M2 – Einrichtungsassistent und Creator-Profil → 0.2.0

Das Creator-Profil (`creator-profile.json` im Datenordner, Zod-Schema mit Versionsnummer und Migration) ist die einzige
Quelle für alles, was MoinStudio fest eingebaut hat. Jede spätere Funktion liest daraus.

- [ ] **2.1 Profil-Schema:** Person/Team, Sprachen, Konten (Plattform, Handle, Sprache, Richtungen, Formate, Rhythmus,
  Link), Darstellung je Kanal, Freunde, Vorbilder, Marke, KI-Wege, Programme, Einstellungen; Standardwerte für alles
  Übersprungene; Migration älterer Versionen. ✅ Unit-Tests: leeres Profil gültig, jede Migration, ungültige Werte werden
  abgelehnt statt still übernommen.
- [ ] **2.2 Assistent Schritte 1–4:** Willkommen und Sprache, Datenordner, Wer bist du?, Kanäle und Konten (beliebig
  viele, alle Plattformen aus dem Auftrag, Richtungen mehrfach oder frei). ✅ Durchlauf mit drei Konten auf zwei
  Plattformen; Profil stimmt; Screenshots DE/EN.
- [ ] **2.3 Öffentliche Metadaten per Link (nur mit Zustimmung):** Titel, Thumbnails und Längen der letzten Videos ohne
  Anmeldung und ohne API-Schlüssel (YouTube-Feed, sonst Seite ohne Login), klare Zustimmungsfrage vorher. ✅ Unit-Test
  mit gespeicherter Beispielantwort; echter Abruf eines öffentlichen Test-Kanals.
- [ ] **2.4 Assistent Schritte 5–7:** Darstellung je Kanal (Foto/Facecam, Spiel-Avatar inkl. Minecraft-Skin per Datei oder
  Name, VTuber/3D-Modell VRM/GLB/FBX, Maskottchen/Logo, keine Person), Freunde und Mitspieler, Vorbilder (Kanäle nennen,
  Bilder hochladen), Marke (Logos, Farben, Schrift mit Vorschlägen je Richtung, Wasserzeichen). ✅ Durchlauf mit jeder
  Darstellungsart; Dateien landen im Datenordner, nie im Repo.
- [ ] **2.5 Assistent Schritte 8–12:** KI-Wege (Erkennung aus M3, bis dahin Platzhalter „keine KI“), Programme,
  Hardware-Test, Werkzeuge nur nach Bedarf (Blender nur bei 3D), Zusammenfassung „Das kann ContentStudio jetzt für dich“
  mit erstem Vorschlag. ✅ Profil ohne 3D lädt kein Blender; Zusammenfassung nennt nur verfügbare Funktionen.
- [ ] **2.6 Überspringen und später nachfragen:** jeder Schritt überspringbar; fehlende Angaben werden im passenden Moment
  nachgefragt (z. B. beim ersten Thumbnail). ✅ Kompletter Durchlauf mit „Überspringen“ überall → App nutzbar, sinnvolle
  Standards; Nachfrage erscheint beim ersten Thumbnail.
- [ ] **2.7 Profil in den Einstellungen:** Profil, Konten, Darstellung, Marke, Programme, Sprache änderbar. ✅ Änderung in
  den Einstellungen wirkt ohne Neustart.

## M3 – KI-Schicht (anbieteroffen) → 0.3.0

- [ ] **3.1 Nutzungsbedingungen prüfen:** je Anbieter (Anthropic/Claude Code/Claude Desktop, OpenAI/Codex/ChatGPT,
  Google/Gemini CLI, Ollama, LM Studio, llama.cpp, OpenRouter) mit Quelle und Datum in
  [docs/ki-anbieter.md](docs/ki-anbieter.md); nur eingebaut, was für eine App für andere erlaubt ist. ✅ Dokument mit
  Zitaten und Einordnung je Weg.
- [ ] **3.2 Schnittstelle `KiAnbieter`:** `pruefe()`, `faehigkeiten`, `frage()` mit JSON-Schema und Checkpoint;
  Auftragsvorlagen mit Schema (wie `resources/prompts/`); Anbieter ohne Schema bekommen „nur JSON“ und eine
  Reparaturschleife mit Zod; Rückfall-Reihenfolge aus dem Profil; immer nur ein KI-Prozess gleichzeitig. ✅ Unit-Tests
  mit Test-Anbieter (kaputtes JSON wird repariert, Rückfall greift, Parallelaufruf wartet).
- [ ] **3.3 Abo-Wege über offizielle CLIs:** nur Wege, die 3.1 erlaubt; Erkennung „installiert/angemeldet“ ohne Tokens zu
  lesen; Kind-Umgebung ohne fremde Schlüssel; Limit-Erkennung, Checkpoint, automatisches Weitermachen. ✅ Unit-Tests mit
  gefälschten CLIs (Limit-Ereignis → Warten → Fortsetzen); echter Aufruf mit dem Weg, der auf der Test-VM angemeldet ist.
- [ ] **3.4 Lokale Modelle:** Ollama, LM Studio, llama.cpp-Server (OpenAI-kompatibel) erkennen, Modelle auflisten,
  Bildfähigkeit erkennen. ✅ Unit-Tests mit Test-Server; echter Lauf, falls ein lokales Modell verfügbar ist, sonst
  „ungetestet“.
- [ ] **3.5 API-Schlüssel (nur auf Wunsch):** Anthropic, OpenAI, Google, OpenRouter; Schlüssel mit Electron `safeStorage`,
  nie im Klartext, nie im Datenordner, nie in Logs; Kostenschätzung vor jedem Aufruf, Monatssumme. ✅ Unit-Tests
  (verschlüsselt gespeichert, Log-Filter, Kostenrechnung); echter Aufruf nur mit einem Schlüssel des Menschen.
- [ ] **3.6 Oberfläche:** Assistent-Schritt 8 und Einstellungen „KI-Wege“ mit Erkennung, Fähigkeiten, Kosten,
  Reihenfolge; „keine KI“ kennzeichnet KI-Funktionen sauber. ✅ Screenshots; ohne KI zeigt jede KI-Funktion einen
  Hinweis statt eines Fehlers.
- [ ] **3.7 MCP-Server:** alle Funktionen als MCP-Werkzeuge, Eintrag in MCP-fähige Desktop-Apps (Claude Desktop inkl.
  MSIX-Pfad, weitere nach 3.1), Planung auch bei geschlossener App über den Datenordner. ✅ Unit-Tests mit MCP-Client;
  Ende-zu-Ende mit einer MCP-fähigen App.
- [ ] **3.8 Datenschutz-Anzeige:** vor dem ersten Senden an einen Anbieter: was wird gesendet, wohin; keine Telemetrie.
  ✅ Screenshot; Test: ohne Zustimmung wird nichts gesendet.

## M4 – Thumbnail → 0.4.0

- [ ] **4.1 Vorbilder und Stilbuch je Kanal:** Vorbilder per Datei, Drag-and-drop, Zwischenablage oder Video-Link (nur
  öffentliches Thumbnail); Analyse (Bildaufbau, Posen, Kamera, Farben, Licht, Text, Größe von Figur und Objekten) lokal
  und mit Bild-KI; automatisches Stilbuch je Kanal; ansehen, gewichten, deaktivieren, löschen; Beispiel-Stilbuch
  „Minecraft“ aus MoinStudio (nur Regeln, keine Bilder). ✅ 10 Vorbilder hinzufügen → Stilbuch mit Regeln und Belegen;
  Gewichtung ändert die Auswahl.
- [ ] **4.2 Vorbilder nur für einen Auftrag:** „so ähnlich wie das hier“ mit Hinweis, was übernommen werden soll; Vorrang
  vor dem Stilbuch; nur Stil und Aufbau, nie Logos, Texte, Figuren oder Bildteile. ✅ Test: Auftrags-Vorbild mit „nur die
  Farben“ ändert die Farben, nicht den Aufbau.
- [ ] **4.3 3D-Szene in Blender:** die komplette Minecraft-Welt aus MoinStudio (Figur aus Skin, Posen, Welt, Mobs, Items,
  Look, Kamera, Text) mit Texturen aus der Spielinstallation des Nutzers oder Mojangs öffentlichen bedrock-samples zur
  Laufzeit; andere Spiele und VTuber über GLB/VRM/FBX des Nutzers. ✅ Nachbau-Test: 10 Beschreibungen in Minecraft, 5 mit
  GLB-Test-Avatar.
- [ ] **4.4 Foto-Compositing:** Person lokal freistellen, Ausdruck aus hochgeladenen Fotos wählen, Hintergrund aus
  Video-Standbild, eigenem Bild oder generiert (nur mit verfügbarem und gewähltem Bildmodell), Randkante, Licht
  angleichen. ✅ 10 Beschreibungen mit neutralen Testfotos, Freistellung sauber.
- [ ] **4.5 Vorlagen-Modus:** Person/Avatar in ein vorhandenes Thumbnail an die Stelle der Figur setzen. ✅ 5 Vorlagen.
- [ ] **4.6 Freiform-Planung:** Beschreibung → Plan der KI mit mehreren Varianten, jede nach einem Vorbild des Kanals →
  Render → Änderungswünsche in Worten. ✅ 20 ungewöhnliche Beschreibungen je Engine, jede Variante nennt ihr Vorbild.
- [ ] **4.7 Text, Logo, Freunde:** Schrift aus der Marke, Text nie über Gesicht oder Wichtigem, lebendig platziert; Logo in
  jedem Projekt; Freunde in jeder Thumbnail-Art. ✅ Automatische Prüfung der Textlage.
- [ ] **4.8 Selbstprüfung:** technisch (Gesicht frei, Wichtiges im Bild, Objektgröße, Text, leer/überstrahlt) plus Bild-KI,
  falls verfügbar; Korrektur vor dem Zeigen; ohne Bild-KI sagt die App das. ✅ Absichtlich fehlerhafte Bilder werden
  erkannt und korrigiert.
- [ ] **4.9 Aus dem Video:** Video analysieren, Momente und Thumbnail-Ideen vorschlagen. ✅ 3 Testvideos, Vorschläge passen.
- [ ] **4.10 Export und Reiter:** PNG/JPG in den Plattform-Formaten des Profils (16:9, 9:16, 1:1), PSD mit Ebenen; Reiter
  mit Beschreibung, Konto, Freunden, Vorbildern, Varianten, Großansicht; Vorbild-Hinweise standardmäßig aus.
  ✅ Screenshots; Export in allen Formaten geprüft.

## M5 – Schnitt → 0.5.0

- [ ] **5.1 Import, Proxy, Transkript lokal:** wie MoinStudio (ffprobe, 540p-Proxy, Wellenform, faster-whisper nach
  Hardware-Profil, Sprache aus dem Konto). ✅ Testvideos in Deutsch und Englisch.
- [ ] **5.2 Rohschnitt, prüfen, ändern:** Pausen, Versprecher, Wiederholungen; Änderungen in Worten über die KI-Schicht,
  ohne KI nur die technischen Schritte. ✅ Testvideo wird kürzer, kein Wort abgeschnitten.
- [ ] **5.3 Stil je Richtung:** Tempo, Schnitthärte, Untertitel-Stil, Effekt-Dichte aus dem Profil (Kochen/Bildung ruhiger
  als Gaming). ✅ Unit-Tests: gleiche Eingabe, unterschiedliche Richtung → unterschiedliche Schnittliste.
- [ ] **5.4 Untertitel, Zooms, Effekte und Intros in Worten:** alle Bausteine aus MoinStudio (Tempo, Standbild, Zoom,
  Wackeln, Farbe, Blitz, Blenden, Text, Bild, Geräusch, Zensur, Lautstärke, Intro), Sichtbogen, Effektliste, Geräusche
  lizenzfrei erzeugt; Schrift aus der Marke. ✅ Unit-Tests je Baustein; Echt-Render mit allen Bausteinen.
- [ ] **5.5 Hochformat mit Bildausschnitt-Verfolgung:** 9:16 für Shorts, Reels, TikTok; Ausschnitt folgt Gesicht oder
  Aktion. ✅ Testvideo mit wanderndem Motiv bleibt im Bild.
- [ ] **5.6 Mehrere Spuren:** Facecam und Gameplay als getrennte Dateien, automatisch ausgerichtet. ✅ Zwei Testdateien mit
  Versatz werden synchron.
- [ ] **5.7 Export je Plattform:** Encoder aus dem Hardware-Profil, Vorgaben der Plattform des Kontos, Titel,
  Beschreibung, Kapitel nach Plattform-Regeln; Stream-Highlights und Shorts. ✅ Prüfpunkte je Plattform grün.

## M6 – Planung → 0.6.0

- [ ] **6.1 Board je Konto und Kalender:** Karten (eine Datei pro Karte, Konfliktkopien zusammenführen), Rhythmus aus dem
  Profil, Lücken. ✅ Unit-Tests; Screenshots.
- [ ] **6.2 Verbindung zu Schnitt und Thumbnail:** Karte startet beides und rückt selbst weiter. ✅ Durchlauf mit
  Testvideo.
- [ ] **6.3 Ideen, Titel, Wochenplan mit der KI:** abgestimmt auf Richtung und Plattform; Titel-Längen und Hashtag-Regeln
  je Plattform. ✅ 10 Ideen je Test-Konto, Titel halten die Plattform-Regeln ein (Unit-Test).
- [ ] **6.4 Cross-Posting-Plan:** ein Langvideo → welche Shorts wann auf welcher Plattform. ✅ Plan für ein Testvideo
  mit drei Plattformen.
- [ ] **6.5 Hochladen nur mit offizieller Anmeldung:** optional über OAuth der Plattform, Zugangsdaten verschlüsselt,
  jederzeit trennbar; Standard: kein automatisches Hochladen. ✅ Ohne Verbindung nur fertige Dateien und Texte; mit
  Verbindung „ungetestet“, bis der Mensch ein Konto verbindet.

## M7 – Export in fremde Programme → 0.7.0

- [ ] **7.1 Premiere und After Effects:** FCP7-XML mit Zooms, Texten und Markern wie in MoinStudio. ✅ XML-Prüfung per
  Parser; „ungetestet“ bis Selbsttest mit Adobe.
- [ ] **7.2 DaVinci Resolve:** FCPXML oder EDL. ✅ Struktur-Prüfung; „ungetestet“ bis Selbsttest mit Resolve.
- [ ] **7.3 CapCut:** Projektordner mit Clips und Liste, keine Fernsteuerung. ✅ Ordner vollständig.
- [ ] **7.4 Photoshop:** PSD mit Ebenen. ✅ Ebenen übereinander = PNG (Abweichung 0).
- [ ] **7.5 Selbsttests:** Einstellungen → Programme → „Selbsttest“ je Programm. ✅ Ohne Programm „übersprungen“.

## M8 – Qualität → 0.8.0

- [ ] **8.1 Freiform-Tests je Richtung:** je Inhaltsrichtung mindestens 20 ungewöhnliche Thumbnail-Beschreibungen und 20
  Schnittwünsche mit neutralen Test-Avataren und Testvideos, Bewertung gut/mittel/schwach in `docs/tests/`; Fehler werden
  behoben, nicht gestrichen. ✅ Mindestens fünf Richtungen (darunter Minecraft-Gaming, echte Person/Vlog, Kochen oder
  Bildung) überwiegend „gut“.
- [ ] **8.2 Vergleich mit Vorbildern:** Ergebnisse neben die Referenzen des Stilbuchs, verbessern bis sie mithalten.
  ✅ Vergleichsbilder und strenge Bewertung in `docs/tests/`.
- [ ] **8.3 Jeder KI-Weg und ohne KI:** jede Funktion mit jedem Weg, der sie kann, und ohne KI (Hinweis statt Absturz).
  ✅ Testmatrix in `docs/tests/ki-wege.md`.
- [ ] **8.4 Hardware:** ein Lauf nur mit CPU (Software-OpenGL), einer mit GPU. ✅ Beide Berichte in `docs/tests/`.

## M9 – Stabil → 1.0.0

- [ ] **9.1 Politur, README mit Screenshots.** ✅ README beschreibt alle Reiter.
- [ ] **9.2 Release 1.0.0.** ✅ Alle Meilensteine abgehakt, 8.1 erfüllt.
