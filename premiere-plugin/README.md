# ContentStudio Bridge (Premiere Pro) – ungetestet

UXP-Plugin für Premiere Pro (ab 25.6), übernommen aus MoinStudio v0.47.0. Es verbindet sich als WebSocket-Client mit
ContentStudio (nur `127.0.0.1:47812`) und kennt nur feste Befehle: Projekt anlegen oder öffnen, Dateien importieren,
Sequenzen auflisten und aktivieren, speichern, exportieren. Jeder Befehl muss den Zufallsschlüssel mitbringen, den
ContentStudio bei jedem Start in `%LOCALAPPDATA%\ContentStudio\premiere\schluessel` ablegt. Einen Befehl für beliebigen
Code gibt es bewusst nicht.

**Stand:** ungetestet – ohne Premiere-Installation nicht prüfbar. Die Gegenstelle in ContentStudio
(`src/main/premiere/`) ist mit einem nachgebauten Plugin getestet, aber noch nicht in der App eingeschaltet.

Installieren (für Entwickler): Adobe „UXP Developer Tool“ öffnen → „Add Plugin“ → `contentstudio-bridge/manifest.json`
wählen → „Load“. In Premiere erscheint das Panel unter Fenster → UXP-Plugins → ContentStudio.
