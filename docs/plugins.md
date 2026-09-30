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
| 2026-09-30 | @anthropic-ai/sdk (npm) | 0.129 | npmjs.com (MIT) | Offizielles SDK für den Weg „Anthropic API“ mit eigenem Schlüssel | nein |
| 2026-09-30 | @modelcontextprotocol/server, @modelcontextprotocol/client (npm) | 2.2 | npmjs.com (MIT) | MCP-Server für Desktop-Apps; Client nur für Tests und `scripts/mcp-probe.mts` | nein |
| 2026-09-30 | llama.cpp (win-cpu-x64) | b11284 | github.com/ggml-org/llama.cpp (MIT) | Nur Entwicklung: echter Test des lokalen KI-Weges; liegt unter `%LOCALAPPDATA%\ContentStudio-dev\llamacpp`, nie im Repo oder Installer | nein |
| 2026-09-30 | Modell Qwen2.5-0.5B-Instruct (GGUF, Q4_K_M) | – | huggingface.co/Qwen (Apache-2.0), ohne Konto, 491 MB | Nur Entwicklung: winziges Modell für den Echttest des lokalen Weges; neben llama.cpp abgelegt | nein |
