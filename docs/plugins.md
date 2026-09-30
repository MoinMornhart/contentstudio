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
| 2026-09-30 | pngjs, jpeg-js, ag-psd (npm) | 7.0, 0.4, 31.0 | npmjs.com (MIT, BSD-3-Clause, MIT) | Bilder ohne Zusatzprogramme lesen und schreiben (Analyse, Farbübertragung, Formate), PSD mit Ebenen | nein |
| 2026-09-30 | Python-Pakete der Bild-Umgebung: rembg 2.0, onnxruntime, opencv-python-headless, pillow, numpy | aktuell bei Einrichtung | pypi.org (MIT, MIT, Apache-2.0, MIT-CMU, BSD) über uv, ohne Paket-Cache | Freistellen, Gesichter finden, Compositing, Text; von ContentStudio beim ersten Foto-Thumbnail eingerichtet (ca. 700 MB) | nein |
| 2026-09-30 | Modelle u2net_human_seg und isnet-general-use | – | github.com/danielgatis/rembg Releases (Apache-2.0/MIT), je ca. 176 MB | Personen bzw. Figuren freistellen; von rembg beim ersten Gebrauch geladen | nein |
| 2026-09-30 | Gesichtsmodell YuNet (face_detection_yunet_2023mar.onnx) | 2023mar | github.com/opencv/opencv_zoo (MIT), 227 KB, SHA-256 fest hinterlegt | Gesichter finden (Größe, Text nie über Gesichtern); von ContentStudio beim ersten Gebrauch geladen | nein |
| 2026-09-30 | Modell LaMa (lama_fp32.onnx) | – | huggingface.co/Carve/LaMa-ONNX (Apache-2.0), 208 MB | Vorlagen-Modus: Lücke der entfernten Person auffüllen; nur beim ersten Vorlagen-Auftrag geladen | nein |
| 2026-09-30 | Testfotos (5 Porträts) | – | Wikimedia Commons, CC0 (Liste in `tests/fixtures/testfotos.json`) | Nur Entwicklung: echte Tests der Foto-Engine; liegen unter `%LOCALAPPDATA%\ContentStudio\test-fotos`, nie im Repo | nein |
| 2026-09-30 | faster-whisper (Python) | 1.2 | pypi.org (MIT) über uv in die Python-Umgebung | Transkript lokal ohne Cloud (Schnitt, ROADMAP 5.1); bei NVIDIA-GPU zusätzlich nvidia-cublas-cu12 und nvidia-cudnn-cu12 (NVIDIA-Lizenz, frei weitergebbar) | nein |
| 2026-09-30 | Whisper-Modelle (Systran/faster-whisper-base, -small, -medium, -large-v3-turbo) | – | huggingface.co/Systran (MIT), ohne Konto, 145 MB bis 1,6 GB | Spracherkennung; Größe nach Hardware-Profil, beim ersten Transkript geladen | nein |
| 2026-09-30 | Windows-Sprachausgabe (System.Speech, Stimmen Hedda/Zira) | – | Teil von Windows | Nur Entwicklung: Sprache der Testvideos im echten Schnitt-Test, nichts wird installiert | nein |
