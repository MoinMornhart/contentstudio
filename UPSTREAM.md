# Upstream

Quelle: https://github.com/MoinMornhart/moinstudio
Zuletzt übernommen: v0.36.2 (Commit cece641) am 2026-09-30

Der Neubau beruht auf MoinStudio v0.36.2. Neuere MoinStudio-Versionen werden nach dem Ablauf in
[docs/auftrag.md](docs/auftrag.md), Abschnitt 8, nachgezogen. Nichts wird stillschweigend ausgelassen: Was nicht
übernommen wird, steht mit Begründung in der Tabelle.

| MoinStudio | Art | Entscheidung | ContentStudio |
|---|---|---|---|
| v0.36.2 und älter | alles | Grundlage des Neubaus, verallgemeinert nach ROADMAP | ab v0.1.0 |
| v0.36.2 und älter: `config/channels.yaml` | Philip-spezifisch | übersprungen: Philips Kanäle; ersetzt durch Konten im Creator-Profil | – |
| v0.36.2 und älter: `scripts/progress.mts`, Werkstatt-/Fortschrittsseite | Philip-spezifisch | übersprungen: Philips Fernkontrolle | – |
| v0.36.2 und älter: `docs/tests/*`, Screenshots | Philip-spezifisch | übersprungen: Testberichte mit Philips Daten; ContentStudio schreibt eigene | – |
| v0.36.2 und älter: `.github/workflows/vibeworks-check.yml` | Philip-spezifisch | übersprungen: an Philips VibeWorks gebunden | – |
| v0.36.2 und älter: `config/vorbilder.json`, `docs/research/stilbuch.md` | Richtungsspezifisch | übernommen als Beispiel-Stilbuch der Richtung „Minecraft“, nur Regeln und öffentliche Titel, keine Bilder | ab v0.4.0 |
