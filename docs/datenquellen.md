# Datenquellen außerhalb des Rechners

ContentStudio holt nur Daten aus dem Netz, wenn der Nutzer es in dem Moment ausdrücklich auslöst. Hier steht jede
Quelle, was dabei gesendet wird und warum der Weg erlaubt ist. Stand: 2026-09-30.

## Werkzeuge

Blender, FFmpeg, uv und Mesa kommen von den offiziellen Download-Seiten und werden per SHA256 geprüft
(siehe [plugins.md](plugins.md)). Gesendet wird nur die Anfrage nach der Datei.

## Minecraft-Skin per Accountname

- Quelle: öffentliche Mojang-Schnittstellen `api.mojang.com/users/profiles/minecraft/<name>` und
  `sessionserver.mojang.com/session/minecraft/profile/<uuid>`, danach das Skin-Bild von `textures.minecraft.net`.
- Gesendet: nur der eingegebene Name. Keine Anmeldung.
- Warum erlaubt: dokumentierte, öffentliche Schnittstellen ohne Schlüssel, die genau für das Nachschlagen von Profilen
  und Skins da sind; ein Aufruf pro Knopfdruck.

## Öffentliche Kanal-Daten (YouTube)

Nur nach Zustimmung im Assistenten („Ich möchte, dass ContentStudio einmalig … abruft“) und nur auf Knopfdruck.

1. **Mit eigenem Google-API-Schlüssel** (ab den KI-Einstellungen in ROADMAP M3): offizielle YouTube Data API v3
   (`channels`, `playlistItems`, `videos`) mit dem Schlüssel des Nutzers. Liefert Titel, Thumbnails, Datum und Länge.
   Das ist der saubere Weg für jede Nutzung; das kostenlose Tageskontingent reicht bei Weitem.
2. **Ohne Schlüssel:** ein Abruf der öffentlichen Kanalseite (um aus `@handle` die Kanal-ID zu lesen) und ein Abruf des
   öffentlichen RSS-Feeds `youtube.com/feeds/videos.xml?channel_id=…`. Liefert Titel, Thumbnails und Datum der letzten
   15 Videos, keine Längen.
   - Die `robots.txt` von YouTube schließt `/feeds/videos.xml` für Crawler aus. ContentStudio crawlt nicht: Es ruft
     genau einen Feed auf, weil der Nutzer es für seinen eigenen Kanal ausdrücklich verlangt, so wie ein Feed-Reader.
     Es gibt keinen Abruf im Hintergrund und keine Wiederholung.
   - Der Cookie `SOCS=CAI` verhindert nur die Umleitung auf die Einwilligungsseite in der EU. Er enthält keine Daten
     des Nutzers.
   - Wer das nicht möchte, lässt den Haken weg oder nutzt Weg 1.
- **Andere Plattformen** (Twitch, Kick, TikTok, Instagram, Facebook, X): Ohne Anmeldung gibt es dort keine erlaubte
  Schnittstelle. ContentStudio speichert nur den Link. Scraping findet nicht statt.

Die Daten landen im Creator-Profil im Datenordner des Nutzers und werden nirgendwohin weitergegeben.

## Minecraft-Texturen, Modelle und Mobs (Thumbnail, ROADMAP 4.3)

Nichts davon liegt im Repo oder im Installer. Alles kommt zur Laufzeit in einen lokalen Zwischenspeicher
(`%LOCALAPPDATA%\ContentStudio\mc`), nie in den Datenordner:

1. **Spielinstallation des Nutzers:** Die zuletzt gespielte Java-Version aus `%APPDATA%\.minecraft\versions`. Daraus
   werden nur Texturen, Schrift, Blockmodelle und Blockzustände entpackt.
2. **Offizielle Spieldatei von Mojang:** Nur wenn keine Installation gefunden wird und die Person in den Einstellungen
   bestätigt hat, dass sie Minecraft besitzt. Dann lädt ContentStudio dieselbe Datei, die auch der offizielle
   Launcher lädt (`piston-meta.mojang.com`, per SHA1 geprüft).
3. **Mobs:** Geometrie, Texturen und Grundhaltung aus Mojangs öffentlichem Repository `Mojang/bedrock-samples`
   (Zweig `preview`), beim ersten Gebrauch importiert. MoinStudios geprüfte Mob-Tabelle wird bewusst nicht mitgeliefert.
4. **Skins:** vom Nutzer hochgeladen oder per Accountname (siehe oben).

## Vorbilder per Video-Link (ROADMAP 4.1)

- Nur das öffentliche Thumbnail (`i.ytimg.com/vi/<id>/…`) und Titel samt Kanalname über YouTubes öffentliches
  oEmbed (`youtube.com/oembed`), ohne Anmeldung und ohne API-Schlüssel, nur wenn der Creator den Link selbst einfügt.
- Das Bild bleibt im Datenordner des Creators als persönliche Stil-Referenz, wird nie veröffentlicht und lässt sich
  jederzeit löschen. Aus Vorbildern wird nie etwas ins Thumbnail kopiert (keine Logos, Texte, Figuren, Bildteile).

## 3D-Requisiten (Vorlagen-Modus, ROADMAP 4.5)

