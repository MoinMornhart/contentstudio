# Testmatrix: jede KI-Funktion mit jedem Weg und ohne KI (ROADMAP 8.3)

Stand: 30.09.2026, ContentStudio 0.7.0. Jede Funktion läuft über die KI-Schicht (`src/main/ki/schicht.ts`): Prompt und
Zod-Schema sind für alle Wege gleich, jeder Weg übersetzt sie in seine Form (JSON-Schema, „nur JSON“ mit
Reparaturschleife, Bilder nur an Wege, die Bilder sehen). Deshalb wird je Funktion einmal das Zusammenspiel geprüft
(Test-KI) und je Weg einmal echt, ob Schema, Bilder, Kosten und Limits stimmen.

Zeichen: ✓ getestet · ◐ technisch geprüft (Weg antwortet schemagerecht), Qualität offen · ○ offen (Zugang fehlt auf dem
Entwicklungsrechner) · — kann der Weg nicht (z. B. Bilder bei reinen Textmodellen).

## Funktionen

| Funktion (Auftrag) | ohne KI | Test-KI (Unit) | Bilder nötig? |
|---|---|---|---|
| Thumbnail planen (`thumbnail-plan`) | ✓ sicherer Standardaufbau (`tests/unit/thumbnail.test.ts`) | ✓ | nein |
| Thumbnail korrigieren (`thumbnail-korrektur`) | ✓ nur technische Korrekturen | ✓ | nein |
| Fotos wählen (`foto-wahl`) | ◐ erstes passendes Foto (Rückfall im Code, ohne eigenen Test) | ✓ | ja |
| Thumbnail ändern in Worten (`thumbnail-aenderung`) | ✓ Hinweis „braucht KI“ (`tests/unit/ki-ohne.test.ts`) | ✓ | optional |
| Bildbewertung (`thumbnail-pruefung`) | ✓ nur technische Prüfung (`ki-ohne`) | ✓ | ja |
| Vorbild nur für einen Auftrag (`auftrags-vorbild`) | ✓ lokale Messung (`ki-ohne`) | ✓ | ja |
| Vorbild beschreiben (`vorbild-analyse`) | ✓ lokale Messung (`tests/unit/vorbilder.test.ts`) | ✓ | ja |
| Stilbuch (`stilbuch`) | ✓ aus Messungen (`vorbilder.test.ts`, `ki-ohne`) | ✓ | nein |
| Reaction analysieren (`reaktion-analyse`) | ◐ Seite und Wort nach Angaben (Rückfall im Code) | ✓ | ja |
| Vorlage analysieren (`vorlage-analyse`) | ✓ Lage aus der erkannten Person (`tests/echt/thumbnail.test.ts`, ki: null) | ✓ | ja |
| Ideen aus dem Video (`video-ideen`) | ✓ starke Momente ohne Text (`tests/echt/thumbnail.test.ts`) | ✓ | ja |
| Rohschnitt (`rohschnitt`) | ✓ Regeln (Pausen, Füllwörter, Neuansätze) (`tests/echt/schnitt.test.ts`) | ✓ | nein |
| Schnitt-Wunsch in Worten (`schnitt-wunsch`) | ✓ Hinweis „braucht KI“ (`ki-ohne`) | ✓ | optional (Sichtbogen) |
| Titel/Text/Kapitel beim Export (`schnitt-texte`) | ✓ Projektname als Titel (`schnitt.test.ts`) | ✓ | nein |
| Höhepunkte (`highlights`) | ✓ laute Momente (`tests/unit/schnitt-highlights.test.ts`) | ✓ | nein |
| Ideen (`planung-ideen`) | ✓ Hinweis „braucht KI“ (`ki-ohne`) | ✓ 10 je Konto (`planung-ideen.test.ts`) | nein |
| Titelvorschläge (`planung-titel`) | ✓ Hinweis | ✓ | nein |
| Wochenplan (`planung-woche`) | ✓ Hinweis | ✓ | nein |

## Wege

| Weg | Schema/Reparatur | Bilder | Kosten/Limits | Echter Test |
|---|---|---|---|---|
| llama.cpp (lokal) | ◐ `tests/echt/ki-lokal.test.ts` (Qwen2.5 0,5B) | — (Textmodell) | kostenlos | ◐ technisch; Qualität mit 0,5B nicht aussagekräftig |
| Ollama (lokal) | gleiche Schnittstelle wie llama.cpp | je nach Modell | kostenlos | ○ nicht installiert |
| LM Studio (lokal) | gleiche Schnittstelle wie llama.cpp | je nach Modell | kostenlos | ○ nicht installiert |
| Anthropic API (eigener Schlüssel) | natives JSON-Schema | ✓ | Kostenfrage vor Aufruf, Monatsbudget | ○ Schlüssel fehlt |
| OpenAI API (eigener Schlüssel) | natives JSON-Schema | ✓ | wie oben | ○ Schlüssel fehlt |
| OpenRouter (eigener Schlüssel) | je Modell | je Modell | wie oben | ○ Schlüssel fehlt |
| Gemini API (eigener Schlüssel, bezahlt) | natives JSON-Schema | ✓ | wie oben | ○ Schlüssel fehlt |
| Codex CLI (ChatGPT-Anmeldung) | „nur JSON“ + Reparatur | ✓ | Abo des Nutzers | ○ keine Anmeldung auf der VM |
| MCP-App (Claude Desktop, ChatGPT Desktop) | Werkzeuge statt Prompts | über `job_image` | Abo des Nutzers | ✓ Werkzeuge im Unit-Test (`mcp`), ○ mit echter Desktop-App |

## Was noch fehlt

Echte Durchläufe mit mindestens einem starken Weg (API-Schlüssel oder lokales Modell ab ~8B) über alle Funktionen. Der
Lauf ist vorbereitet (`tests/echt/freiform.test.ts`, ROADMAP 8.1) und schreibt je Weg eine Ergebnisdatei; diese Tabelle
wird danach nachgetragen.
