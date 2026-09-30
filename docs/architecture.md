# Architektur

Grundlage ist die Architektur von MoinStudio (`docs/architecture.md` dort, MIT). Hier steht, was ContentStudio gleich
macht und was es verallgemeinert.

## 1. Framework: Electron

Electron + electron-vite + React + TypeScript, Installer mit electron-builder 26.x (NSIS, pro Benutzer, ohne
Admin-Rechte), Selbst-Update mit electron-updater über GitHub-Releases. Gründe wie bei MoinStudio: baubar ohne
Admin-Rechte und ohne Rust/MSVC, MCP-Server, Aufgaben und Oberfläche in einer Sprache, Updates ohne
Signatur-Infrastruktur (SHA-512 bleibt aktiv).

## 2. Prozesse

```
ContentStudio.exe (Electron Main, TypeScript)
 ├─ Renderer (React): Reiter Thumbnail | Schnitt | Planung | Einstellungen, Einrichtungsassistent
 ├─ Aufgaben (persistente Warteschlange, immer eine Rechen- bzw. KI-Last zur Zeit, Pause hält Prozesse wirklich an)
 │    ├─ blender.exe -b …          (nur wenn 3D gebraucht wird)
 │    ├─ ffmpeg.exe / ffprobe.exe  (Schnitt, Analyse)
 │    ├─ Python-Worker über uv     (Whisper, Freistellen, Erkennung – ONNX nach Hardware-Profil)
 │    └─ KI-Anbieter               (ab ROADMAP M3: offizielle CLIs, lokale Modelle, API-Schlüssel)
 ├─ Named Pipe \\.\pipe\contentstudio-<benutzer> (JSON-Zeilen + Zufallstoken)
 └─ electron-updater (GitHub-Releases)
```

## 3. Sprache der Oberfläche

- Alle Texte stehen in `src/shared/i18n/de.ts` (Referenz) und `en.ts`. TypeScript und ein Unit-Test erzwingen gleiche
  Schlüssel und Platzhalter; ein zweiter Test sucht mit dem TypeScript-Parser nach festen Texten in `.tsx`-Dateien.
- Die Oberfläche nutzt `useT()`, der Hauptprozess `t()` aus `src/main/i18n.ts` (für Aufgaben-Schritte und
  Fehlermeldungen).
- Die Sprache kommt aus den Geräte-Einstellungen, sonst aus der Systemsprache von Windows (Deutsch → Deutsch, alles
  andere → Englisch). Neue Sprache = neues Wörterbuch.
- Hinweise, die gespeichert werden (z. B. im Hardware-Profil), stehen als Schlüssel mit Werten im Profil, damit ein
  Sprachwechsel auch alte Einträge übersetzt.

## 4. Speicherorte

