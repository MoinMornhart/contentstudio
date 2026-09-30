# ContentStudio

**ContentStudio** ist eine lokale Windows-Desktop-App für Creator: Thumbnails aus frei formulierten Beschreibungen,
Videoschnitt mit Wünschen in normaler Sprache und Planung für alle Kanäle und Plattformen. Sie ist der verallgemeinerte
Nachbau von [MoinStudio](https://github.com/MoinMornhart/moinstudio): gleicher Funktionsumfang, aber für jeden Creator,
jede Plattform, jeden KI-Anbieter und fast jede Hardware.

**ContentStudio** is a local Windows desktop app for creators: thumbnails from free-form descriptions, video editing
with requests in plain language, and planning across all channels and platforms. The interface is available in German
and English.

> **Status (30.09.2026):** Der Neubau hat gerade begonnen. Fortschritt: [ROADMAP](ROADMAP.md).

## Grundsätze

- **Lokal und kostenlos zuerst:** Rechenintensives läuft auf deinem Rechner mit freien Werkzeugen (Blender, FFmpeg,
  Whisper). Kein Pflicht-Cloud-Dienst, kein Server, kein Konto bei ContentStudio.
- **Fast jede Hardware:** Ein Hardware-Test stellt jedes Gerät selbst ein, bis hinunter zum reinen CPU-Betrieb.
- **Deine KI, deine Zugänge:** Offizielle CLIs und Desktop-Apps, in denen du dich selbst angemeldet hast, lokale Modelle
  oder eigene API-Schlüssel (verschlüsselt, mit Kostenanzeige). Oder ganz ohne KI.
- **Freiform:** Jede Beschreibung soll umsetzbar sein. Listen sind Beispiele, nie die Grenze.
- **Datenschutz:** Nichts verlässt deinen Rechner außer an den KI-Anbieter, den du gewählt hast. Keine Telemetrie.

## Neueste Änderungen

<!-- CHANGELOG:START -->
- **0.1.0** (2026-09-30): Fundament
- **0.0.1** (2026-09-30): Projekt angelegt
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

## Lizenz

[MIT](LICENSE). Teile stammen aus MoinStudio (ebenfalls MIT), die Herkunft steht im Kopf der jeweiligen Datei.
