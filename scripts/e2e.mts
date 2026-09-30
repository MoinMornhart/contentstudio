// Ende-zu-Ende-Durchlauf in der echten App, mit eigenem Einstellungs- und Datenordner (nichts vom Nutzer wird berührt).
//
//   node scripts/e2e.mts <schritte.json> [--assistent] [--sprache=de] [--daten=<ordner>]
//
// Baut vorher nicht selbst (erst `npm run build`). Legt einen Ordner unter test-output/e2e/<zeit>/ an mit:
//   ud/       Einstellungsordner der App (settings.json, Geräteprofil, Protokolle)
//   daten/    Datenordner (creator-profile.json, Bilder …); mit --daten vorher aus einem vorbereiteten Ordner kopiert
//   bilder/   Aufnahmen und schritte.json (Rückgaben der JavaScript-Schritte)
// Gibt am Ende den Pfad des Laufs aus; der Aufrufer prüft Profil und Bilder.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

const args = process.argv.slice(2)
const schritte = args.find((a) => !a.startsWith('--'))
if (!schritte) {
  console.error('Aufruf: node scripts/e2e.mts <schritte.json> [--assistent] [--sprache=de] [--daten=<ordner>]')
  process.exit(2)
}
const sprache = args.find((a) => a.startsWith('--sprache='))?.split('=')[1] ?? 'de'
const vorlage = args.find((a) => a.startsWith('--daten='))?.split('=').slice(1).join('=')
const lauf = resolve('test-output', 'e2e', new Date().toISOString().replace(/[:.]/g, '-'))
const ud = join(lauf, 'ud')
const daten = join(lauf, 'daten')
mkdirSync(ud, { recursive: true })
mkdirSync(daten, { recursive: true })
if (vorlage) cpSync(vorlage, daten, { recursive: true })
writeFileSync(join(ud, 'settings.json'), JSON.stringify({ format: 1, dataDir: daten, setupCompleted: !args.includes('--assistent'), sprache }))

const env: NodeJS.ProcessEnv = { ...process.env, CS_USERDATA: ud, CS_SCREENSHOT_SCHRITTE: resolve(schritte) }
delete env['ELECTRON_RUN_AS_NODE']
const schalter = ['.', `--cs-screenshot=${join(lauf, 'bilder')}`, `--cs-sprache=${sprache}`, ...(args.includes('--assistent') ? ['--cs-screenshot-setup'] : [])]
const r = spawnSync(electronPath as unknown as string, schalter, { env, stdio: 'inherit', timeout: 20 * 60 * 1000 })
console.log(lauf)
process.exit(r.status ?? 1)
