# Stand: ContentStudio (Übergabe 2026-10-24)

## Was es ist
Lokale Windows-Desktop-App für Creator mit Reitern Thumbnail, Schnitt, Planung (plus Logo und Export in Schnittprogramme).
Verallgemeinerter Nachbau von **MoinStudio** (Philips eigene App, Repo MoinMornhart/moinstudio): gleicher Funktionsumfang,
aber für jeden Creator, jede Plattform, jeden KI-Anbieter. MoinStudio ist die Quelle („Upstream“), ContentStudio zieht nach.

## Aktueller Stand (v0.7.13 auf main, letztes Release v0.7.12)
- Meilensteine M0–M7 fertig: Fundament, Creator-Profil + Assistent, KI-Schicht (Abo-CLIs, lokale Modelle, API-Schlüssel, MCP),
  Thumbnail, Schnitt, Planung, Export (Premiere/After Effects, DaVinci Resolve, CapCut, Photoshop/PSD)
- Thumbnail: freie Beschreibung, Vorbilder/Stilbuch je Kanal, Foto-Compositing, 3D-Avatar in Blender, Minecraft-Welt
  mit Skin/Posen/Mobs (Texturen aus eigener Spielinstallation), Selbstprüfung, Änderungen in Worten
- Schnitt: Transkript lokal (faster-whisper), Rohschnitt nach Stil, Wünsche in Worten, Hochformat, Timeline, Effekt-Bibliothek
- Planung: Board je Konto, Kalender-Abgleich (Apple/CalDAV, iCal), KI-Ideen, Texte je Plattform
- MoinStudio übernommen bis **v0.56.0** (siehe `UPSTREAM.md`)

## Zuletzt gemacht
- 2026-10-24 SessionStart-Hook für Cloud-Sitzungen (`.claude/hooks/skills-cloud.sh`)
- 2026-10-05 v0.7.13: MoinStudio v0.51–v0.56 nachgezogen (Kalender-Abgleich, Timeline, Zuschauen, Effekt-Ordner, Premiere-Clips)
- 2026-10-05 v0.7.8–v0.7.12: M8-Läufe, ROADMAP 8.1 und 8.2 erfüllt, leuchtende Minecraft-Schrift
- 2026-10-05 v0.7.2–v0.7.7: MoinStudio v0.37–v0.50.1 nachgezogen
- 2026-10-01 Orte (Poly Haven) und Gegenstände (Fluent Emoji 3D) als Bildelemente

## Offen / Nächste Schritte
- **M8 Qualität → 0.8.0** (`ROADMAP.md`):
  - 8.3 Jeder KI-Weg: „ohne KI“ und Test-KI erledigt; echte Wege warten auf einen Zugang (API-Schlüssel oder lokales Modell ab ~8B)
  - 8.4 Hardware: CPU- und Intel-Bericht fertig; Lauf mit eigener Grafikkarte (NVIDIA/AMD) fehlt –
    kann Philip auf seinem PC (RTX A4000) machen: Einstellungen → Hardware → Leistungsbericht
  - 8.2-Rest laut ROADMAP: Figurgröße und Leuchteffekte im Vorbild-Vergleich (Changelog meldet beides nachgezogen – Stand prüfen)
- **M9 → 1.0.0:** Politur, README mit Screenshots aller Reiter, Release 1.0.0
- Als „ungetestet“ markiert: YouTube-Upload mit echtem Konto, Premiere-Brücke (UXP-Plugin), Resolve-Export, Echttests mit API-Schlüssel
- Nachziehen: neuere MoinStudio-Versionen als v0.56.0 – ob es welche gibt, hier nicht geprüft (Ablauf: `docs/auftrag.md` Abschnitt 8)
- Offene Issues: #2 (Sicherheitslücke vite), #1 (16 Abhängigkeiten aktualisieren)
- Branch `sicherheit/fixes-2026-10-18` (nur package-lock, ohne PR); Branch `m8-bildelemente` ist veraltet (0 voraus, 55 zurück)

## Wichtige Infos
- Technik: Electron 44 + electron-vite, React 19, TypeScript 6, Vitest; Blender-Skripte (Python) in `blender/`; MCP-Server; koffi
- Start: `npm install`, dann `npm run dev`; volle Prüfung `npm run check` (typecheck, lint, test, build)
- Release: `node scripts/release.mts` (macht aus „Unreleased“ im CHANGELOG eine Version); Installer: `npm run dist`
- Versionen: Fix/kleiner Schritt = letzte Stelle, Meilenstein = mittlere Stelle; erste stabile Version 1.0.0
- Arbeitsweise laut ROADMAP: immer ein Schritt – umsetzen → testen → abhaken → Commit → Tag → CHANGELOG → Push
- Secret-Scan: `.githooks/pre-push` mit gitleaks (Hook-Pfad muss per `git config core.hooksPath .githooks` aktiv sein)
- Datenordner immer lokal (nicht in iCloud/OneDrive); Minecraft-Texturen nie ins Repo
- Persönliches aus MoinStudio (Kanäle, Namen, Testberichte) wird beim Übernehmen bewusst weggelassen

## Philips Vorgaben
- Repo **öffentlich** (MoinMornhart/contentstudio), Lizenz MIT
- Update-Funktion: ja (electron-updater, Installer für jede Version per CI)
- Git-Texte: Philip hat bei den Sicherheits-Fixes (18./19.10.2026) „Verfasst mit Claude 🤖“ in Commit-Texten festgelegt; Conventional Commits
- MoinStudio selbst läuft nur über Philips Claude-Abo (kein API-Key); ContentStudio ist anbieteroffen

---
Diese Datei wird beim Arbeiten aktuell gehalten: nach jedem größeren Schritt „Aktueller Stand“ und „Offen“ anpassen.