- Hält die Person in einer Vorlage einen Gegenstand, sucht ContentStudio ein passendes Modell bei Poly Haven
  (`api.polyhaven.com`, alle Inhalte CC0) und lädt es in den lokalen Werkzeug-Ordner. Jede Datei wird mit Quelle und
  Lizenz in `props/lizenzen.md` protokolliert.

## Spracherkennung (Schnitt, ROADMAP 5.1)

- Das Transkript entsteht lokal mit faster-whisper; Ton und Text verlassen den Rechner nicht. Einmalig lädt
  ContentStudio das passende Whisper-Modell von Hugging Face (`huggingface.co/Systran`, MIT, ohne Anmeldung).
- An die KI geht nur Text (Transkript mit Zeiten), und nur, wenn ein KI-Weg eingerichtet ist und der Creator einen
  Schnitt, Wunsch oder Text anfordert. Standbilder für den Sichtbogen gehen nur an eine Bild-KI, wenn es eine gibt.

## Plattform-Vorgaben für den Export (ROADMAP 5.7)

Die Grenzen je Plattform stehen an einer Stelle (`PLATTFORM_VORGABEN` in `src/shared/schnitt.ts`), Stand 30.09.2026,
aus den öffentlichen Hilfeseiten der Plattformen. Es wird nichts abgefragt; ändert eine Plattform ihre Regeln, wird nur
diese Tabelle angepasst.

| Plattform | Format | Längste Länge | Titel | Text | Kapitel |
|---|---|---|---|---|---|
| YouTube | 16:9 | 12 h | 100 Zeichen | 5000 | ja (ab 0:00, mind. 3, je ≥ 10 s) |
| YouTube Shorts | 9:16 | 3 min | 100 | 5000 | nein |
| TikTok | 9:16 | 10 min | – (nur Text) | 4000 | nein |
| Instagram Reels | 9:16 | 3 min | – (nur Text) | 2200 | nein |
| Facebook | 16:9 | 4 h | 255 | 5000 | nein |
| X | 16:9 | 2:20 min | – (nur Text) | 280 | nein |
| Twitch, Kick | 16:9 | 48 h | 140 | 5000 | nein |
| Podcast | nur Ton (M4A, AAC) | – | 200 | 4000 | ja (im Audio) |
| Website, Andere | 16:9 | – | 200 | 5000 | Website ja |

Technisch prüft der Export jede Datei nach der Upload-Empfehlung: H.264 High, 4:2:0, BT.709, Fast Start, AAC 48 kHz.

## Hochladen zu YouTube (optional, ROADMAP 6.5)

- Standard: ContentStudio lädt nichts hoch. Das Upload-Paket (Video, Thumbnail, Texte) entsteht lokal.
- Nur wenn der Creator es in den Einstellungen selbst einrichtet: Anmeldung über Googles offizielle OAuth-Seite
  (`accounts.google.com`, mit PKCE) mit einem eigenen OAuth-Client des Creators. ContentStudio erhält nur das Recht
  `youtube.upload` und sieht nie das Passwort. Das Erneuerungs-Token liegt verschlüsselt (Windows DPAPI) in
  `%APPDATA%\ContentStudio`, nie im synchronisierten Datenordner; „Trennen“ löscht es und widerruft es bei Google.
- Beim Hochladen gehen Video, Titel, Text, Tags und Thumbnail an die YouTube Data API (`www.googleapis.com/upload/…`).
  Das Video ist immer privat; mit Termin veröffentlicht YouTube es selbst zu diesem Zeitpunkt.

## Textregeln je Plattform (Planung, ROADMAP 6.3)

Empfohlene Titellänge und Hashtags stehen in `TEXT_REGELN` (`src/shared/planung.ts`), Stand 30.09.2026 aus den
Hilfeseiten der Plattformen: YouTube Titel ≤ 60 (Grenze 100), bis 3 Hashtags im Text; Shorts 1–3 Hashtags im Titel;
TikTok und Reels ohne eigenen Titel, 3–5 Hashtags im Text; X bis 2; Twitch, Kick, Podcast, Website ohne Hashtags.

## Orte und Gegenstände im Thumbnail (Richtungen ohne eigene Engine, ROADMAP 8.1)

- **Orte:** Fotos (Backplates) von [Poly Haven](https://polyhaven.com), Lizenz CC0. Die Liste kommt von
  `api.polyhaven.com/assets?t=hdris` (nur Einträge mit dem Schlagwort `backplates`) und liegt 30 Tage im
  Werkzeugordner (`bilder/orte/orte.json`). Ein Foto wird erst geladen, wenn ein Thumbnail diesen Ort nutzt, und mit
  der MD5-Prüfsumme der API geprüft. Keine Anmeldung, es werden nur der Ortsname und die Datei-ID abgefragt.
- **Gegenstände:** 3D-Emoji aus [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), Lizenz MIT,
  direkt von `raw.githubusercontent.com`. Nur Namen aus Kleinbuchstaben, Ziffern, Leerzeichen und Bindestrich werden
  angefragt. Geladene Bilder bleiben im Werkzeugordner (`bilder/emoji`).
- Beides liegt nie im Repo oder Installer. Fehlt das Netz oder ein Bild, nimmt ContentStudio den Farbverlauf bzw. lässt
  den Gegenstand weg und sagt es in den Hinweisen des Auftrags.
