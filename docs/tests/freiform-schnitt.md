# Freiform-Lauf Schnittwünsche (ROADMAP 8.1), 05.10.2026

Alle 100 Schnittwünsche aus [tests/freiform/aufgaben.json](../../tests/freiform/aufgaben.json) (5 Richtungen × 20) auf
den Testvideos (Windows-Sprachausgabe, wanderndes Testbild), KI-Weg `claude-cli` (nur Tests). Bewertet wurden die
Antwort, die gesetzten Effekte und ihre Zeitpunkte gegen die Wortzeiten des Transkripts sowie Stichproben der
gerenderten Vorschau (Bilderbogen). Die Videos liegen nur lokal.

## Ergebnis

| Richtung | gut | mittel | schwach |
|---|---|---|---|
| Minecraft-Gaming | 19 | 1 | 0 |
| Vlog | 19 | 1 | 0 |
| Kochen | 20 | 0 | 0 |
| Bildung/Tech | 19 | 1 | 0 |
| Fitness (englisch) | 20 | 0 | 0 |

**Alle fünf Richtungen überwiegend „gut“.** Zusammen mit den Thumbnails ([freiform-thumbnails.md](freiform-thumbnails.md))
ist 8.1 erfüllt.

Beispiele für Treffer: Zeitlupe genau bei „explodiert“ (37,9 s), Zutaten als Text exakt beim Aufzählen (Mehl 9,3 s,
Milch 10,2 s, Eier 11,5 s, Salz 13,9 s), „höchstens 30 Sekunden“ → 29,7 s, Countdown 3-2-1 vor der Plank,
„nur Texte, keine anderen Effekte“ eingehalten, Quiz mit Standbild und Trommelwirbel nach jeder Frage.

## Mittel

- Minecraft: „Nimm die Stelle mit dem Brot raus“ – der ganze Ausrüstungs-Satz flog raus statt nur der Teil mit dem Brot.
- Vlog und Bildung: „Titelkarte am Ende“ – es gibt nur Intro-Karten; die KI legte Text über die letzten Sekunden. Eine
  echte Abspann-Karte fehlt als Baustein (M9).

## Behoben in diesem Lauf

| Befund | Fix |
|---|---|
| „Zensier das Wort Brot“ 4 s daneben: Whisper lieferte einen Abschnitt über 41 s, die KI sah nur „0–41 s: …“ | Lange Abschnitte werden für die KI mit den Wortzeiten in Sätze geteilt (Satzende, Pause, spätestens 25 Wörter) |
| Zensur traf den Wortanfang, das Wortende blieb hörbar | Zensuren werden automatisch auf die vollen berührten Wörter ausgedehnt |
