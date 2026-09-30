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