| Ort | Inhalt |
|-----|--------|
| `%LOCALAPPDATA%\Programs\ContentStudio\` | App (Installer) |
| `%LOCALAPPDATA%\ContentStudio\` | Werkzeuge (`bl\`, `ffmpeg\`, `uv\`, `mesa\`), `py\`, `jobs\`, `renders\`, `hwtest\`, Caches |
| `%APPDATA%\ContentStudio\` | `settings.json` (Datenordner, Sprache, Einrichtung), `device-profile.json`, `pipe.json`, `logs\` |
| **Datenordner** (frei wählbar) | `contentstudio-data.json`, `profil\`, `avatare\`, `freunde\`, `marke\`, `vorbilder\`, `thumbnails\`, `projekte\`, `planning\cards\` |

Der Datenordner darf in OneDrive, iCloud Drive, Dropbox oder Google Drive liegen:

- Schreiben ist atomar (temporäre Datei + Umbenennen, mit Wiederholung bei kurzen Sperren).
- Konfliktkopien werden erkannt: OneDrive `name-GERÄT.json`, iCloud `name 2.json`, Dropbox
  `name (… conflicted copy …).json` bzw. `name (Konfliktkopie …).json`, Google Drive `name (1).json`.
  `liesMitKonfliktkopien` legt die jüngste gültige Fassung wieder unter dem richtigen Namen ab.
- Caches und Downloads (`cache`, `downloads`, `mc`, Temp-Ordner der Dienste) werden nicht durchsucht und gehören nicht
  in den Datenordner.

Das Geräteprofil liegt nie im Datenordner, weil jedes Gerät anders ist.

## 5. Hardware-Test

Wie MoinStudio: erkennen (CPU, RAM, GPUs mit VRAM aus der Registry), messen (Blender-Engines, Video-Encoder), festlegen
(Geräteprofil mit Rückfall-Kette bis zur reinen CPU). Unterschiede:

- **Blender nur bei Bedarf:** Der Test lädt und misst Blender nur, wenn das Profil 3D braucht (Spiel-Avatar, 3D-Modell,
  3D-Szene). Sonst steht im Profil „übersprungen“, und der Test wird nachgeholt, sobald 3D dazukommt.
- **ONNX-Anbieter:** CUDA (NVIDIA ab 4 GB), DirectML (andere echte GPUs), sonst CPU. Gemessen wird beim ersten Einsatz;
  scheitert der GPU-Weg dort, fällt die Aufgabe auf die CPU zurück.
- Hinweise sind übersetzbare Schlüssel (Format 2 des Geräteprofils; ältere Profile lösen einen neuen Test aus).

## 6. Werkzeuge

FFmpeg und uv sind Grundwerkzeuge, Blender ist optional (3D). Alles wird ohne Admin-Rechte nach
`%LOCALAPPDATA%\ContentStudio` geladen und vor dem Entpacken per SHA256 aus der Prüfsummendatei des Herstellers geprüft.
`CONTENTSTUDIO_TOOLS_DIR` zeigt für Entwicklungsrechner mit wenig Platz auf einen anderen, bereits geprüften
Werkzeug-Ordner.

## 7. Start ohne Oberfläche

| Schalter | Wirkung |
|---|---|
| `--cs-tools=install` / `install-all` | Grundwerkzeuge (bzw. auch Blender) installieren und testen |
| `--cs-hwtest` (`--cs-hwtest-blender`) | Hardware-Test (mit Blender erzwungen) |
| `--cs-probe` | Integrationstest der Aufgaben: Probebild, pausieren, fortsetzen |
| `--cs-update=check` / `install` | Update prüfen bzw. installieren |
| `--cs-autostart=on` / `off` | Autostart setzen |
| `--cs-screenshot=<ordner>` (`--cs-screenshot-setup`, `--cs-sprache=en`) | Aufnahmen aller Reiter bzw. des Assistenten |

Wichtig: Manche Umgebungen (z. B. Erweiterungen von VS Code) setzen `ELECTRON_RUN_AS_NODE=1`. Dann startet Electron als
reines Node und lehnt die Schalter ab (Exit 9). `npm start` und `scripts/electron.mjs` entfernen die Variable.

## 8. KI-Schicht

Ein Auftrag, viele Anbieter (`src/main/ki/`). Welche Wege erlaubt sind und warum: [ki-anbieter.md](ki-anbieter.md).

- **Auftrag** (`KiAuftrag`): Systemtext, Prompt, optionale Bilder, Zod-Schema, Stufe (`schnell`/`stark`). Aus dem Zod-Schema
  entsteht das JSON-Schema für den Anbieter.
- **Anbieter** (`KiAnbieter`): `pruefe()` (installiert, angemeldet – ohne Zugangsdaten zu lesen), `faehigkeiten`, `frage()`,
  bei API-Schlüsseln `preis()`. Vorhanden: Ollama, LM Studio, llama.cpp (lokal), ChatGPT über die Codex-CLI (Abo),
  Anthropic (offizielles SDK), OpenAI, Google Gemini, OpenRouter (eigene Schlüssel).
- **Schicht** (`KiSchicht`): immer nur ein Auftrag gleichzeitig; Wege in der Reihenfolge des Profils; nicht bereite Wege,
  Limits und Fehler führen zum nächsten Weg; Anbieter ohne Schema bekommen „nur JSON“ und bis zu zwei Reparaturrunden mit
  den Zod-Fehlern; sind alle Wege am Limit, wartet die Aufgabe bis zum frühesten Reset.
- **Kosten:** vor jedem Aufruf mit API-Schlüssel die Schätzung zur Freigabe (Anthropic-Preise aus der offiziellen Liste,
  andere aus der öffentlichen OpenRouter-Modellliste), danach Buchung der echten Nutzung in die Monatssumme.
- **Schlüssel:** Electron `safeStorage` (Windows DPAPI) in `%APPDATA%\ContentStudio\ki-schluessel.json`, nie im
  Datenordner, nie in Protokollen (`ohneSchluessel` schwärzt Fehlertexte).
- **Datenschutz:** Vor dem ersten Senden an einen Weg zeigt die App, was wohin geht; ohne Zustimmung wird nichts gesendet.
- **MCP:** `src/mcp/` (stdio) mit Werkzeugen für Status und Aufgaben; Claude Desktop wird mit Sicherung automatisch
  eingetragen, ChatGPT Desktop mit Anleitung zum Selbst-Eintragen. Funktionen der späteren Meilensteine kommen als weitere
  Werkzeuge dazu.
