<p align="center">
  <img src="build/icon.png" width="96" alt="ContentStudio">
</p>

<h1 align="center">ContentStudio</h1>

<p align="center">
  <b>Thumbnails, Schnitt und Planung für Creator – lokal auf deinem Rechner, mit deiner eigenen KI.</b><br>
  <i>Thumbnails, editing and planning for creators – local on your computer, with your own AI.</i>
</p>

<p align="center">
  <a href="https://github.com/MoinMornhart/contentstudio/releases/latest"><img alt="Neueste Version" src="https://img.shields.io/github/v/release/MoinMornhart/contentstudio?label=Version&color=8b6cff"></a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%7C%2011-2fd3e6">
  <img alt="Sprachen" src="https://img.shields.io/badge/Sprache-Deutsch%20%7C%20English-555">
  <a href="LICENSE"><img alt="Lizenz MIT" src="https://img.shields.io/badge/Lizenz-MIT-3ecf8e"></a>
</p>

<p align="center">
  <img src="docs/bilder/app-thumbnail.png" width="900" alt="Thumbnail-Reiter von ContentStudio mit einem fertigen Thumbnail">
</p>

ContentStudio ist der verallgemeinerte Nachbau von [MoinStudio](https://github.com/MoinMornhart/moinstudio): gleicher
Funktionsumfang, aber für **jeden** Creator – Gaming, Vlog, Kochen, Bildung, Tech, Musik, Reactions, Streams –, jede
Plattform, jeden KI-Anbieter und fast jede Hardware. Die Oberfläche gibt es auf Deutsch und Englisch.

> **Stand:** Fundament, Creator-Profil, KI-Schicht, Thumbnails und Schnitt sind fertig. Planung folgt.
> Fortschritt: [ROADMAP](ROADMAP.md) · Änderungen: [CHANGELOG](CHANGELOG.md)

## Thumbnails

Beschreib dein Thumbnail in eigenen Worten. ContentStudio plant mehrere Varianten nach den Vorbildern deines Kanals,
baut sie, prüft sie selbst und zeigt dir nur, was die Prüfung besteht.

<table>
  <tr>
    <td width="50%"><img src="docs/bilder/foto-1.jpg" alt="Foto-Thumbnail: Person freigestellt vor Farbverlauf mit Text"></td>
    <td width="50%"><img src="docs/bilder/foto-2.jpg" alt="Foto-Thumbnail mit zwei Personen"></td>
  </tr>
  <tr>
    <td><b>Foto-Compositing:</b> dein Foto wird lokal freigestellt, mit Randkante und angeglichenem Licht auf den Hintergrund gesetzt.</td>
    <td><b>Mit Freunden:</b> jede Person aus deinem Profil kann mit ins Bild.</td>
  </tr>
  <tr>
    <td><img src="docs/bilder/avatar-1.jpg" alt="3D-Avatar zeigt auf den Text"></td>
    <td><img src="docs/bilder/formate.jpg" alt="Dasselbe Thumbnail in 16:9, 9:16 und 1:1"></td>
  </tr>
  <tr>
    <td><b>Eigenes 3D-Modell:</b> VTuber- oder Spiel-Avatar als GLB, glTF, VRM oder FBX, in Blender posiert und beleuchtet.</td>
    <td><b>Jedes Format:</b> 16:9, 9:16 und 1:1 – der Text wird fürs neue Format neu gesetzt. Dazu PSD mit Ebenen.</td>
  </tr>
</table>

- **Vorbilder und Stilbuch je Kanal:** Thumbnails, die dir gefallen, per Datei, Ablegen, Zwischenablage oder
  YouTube-Link. Die App vermisst sie lokal, eine Bild-KI beschreibt sie genauer, daraus entsteht ein Stilbuch mit
  Regeln und Belegen. Du gewichtest, was dir wichtig ist.
- **„So ähnlich wie das hier“:** ein Vorbild nur für einen Auftrag, und du hakst an, was übernommen wird (Farben, Aufbau,
  Licht, Pose, Kamera, Textstil). Logos, Texte oder Figuren werden nie übernommen.
- **Minecraft-Welt:** die komplette 3D-Welt aus MoinStudio mit Skin, Posen, Mobs, Items und Licht. Texturen kommen aus
  deiner eigenen Spielinstallation, nie aus diesem Repository.
- **Reaction, Vorlage, aus dem Video:** das Original-Thumbnail mit dir daneben, du an der Stelle der Person in einem
  vorhandenen Thumbnail, oder starke Momente und Ideen direkt aus deinem Video.
- **Selbstprüfung:** Gesicht frei und im Bild, nichts Wichtiges angeschnitten, Text nie über Gesichtern, nicht leer
  oder überstrahlt – dazu die Bild-KI, wenn du eine hast. Fehler korrigiert die App vor dem Zeigen.
- **Änderungen in Worten:** „mehr Rot“, „Text größer“, „schau zur Kamera“.

## Schnitt

Rohvideo rein, fertiges Video raus. ContentStudio schneidet im Stil deiner Richtung, du schaust nur noch drüber.

<p align="center">
  <img src="docs/bilder/app-schnitt.png" width="900" alt="Schnitt-Reiter mit Vorschau, Wellenform, Rohschnitt und Export">
</p>

- **Transkript lokal:** faster-whisper in der Sprache deines Kontos, ohne Cloud; Kanalname und Fachbegriffe helfen beim
  Schreiben.
- **Rohschnitt nach Stil:** Pausen, Füllwörter, abgebrochene Sätze fliegen raus – bei Gaming und Comedy eng, bei Kochen,
  Bildung und Podcasts mit Luft. Jeder Schnitt lässt sich per Klick zurückholen.
- **Wünsche in Worten:** „Mach ein spannendes Intro“, „Zeitlupe beim lustigsten Moment“, „am Ende schwarz ausblenden“.
  Tempo, Standbild, Zoom, Wackeln, Farbe, Blitz, Blenden, Text, Bild, Geräusch, Zensur, Lautstärke und Intro – Texte in
  der Schrift deiner Marke.
- **Hochformat:** 9:16 für Shorts, Reels und TikTok; der Ausschnitt folgt Gesicht oder Bewegung, mit Facecam oben
  Gesicht und unten Bild.
- **Mehrere Spuren:** Facecam, Gameplay oder getrennter Ton werden am Ton automatisch ausgerichtet.
- **Export je Plattform:** YouTube, Shorts, TikTok, Reels, Facebook, X, Twitch, Kick, Podcast (M4A mit Kapiteln) –
  geprüft nach den Vorgaben der Plattform, mit Titel-, Text- und Kapitelvorschlag. Dazu Höhepunkte und Kurzvideos aus
  langen Streams.

## Grundsätze

| | |
|---|---|
| **Lokal und kostenlos zuerst** | Rechenintensives läuft auf deinem Rechner mit freien Werkzeugen (Blender, FFmpeg, rembg). Kein Pflicht-Cloud-Dienst, kein Konto bei ContentStudio. |
| **Fast jede Hardware** | Ein Hardware-Test stellt jedes Gerät selbst ein, bis hinunter zum reinen CPU-Betrieb. |
| **Deine KI, deine Zugänge** | Lokale Modelle (Ollama, LM Studio, llama.cpp), dein ChatGPT-Abo über die offizielle Codex-CLI, Claude Desktop und ChatGPT Desktop über MCP, oder eigene API-Schlüssel – verschlüsselt, mit Kostenanzeige vor jedem Aufruf. Oder ganz ohne KI. |
| **Freiform** | Jede Beschreibung soll umsetzbar sein. Listen sind Beispiele, nie die Grenze. |
| **Datenschutz** | Nichts verlässt deinen Rechner außer an den KI-Anbieter, den du gewählt hast. Keine Telemetrie. |

<p align="center">
  <img src="docs/bilder/app-einstellungen.png" width="720" alt="Einstellungen mit KI-Wegen und Profil">
</p>

## Installieren

Lade den Installer der [neuesten Version](https://github.com/MoinMornhart/contentstudio/releases/latest) herunter
(`ContentStudio-Setup-x.y.z.exe`) und starte ihn – ohne Administratorrechte. Beim ersten Start führt ein Assistent in
zwölf Schritten durch Profil, Kanäle, Darstellung, Marke und KI. Updates kommen danach automatisch.

## Neueste Änderungen

<!-- CHANGELOG:START -->
- **0.5.0** (2026-09-30): Schnitt: Transkript, Rohschnitt nach Stil, Effekte in Worten, Hochformat, Spuren, Export je Plattform
- **0.4.0** (2026-09-30): Thumbnails: Vorbilder, Stilbuch, 3D, Foto, Vorlagen, Selbstprüfung, Export
- **0.3.0** (2026-09-30): KI-Schicht für alle Anbieter und MCP
- **0.2.0** (2026-09-30): Creator-Profil und Einrichtungsassistent
- **0.1.0** (2026-09-30): Fundament
<!-- CHANGELOG:END -->

## Entwicklung

```powershell
git clone https://github.com/MoinMornhart/contentstudio.git
cd contentstudio
git config core.hooksPath .githooks   # gitleaks-Scan vor jedem Push
npm install
npm run check        # Typprüfung, Lint, Tests, Build
npm start            # App starten
```

Aufbau und Entscheidungen: [docs/architecture.md](docs/architecture.md) · KI-Anbieter und ihre Bedingungen:
[docs/ki-anbieter.md](docs/ki-anbieter.md) · Datenquellen: [docs/datenquellen.md](docs/datenquellen.md)

## Lizenz und Bildnachweis

[MIT](LICENSE). Teile stammen aus MoinStudio (ebenfalls MIT), die Herkunft steht im Kopf der jeweiligen Datei.

Die Beispielfotos in `docs/bilder/` stammen von Wikimedia Commons und stehen unter CC0 (Liste in
[tests/fixtures/testfotos.json](tests/fixtures/testfotos.json)). Der 3D-Test-Avatar wird von
[tests/fixtures/avatar_bauen.py](tests/fixtures/avatar_bauen.py) erzeugt.
