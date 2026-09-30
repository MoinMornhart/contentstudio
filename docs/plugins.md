# Installierte Werkzeuge und Plugins

Jede Installation, die ContentStudio oder die Entwicklung braucht, steht hier. Installationen mit Admin-Rechten, Käufe,
Anmeldungen und Lizenzannahmen passieren nur nach Rückfrage.

| Datum | Name | Version | Quelle | Zweck | Admin? |
|-------|------|---------|--------|-------|--------|
| 2026-09-30 | gitleaks | 8.30.1 | winget `Gitleaks.Gitleaks` (MIT), schon vorhanden | Secret-Scan vor jedem Push | nein |
| 2026-09-30 | npm-Pakete für die App | siehe `package-lock.json` | npmjs.com: electron 44 (MIT), electron-vite (MIT), electron-builder 26 (MIT), electron-updater (MIT), React 19 (MIT), Zod 4 (MIT), koffi (MIT), TypeScript (Apache-2.0), ESLint (MIT), Vitest (MIT) | Bauen, Testen, Laufzeit der App | nein |
| 2026-09-30 | FFmpeg (BtbN win64 GPL) | 9.0 (n9.0.2) | github.com/BtbN/FFmpeg-Builds (GPL), SHA256 aus `checksums.sha256` | Schnitt, Analyse, Encoder-Test; von ContentStudio selbst geladen nach `%LOCALAPPDATA%\ContentStudio\ffmpeg\9.0` | nein |
| 2026-09-30 | uv | 0.12.19 | github.com/astral-sh/uv (Apache-2.0/MIT), SHA256 aus `.sha256` | Python-Laufzeit für Whisper, Freistellen, Erkennung; von ContentStudio selbst geladen | nein |
| 2026-09-30 | Blender (portable ZIP) | 5.2.2 LTS, Rückfall 4.5.9 LTS | download.blender.org (GPL), SHA256 aus `blender-X.Y.Z.sha256` | 3D-Thumbnails; nur, wenn das Profil 3D braucht. Auf dem Entwicklungsrechner aus dem vorhandenen MoinStudio-Werkzeug-Ordner genutzt (kein neuer Download) | nein |
| 2026-09-30 | Mesa3D (mesa-dist-win, 2 DLLs) | 26.2.1 | github.com/pal1000/mesa-dist-win (MIT), SHA256 fest hinterlegt | Software-OpenGL für Blender auf Rechnern ohne GPU; nur vom Hardware-Test geladen | nein |
