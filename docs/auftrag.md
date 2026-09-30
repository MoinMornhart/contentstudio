# Prompt: ContentStudio bauen und aktuell halten

> Diesen Prompt bekommt ein KI-Coding-Agent (Claude Code, Codex CLI, Gemini CLI oder ein anderer), der Dateien lesen,
> schreiben, Befehle ausführen und Git benutzen kann. Er gilt für zwei Aufträge:
> **Neubau** (ContentStudio zum ersten Mal bauen) und **Update** (Änderungen aus MoinStudio nachziehen).
> Welcher Auftrag gilt, steht in der ersten Zeile, die der Mensch dazuschreibt: `Auftrag: Neubau` oder `Auftrag: Update`.
> Fehlt sie, prüfe, ob es das ContentStudio-Repo mit einer Datei `UPSTREAM.md` schon gibt: dann Update, sonst Neubau.

---

## 1. Worum es geht

**MoinStudio** (https://github.com/MoinMornhart/moinstudio) ist eine lokale Windows-Desktop-App eines einzelnen
YouTubers (Kanäle MoinMornhart und MoinMorni, Minecraft und Streams). Sie hat drei Bereiche:

- **Thumbnail:** Aus einer frei formulierten Beschreibung entsteht in Blender eine Szene mit dem eigenen Minecraft-Skin.
- **Schnitt:** Rohvideo rein, fertiges Video raus, und Effekte oder Intros lassen sich in Worten verlangen.
- **Planung:** Board, Kalender und Ideen je Kanal.

Die KI läuft dort ausschließlich über das Claude-Abo des Besitzers.

**ContentStudio** ist dieselbe App für alle anderen: für Creator mit anderen Plattformen, anderen Inhalten, anderen
KI-Anbietern und anderer Hardware. ContentStudio ist ein **1:1-Nachbau im Funktionsumfang und in der Qualität**, aber an
jeder Stelle, an der MoinStudio etwas für Philip fest eingebaut hat, fragt ContentStudio den Nutzer oder erkennt es selbst.

Faustregel für jede Entscheidung: *Was MoinStudio für Philip weiß, muss ContentStudio erfragen, erkennen oder aus
Beispielen lernen.*

---

## 2. Unverrückbare Regeln

1. **Lokal zuerst, kostenlos zuerst.** Rechenintensives läuft auf dem Rechner des Nutzers mit freien Werkzeugen
   (Blender, FFmpeg, Whisper/faster-whisper, lokale Bildmodelle). Kein Pflicht-Cloud-Dienst, kein eigener Server, kein
   Konto bei ContentStudio. Kostenpflichtige Dienste nur, wenn der Nutzer sie im Assistenten ausdrücklich wählt.
2. **Läuft auf fast jeder Hardware.** Beim ersten Start auf jedem Gerät misst ein Hardware-Test die beste Konfiguration:
   - Blender-Version und Render-Engine
   - Video-Encoder
   - Whisper-Modell
   - ONNX- und GPU-Provider

   Jede Funktion hat eine Rückfall-Kette bis zu einem reinen CPU-Weg. Das Geräteprofil liegt pro Gerät lokal und wird nie
   synchronisiert (Vorbild: `src/main/hardware/` in MoinStudio).
3. **KI immer mit den eigenen Zugängen des Nutzers, nie mit fremden.**
   - Die App leitet keine Anfragen über Zugänge anderer Personen.
   - Sie baut keinen eigenen Login für Abo-Dienste nach.
   - Sie liest, speichert und reicht keine Session-Tokens oder Abo-Anmeldedaten weiter.

   Abo-Wege laufen nur über die **offiziellen, unveränderten CLIs bzw. Desktop-Apps** der Anbieter, in denen sich der
   Nutzer selbst angemeldet hat. Das ist die Lehre aus `docs/claude-integration.md` von MoinStudio: Eine App für andere darf
   kein Abo-Login „vermitteln“. Die Nutzungsbedingungen jedes Anbieters werden vor dem Einbau geprüft und in
   `docs/ki-anbieter.md` mit Quelle festgehalten.
4. **API-Schlüssel nur, wenn der Nutzer es will.**
   - Die App fragt danach nur, wenn der Nutzer den Weg „API-Schlüssel“ wählt.
   - Schlüssel liegen verschlüsselt über den Schlüsselspeicher des Betriebssystems (Electron `safeStorage`), nie im
     Klartext, nie im Datenordner, nie in Logs.
   - Vor jedem kostenpflichtigen Aufruf zeigt die App die geschätzten Kosten an.
5. **Freiform ist das Ziel.** Jede frei formulierte Beschreibung muss umsetzbar sein. Keine feste Liste von Posen, Orten,
   Effekten oder Vorlagen darf die Grenze sein. Listen sind Beispiele und Bausteine, nie das Ende.
6. **Datenschutz.** Nichts vom Nutzer verlässt den Rechner, außer an den KI-Anbieter, den er selbst gewählt hat. Die App
   sagt dabei, was gesendet wird. Keine Telemetrie ohne ausdrückliche Zustimmung.
7. **Nichts Privates aus MoinStudio übernehmen.** Siehe Abschnitt 9.
8. **Arbeitsweise.**
   - Jede Änderung bekommt einen Conventional Commit, einen SemVer-Tag, einen `CHANGELOG.md`-Eintrag und eine Zeile unter
     „Neueste Änderungen“ in der README.
   - Vor jedem Push läuft ein Secret-Scan (gitleaks).
   - Vor jeder Installation mit Admin-Rechten, jedem Kauf, jeder Anmeldung und jeder Lizenzannahme wird der Mensch gefragt.
     Jede Installation steht in `docs/plugins.md`.
9. **Sprache.** Oberfläche mindestens Deutsch und Englisch (i18n von Anfang an, keine fest verdrahteten Texte).
   Die Sprache wählt der Assistent aus der Systemsprache vor.

---

## 3. Einrichtungsassistent (das Herzstück)

MoinStudio kennt seinen Nutzer. ContentStudio lernt ihn beim ersten Start in einem **ausführlichen, aber
überspringbaren** Assistenten kennen. Jede Antwort landet im **Creator-Profil** (`creator-profile.json` im Datenordner,
Schema mit Zod, versioniert, später in den Einstellungen änderbar). Jede spätere Funktion liest aus diesem Profil, statt
etwas fest anzunehmen.

Schritte (Reihenfolge so, Texte kurz, Beispiele statt Fachbegriffe):

1. **Willkommen und Sprache.**
2. **Datenordner:** frei wählbar, auch OneDrive, iCloud Drive oder Dropbox. Speichern sicher bei Cloud-Sync:
   - atomar schreiben
   - Konfliktkopien erkennen
   - Download-Caches ausnehmen
3. **Wer bist du?**
   - Name oder Künstlername
   - Sprachen der Inhalte
   - Einzelperson oder Team (Mehrere Personen? Wer macht was?)
4. **Deine Kanäle und Konten**, beliebig viele. Je Konto:
   - Plattform (YouTube, YouTube Shorts, Twitch, Kick, TikTok, Instagram Reels, Facebook, X, Podcast, eigene Website, andere)
   - Name oder Handle
   - Hauptsprache
   - Inhaltsrichtung, mehrfach wählbar oder frei eingegeben (Gaming mit welchen Spielen, Vlog, Kochen, Tech, Bildung, Beauty,
     Fitness, Musik, Comedy, Reactions, Streams und Highlights, Podcast, Kinder, Business)
   - Formate (Langvideo, Short, Livestream, Clip, Podcast-Folge)
   - Upload-Rhythmus
   - optional ein Link, um öffentliche Metadaten zu lesen: Titel, Thumbnails und Längen der letzten Videos, nur öffentlich
     und nur mit Zustimmung

   Jedes Konto ist ein Eintrag wie `channels.yaml` in MoinStudio, nur vom Nutzer befüllt.
5. **Wie siehst du in deinen Thumbnails aus?** Mehrfachauswahl je Kanal:
   - echtes Foto/Facecam (Freistellen lokal)
   - Spiel-Avatar (Minecraft-Skin hochladen oder Name des Accounts; Roblox, Fortnite oder andere Spiele über hochgeladene
     Bilder oder Modelle)
   - VTuber- oder 3D-Modell (VRM, GLB, FBX)
   - Maskottchen oder Logo
   - keine Person im Bild

   Freunde und Mitspieler lassen sich genauso hinzufügen (Name + Bild/Skin/Modell).
6. **Deine Vorbilder:** Der Nutzer nennt Kanäle, deren Stil er mag, oder lädt eigene und fremde Thumbnails als Referenz
   hoch. Die App analysiert sie lokal bzw. mit der gewählten KI (Bildaufbau, Posen, Farbe, Text ja/nein, Mob- oder
   Objekt-Größe) und schreibt ein **Stilbuch pro Kanal**, wie `docs/research/stilbuch.md` in MoinStudio, nur automatisch.
   Fremde Bilder bleiben lokal und werden nie veröffentlicht. Dieser Schritt ist nur der Anfang: Vorbilder lassen sich
   jederzeit ergänzen (siehe 5.2 „Eigene Vorbilder“).
7. **Marke:**
   - Logo(s)
   - Farben
   - Schrift für Thumbnail-Text (Vorschläge passend zur Richtung, z. B. Pixel-Schrift für Minecraft)
   - Wasserzeichen ja/nein
8. **Welche KI hast du?** Die App erkennt, was installiert und angemeldet ist, und bietet nur an, was funktioniert:
   - Claude Code CLI und Claude Desktop (MCP)
   - OpenAI Codex CLI und ChatGPT Desktop (sofern MCP unterstützt)
   - Gemini CLI
   - lokale Modelle (Ollama, LM Studio, llama.cpp)
   - API-Schlüssel (Anthropic, OpenAI, Google, OpenRouter)
   - „keine KI“ (dann nur Funktionen ohne KI, klar gekennzeichnet)

   Die App zeigt je Weg, was er kann und was er kostet. Mehrere Wege dürfen gleichzeitig aktiv sein, mit Reihenfolge als
   Rückfall.
9. **Welche Programme nutzt du?** Premiere, After Effects, Photoshop, DaVinci Resolve, CapCut, OBS, Canva, keines. Daraus
   folgen die Export-Wege (siehe 5.4).
10. **Hardware-Test** (automatisch, mit Fortschritt, abbrechbar, später wiederholbar).
11. **Werkzeuge laden:** Blender, FFmpeg und Python (uv) laden unsichtbar, per SHA256 geprüft, ohne Admin-Rechte.
    Nur was für die gewählten Inhalte nötig ist; Blender z. B. nur, wenn 3D-Avatare oder 3D-Szenen gebraucht werden.
12. **Zusammenfassung** mit „Das kann ContentStudio jetzt für dich“ und einem ersten Vorschlag (z. B. „Erstelle dein
    erstes Thumbnail für dein letztes Video“).

Der Assistent stellt nur Fragen, deren Antwort etwas verändert. Wer etwas überspringt, bekommt sinnvolle Standards, und
die App fragt später im passenden Moment nach (z. B. beim ersten Thumbnail: „Wie sollst du im Bild aussehen?“).

---

## 4. KI-Schicht (anbieteroffen)

MoinStudio spricht nur mit `claude -p` und mit Claude Desktop über MCP. ContentStudio bekommt eine **Anbieter-Schicht**:

```ts
interface KiAnbieter {
  id: string                     // 'claude-code', 'codex-cli', 'gemini-cli', 'ollama', 'api-anthropic', …
  pruefe(): Promise<Status>      // installiert? angemeldet? Limits? (ohne Tokens zu lesen)
  faehigkeiten: { text: boolean; bilderSehen: boolean; werkzeuge: boolean; jsonSchema: boolean; lange: boolean }
  frage(auftrag: KiAuftrag, ctx: JobContext): Promise<KiAntwort>   // strukturiert (JSON-Schema), mit Checkpoint
}
```

- **Ein Auftrag, viele Anbieter.** Die Aufträge (Thumbnail-Szene planen, Schnittwünsche, Titel, Ideen) sind als
  Prompt-Vorlagen mit JSON-Schema beschrieben (wie `resources/prompts/` in MoinStudio). Jeder Anbieter übersetzt sie in
  seine Form. Anbieter ohne JSON-Schema bekommen „nur JSON“ und eine Reparaturschleife mit Zod.
- **Bilder sehen:** Die Selbstprüfung von Thumbnails und der Sichtbogen im Schnitt brauchen einen Anbieter, der Bilder
  lesen kann. Fehlt einer, greift die rein technische Prüfung (Bildbericht aus Blender) allein, und die App sagt das.
- **Limits:** Limit-Erkennung je Anbieter, Checkpoint und automatisches Weitermachen nach dem Reset (wie MoinStudio für
  Claude). Immer nur ein KI-Prozess gleichzeitig.
- **MCP-Server:** Alle Funktionen gibt es zusätzlich als MCP-Werkzeuge (wie `src/mcp/` in MoinStudio), damit jede
  MCP-fähige Desktop-App (Claude Desktop und andere) ContentStudio steuern kann. Planung funktioniert auch bei
  geschlossener App über den Datenordner.
- **Kosten sichtbar:** Bei API-Schlüsseln schätzt die App die Kosten vor dem Auftrag und zeigt eine Monatssumme.

---

## 5. Funktionsumfang (1:1 zu MoinStudio, verallgemeinert)

Lies für jeden Punkt den entsprechenden Code in MoinStudio, verstehe ihn und baue ihn verallgemeinert nach. Kopieren ist
erlaubt, soweit es die Lizenz von MoinStudio zulässt; prüfe `LICENSE` und nenne die Herkunft im Code-Kopf.

### 5.1 Fundament
Übernimm die Architektur aus MoinStudio (`docs/architecture.md`):
- Electron, electron-vite, React und TypeScript
- Installer ohne Admin-Rechte, Selbst-Update über GitHub-Releases
- Werkzeug-Manager, Job-System (Pause hält Blender/FFmpeg wirklich an, Fortsetzen nach Neustart, „Rechenlast pausieren“)
- Named-Pipe-RPC, Datenordner mit sicherem Speichern, Konfliktkopien-Erkennung
- Einstellungen, Hardware-Test, Einrichtungsassistent (erweitert nach Abschnitt 3)

### 5.2 Thumbnail
- **Engines nach Avatar-Art (aus dem Profil):**
  - *3D-Szene in Blender* für Spiel-Avatare und 3D-Modelle, mit der vollständigen Minecraft-Welt aus MoinStudio (echte
    Blöcke, Mobs, Items und Texturen aus den Spieldateien des Nutzers, auch neueste Previews, echte Modelle wie Boot und
    Elytra, Verbindungen, Licht nach Stilbuch). Andere Spiele: Modelle und Texturen, die der Nutzer bereitstellt.
  - *Foto-Compositing* für echte Personen: Facecam oder Fotos lokal freistellen, Ausdruck wählen (aus hochgeladenen
    Fotos), Hintergrund aus Video-Standbild, eigenem Bild oder generiert (nur wenn ein Bildmodell verfügbar und gewählt
    ist), Randkante, Licht angleichen.
  - *Vorlagen-Modus* wie die Spiele-Vorlagen in MoinStudio: Person in ein vorhandenes Thumbnail an die Stelle der Figur
    setzen.
- **Freiform:** Beschreibung in normaler Sprache → Plan der KI (mehrere Varianten, jede nach einem Vorbild des Nutzers
  aus dem Stilbuch) → Render → **Selbstprüfung**:
  - Gesicht frei? Wichtiges im Bild? Mob oder Objekt groß genug? Text über Wichtigem?
  - Bild leer oder überstrahlt?

  Danach wird korrigiert, erst dann wird etwas gezeigt. Änderungswünsche in Worten.
- **Eigene Vorbilder, jederzeit:** Der Nutzer kann beliebige Thumbnails hinzufügen, an denen sich die KI orientieren
  soll: per Datei, per Drag-and-drop, aus der Zwischenablage oder per Video-Link (dann nur das öffentliche Thumbnail).
  Zwei Ebenen:
  - **Für den Kanal:** Das Bild kommt in die Vorbild-Sammlung des Kanals. Die App analysiert es (Bildaufbau, Posen,
    Kamera, Farben, Licht, Text, Größe von Figur und Objekten) und ergänzt damit das Stilbuch. Die KI wählt bei jedem
    Auftrag das passendste Vorbild aus dieser Sammlung.
  - **Nur für diesen Auftrag:** Ein oder mehrere Bilder mit dem Hinweis „so ähnlich wie das hier“. Diese Vorbilder haben
    für den Auftrag Vorrang vor dem Stilbuch. Der Nutzer kann dazuschreiben, was er daran mag („nur die Farben“, „genau
    diese Pose“, „diesen Aufbau mit dem Mob rechts“), und die KI übernimmt gezielt das.

  Vorbilder lassen sich ansehen, gewichten („mehr davon“ / „weniger davon“), deaktivieren und löschen. Aus fremden
  Bildern übernimmt die KI nur Stil und Aufbau, nie Logos, Texte, Figuren oder Bildteile. Die Bilder bleiben lokal im
  Datenordner und werden nie veröffentlicht oder mitgeliefert.
- **Aus dem Video:** Video analysieren, Momente und Thumbnail-Ideen vorschlagen.
- **Text:** passende Schrift aus der Marke, nie über Gesicht oder Wichtigem, lebendig platziert.
- **Freunde:** in jeder Thumbnail-Art.
- **Logo:** in jedem Projekt möglich.
- **Export:** PNG/JPG in den Plattform-Formaten des Profils (16:9, 9:16 für Shorts/Reels, 1:1), PSD mit Ebenen.
- **Vorbild-Hinweise in der Oberfläche** („orientiert sich an …“) sind standardmäßig aus und lassen sich in den
  Einstellungen einschalten. Bei Vorbildern, die der Nutzer für einen Auftrag selbst hochgeladen hat, zeigt die Variante
  auf Wunsch das Vorbild daneben.

### 5.3 Schnitt
Alles aus MoinStudio (`src/main/schnitt/`):
- Import und Proxy
- Transkript lokal
- Rohschnitt: Pausen, Versprecher, Wiederholungen
- Schnitt prüfen und ändern, Änderungen in Worten
- Untertitel (auch Karaoke) und automatische Zooms
- Export mit Titel, Beschreibung und Kapiteln für die Plattform des Kontos
- Stream-Highlights und Shorts

Dazu Effekte und Intros in Worten (M6b):
- Bausteine: Tempo, Standbild, Zoom, Wackeln, Farbe, Blitz, Blenden, Text, Bild, Geräusch, Zensur, Lautstärke, Intro
- Sichtbogen, damit die KI das Video sieht
- Effektliste
- Geräusche lizenzfrei erzeugt

Verallgemeinert:
- **Stil je Richtung aus dem Profil:** Tempo, Schnitthärte, Untertitel-Stil, Effekt-Dichte. Kochen oder Bildung schneidet
  ruhiger als Gaming.
- **Hochformat:** 9:16 für Shorts, Reels und TikTok mit automatischer Bildausschnitt-Verfolgung (Gesicht oder Aktion).
- **Mehrere Spuren:** Facecam und Gameplay als getrennte Dateien.

### 5.4 Export in fremde Programme
- Premiere und After Effects: FCP7-XML mit Zooms, Texten und Markern, wie in MoinStudio
- DaVinci Resolve: FCPXML oder EDL
- CapCut: nur Projektordner mit Clips und Liste, keine Fernsteuerung
- Photoshop: PSD

Alles, was ohne das Programm nicht geprüft werden konnte, bleibt als „ungetestet“ markiert, bis ein Selbsttest auf einem
Rechner mit dem Programm grün war (wie `tests/adobe/`).

### 5.5 Planung
- Board je Konto und Kalender mit Upload-Rhythmus aus dem Profil
- Karte startet Schnitt und Thumbnail und rückt selbst weiter
- Ideen, Titel und Wochenplan mit der KI, abgestimmt auf Richtung und Plattform
- Titel-Längen und Hashtag-Regeln je Plattform
- Cross-Posting-Plan: ein Langvideo → welche Shorts wann auf welcher Plattform

Hochladen selbst nur, wenn der Nutzer das Konto per offizieller OAuth-Anmeldung der Plattform verbindet. Zugangsdaten
verschlüsselt, jederzeit trennbar. Standard: kein automatisches Hochladen, nur fertige Dateien und Texte.

### 5.6 Einstellungen
Profil bearbeiten, Konten verwalten, KI-Wege und Reihenfolge, Hardware neu testen, Werkzeuge, Datenordner, Updates,
Programme und Selbsttests, Datenschutz (was wird wohin gesendet), Sprache.

---

## 6. Qualität und Tests

- Unit-Tests für jede Logik (vitest), Echt-Tests für Render, Schnitt und KI (getrennte Konfiguration), Screenshot-Modus zur
  Selbstprüfung der Oberfläche (wie `src/main/screenshot.ts`).
- **Freiform-Test je Richtung:** Für jede Inhaltsrichtung im Assistenten mindestens 20 ungewöhnliche Thumbnail-
  Beschreibungen und 20 Schnittwünsche, mit neutralen Test-Avataren und Testvideos (nie echte Personen ohne Erlaubnis).
  Ergebnis mit Bewertung gut/mittel/schwach in `docs/tests/`. Fehler werden behoben, nicht gestrichen.
- **Vergleich mit Vorbildern:** Ergebnisse werden neben die Referenzen des jeweiligen Stilbuchs gelegt und so lange
  verbessert, bis sie mithalten. Die Selbstbewertung ist streng.
- Jede Funktion wird mit jedem KI-Weg getestet, der sie unterstützt, und ohne KI (sauberer Hinweis statt Absturz).
- Hardware: mindestens ein Lauf nur mit CPU (Software-OpenGL), einer mit GPU.

---

## 7. Auftrag: Neubau

1. Lege das Projekt lokal an (Ordner `contentstudio`), `git init`, `.gitignore`, README, erster Commit. Frage den
   Menschen, ob das GitHub-Repo öffentlich oder privat sein soll, und lege es danach an.
2. Klone MoinStudio schreibgeschützt nach `upstream/moinstudio` (nicht committen, steht in `.gitignore`) und lies:
   README, `ROADMAP.md`, `CHANGELOG.md`, `docs/`, `src/`, `blender/`, `resources/prompts/`.
3. Schreibe `ROADMAP.md` für ContentStudio. Die Meilensteine folgen MoinStudio, mit den Erweiterungen aus Abschnitt 3 bis 5:
   - Fundament
   - Assistent und Profil
   - KI-Schicht
   - Thumbnail (3D, Foto, Vorlage)
   - Schnitt
   - Planung
   - Export
   - Stabil 1.0

   Jeder Schritt hat ein prüfbares Abnahmekriterium.
4. Arbeite die ROADMAP Schritt für Schritt ab: bauen, testen, abhaken, committen, taggen, pushen. Nach jedem Release direkt
   weiter, ohne auf Bestätigung zu warten. Fragen nur bei echten Blockern und den Fällen aus Regel 8.
5. Lege `UPSTREAM.md` an (siehe Abschnitt 8) mit der MoinStudio-Version, auf der der Neubau beruht.
6. Fertig ist der Neubau, wenn alle Meilensteine abgehakt sind und die Freiform-Tests aus Abschnitt 6 für mindestens fünf
   Richtungen (darunter Minecraft-Gaming, echte Person/Vlog und Kochen oder Bildung) überwiegend „gut“ sind.

---

## 8. Auftrag: Update (MoinStudio-Änderungen nachziehen)

`UPSTREAM.md` im ContentStudio-Repo hält fest, was schon übernommen ist:

```md
# Upstream
Quelle: https://github.com/MoinMornhart/moinstudio
Zuletzt übernommen: v0.36.0 (Commit 2662dec…) am 2026-09-30

| MoinStudio | Art | Entscheidung | ContentStudio |
|---|---|---|---|
| v0.36.0 Mobs näher neben Philip | Thumbnail/3D | übernommen, verallgemeinert (Thema-Objekt statt Mob) | v1.4.0 |
| v0.35.1 Vorbild-Hinweis entfernt | Oberfläche | übernommen | v1.3.1 |
| … | … | übersprungen: nur Philips Daten | – |
```

Ablauf:
1. `git fetch` in `upstream/moinstudio`. Liste alle Tags nach „Zuletzt übernommen“ auf. Gibt es keine, ist nichts zu tun:
   kurz melden und enden.
2. Für jede neue Version: CHANGELOG-Eintrag lesen, dann den Diff (`git diff <alt>..<neu>`).
3. Jede Änderung einordnen:
   - **Kern** (Fundament, Job-System, Werkzeuge, Hardware, Schnitt, Planung, Export, Blender-Technik, Selbstprüfung,
     Fehlerbehebungen): übernehmen.
   - **Richtungsspezifisch** (Minecraft, Streams, Reactions): übernehmen in das jeweilige Richtungs-Modul, damit es allen
     Nutzern mit dieser Richtung hilft.
   - **Philip-spezifisch** (seine Kanalnamen, sein Stil als feste Regel, seine Fortschrittsseite, seine Daten): nicht
     wörtlich übernehmen. Prüfe, ob eine allgemeine Idee darin steckt, z. B. „Vorbild-Hinweis nervt“ → Einstellung „Hinweise
     ausblenden“, Standard aus. Wenn ja, als Profil-Einstellung umsetzen.
   - **Nur Claude:** über die KI-Schicht für alle Anbieter umsetzen, die es können.
4. Umsetzen, Tests anpassen und ergänzen, `npm run check` (Typen, Lint, Tests, Build) grün, betroffene Echt-Tests laufen
   lassen.
5. Je übernommener MoinStudio-Version ein Commit (`feat|fix: … (aus MoinStudio vX.Y.Z)`), dann ein ContentStudio-Release
   (Fixes → Patch, Funktionen → Minor), CHANGELOG mit Verweis auf die MoinStudio-Version, `UPSTREAM.md` fortschreiben.
6. Was nicht übernommen wird, steht mit Begründung in `UPSTREAM.md`. Nichts wird stillschweigend ausgelassen.
7. Gilt eine MoinStudio-Änderung als „ungetestet“ (z. B. Adobe), bleibt sie es auch in ContentStudio.

**Automatisch:** Der Update-Auftrag ist so geschrieben, dass er ohne Rückfragen laufen kann. Er eignet sich für einen
zeitgesteuerten Agenten, z. B. täglich, oder für einen GitHub-Workflow, der bei jedem neuen MoinStudio-Tag einen Agenten
mit `Auftrag: Update` startet. Der Agent pusht nur, wenn alle Prüfungen grün sind. Sonst legt er ein Issue mit dem Fehler
an und lässt `UPSTREAM.md` unverändert.

---

## 9. Was nie aus MoinStudio übernommen wird

- Skins, Fotos, Videos, Renders, Test-Ausgaben, Stil-Referenzen und heruntergeladene Thumbnails anderer Kanäle (liegen
  in MoinStudio ohnehin nur lokal, nie im Repo)
- Philips Kanalnamen, Serien, Freunde, Datenpfade, Upload-Rhythmus, Werkstatt- und Fortschrittsseite
- Philips persönliche Vorlieben als feste Regel: BastiGHG/GommeHD/Paluten als einziger Maßstab, „nur Deutsch“,
  „nur Claude-Abo“. Sie werden zu Profil-Einstellungen mit sinnvollen Standards. Die Minecraft-Vorbilder bleiben als
  Beispiel-Stilbuch für die Richtung „Minecraft“, ohne die Bilder selbst mitzuliefern (nur Beschreibung und Regeln).
- Minecraft-Texturen und -Modelle: Die kommen immer aus der Spieldatei des Nutzers bzw. aus Mojangs öffentlichen
  bedrock-samples zur Laufzeit, nie aus dem Repo.

---

## 10. Wie du berichtest

Nach jedem Release eine kurze Meldung in einfacher Sprache:
- was jetzt geht
- was getestet wurde (mit Ergebnis)
- was offen ist
- ob der Mensch etwas tun muss

Keine Fachbegriffe ohne Erklärung, keine internen Dateinamen in Texten für Nutzer.
