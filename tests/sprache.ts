// Tests laufen immer auf Deutsch, egal welche Sprache Windows hat (sonst weichen Meldungen auf englischen Rechnern ab).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setzeHauptSprache } from '../src/main/i18n'

setzeHauptSprache('de')

// Lokale Ablagen (z. B. die Sicherung von Konfliktkopien) im Temp statt im echten %LOCALAPPDATA%; aufraeumen.ts löscht sie
process.env['LOCALAPPDATA'] = mkdtempSync(join(tmpdir(), 'cs-lokal-'))
