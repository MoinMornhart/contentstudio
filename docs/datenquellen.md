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
