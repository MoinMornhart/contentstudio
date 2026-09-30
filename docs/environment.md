# Entwicklungsumgebung

Stand: 2026-09-30. Rechner, auf dem ContentStudio gebaut wird.

| Punkt | Befund | Folge |
|-------|--------|-------|
| Windows | Windows 11 Pro 10.0.26200 | ok |
| Hardware | QEMU-VM, 16 GB RAM, **keine GPU** (Microsoft Basic Display Adapter) | GPU-Wege nicht testbar; CPU-Weg mit Software-OpenGL wird hier geprüft |
| CPU | ohne RDTSCP | Blender 5.2 stürzt ab, der Hardware-Test fällt auf 4.5 LTS zurück |
| Speicher C: | sehr knapp (2–3 GB frei) | Blender wird für Tests aus dem vorhandenen MoinStudio-Werkzeug-Ordner genutzt (`CONTENTSTUDIO_TOOLS_DIR`), keine großen Modelle |
| Arbeitskopie | im iCloud-Drive-Ordner (Wunsch des Besitzers) | `node_modules` wird mit synchronisiert |
| Node / npm | 24.19 / 11.17 | npm 11 führt Installationsskripte nicht selbst aus: nach `npm install` einmal `node node_modules/electron/install.js` |
| git, gh, gitleaks, uv | vorhanden | gitleaks im `pre-push`-Hook |
| KI | Claude Code (VS-Code-Erweiterung, Abo) | andere Anbieter hier nicht angemeldet → „ungetestet“, bis ein Mensch sie auf seinem Rechner prüft |
| Adobe, DaVinci Resolve, CapCut | nicht installiert | Exporte bleiben „ungetestet“ |

`ELECTRON_RUN_AS_NODE=1` ist in Sitzungen aus VS Code gesetzt. Die App daher immer über `npm start` bzw.
`node scripts/electron.mjs . <schalter>` starten, oder die Variable vorher entfernen.
