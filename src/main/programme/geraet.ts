// Herkunft: MoinStudio src/main/adobe/premiere-export.ts und premiere-auffrischen.ts (MIT, v0.47.1, v0.47.2, v0.48.3),
// erweitert auf alle Schnittprogramme und Dropbox/Google Drive.
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { t } from '../i18n'

/** Liegt der Pfad in einem Ordner, den ein Sync-Dienst auf jedes Gerät bringt? */
const GETEILTER_ORDNER = /[\\/](icloud ?drive|onedrive[^\\/]*|dropbox[^\\/]*|google drive|my drive|meine ablage)[\\/]/i

/**
 * Rohvideo für Schnittprogramme auf diesem Gerät finden. Sonst verlinkt die Sequenz den Pfad des Geräts, auf dem das
 * Video importiert wurde – auf dem anderen Gerät zeigt Premiere „Media offline“. Reihenfolge: Kopie im Projektordner
 * (quelle/), Originalpfad, derselbe Teil ab „schnitt/<id>“ im Datenordner, gleicher Name im Projektordner. Liegt das
 * Video außerhalb des Datenordners und außerhalb eines geteilten Ordners, wird es einmal in den Projektordner kopiert,
 * damit es mit dem Datenordner auf jedes Gerät kommt. Gleiche Größe = dieselbe Datei.
 */
export async function quelleFuerProgramme(daten: string, ordner: string, pfad: string, groesse: number): Promise<string> {
  const kopie = join(ordner, 'quelle', `video${extname(pfad).toLowerCase() || '.mp4'}`)
  const passt = async (f: string): Promise<boolean> => (await stat(f).catch(() => null))?.size === groesse
  if (await passt(kopie)) return kopie
  const ueberall = !relative(resolve(daten), resolve(pfad)).startsWith('..') || GETEILTER_ORDNER.test(pfad)
  if (existsSync(pfad) && (await passt(pfad))) {
    if (ueberall) return pfad
    await mkdir(join(ordner, 'quelle'), { recursive: true })
    await copyFile(pfad, `${kopie}.teil`)
    await rename(`${kopie}.teil`, kopie)
    return kopie
  }
  // Pfad eines anderen Geräts im selben (geteilten) Datenordner: den Teil ab „schnitt/<id>“ hier anhängen
  const teile = pfad.replace(/\\/g, '/').split('/')
  const ab = teile.lastIndexOf('schnitt')
  if (ab >= 0) {
    const hier = join(daten, ...teile.slice(ab))
    if (await passt(hier)) return hier
  }
  const gleichNamig = join(ordner, basename(pfad.replace(/\\/g, '/')))
  if (await passt(gleichNamig)) return gleichNamig
  throw new Error(t('programme.fehler.quelleFehlt', { name: basename(pfad.replace(/\\/g, '/')), pfad }))
}

/** Datei-Pfade, auf die eine Programmdatei zeigt: Premiere-XML (<pathurl>), FCPXML (src="file:///…"), AE-Skript (QUELLE) */
export function verlinktePfade(text: string): string[] {
  const url = (u: string): string => decodeURIComponent(u.replace(/&amp;/g, '&'))
  return [
    ...[...text.matchAll(/<pathurl>file:\/\/localhost\/([^<]+)<\/pathurl>/g)].map((m) => url(m[1]!)),
    ...[...text.matchAll(/src="file:\/\/\/([^"]+)"/g)].map((m) => url(m[1]!)),
    ...[...text.matchAll(/var QUELLE = "((?:[^"\\]|\\.)*)";/g)].map((m) => JSON.parse(`"${m[1]!}"`) as string)
  ]
}

const ENDUNG = { '.xml': 'premiere', '.fcpxml': 'resolve', '.jsx': 'aftereffects' } as const
export type DateiProgramm = (typeof ENDUNG)[keyof typeof ENDUNG]

/**
 * Beim Start: Jede Programmdatei im Datenordner, die auf Dateien zeigt, die es auf diesem Gerät nicht gibt (Pfade des
 * anderen Geräts), wird mit den Pfaden dieses Geräts neu geschrieben – so öffnet man die Datei im Projektordner auf
 * PC und Laptop direkt. Ältere Dateien desselben Programms unter anderem Namen (nach Umbenennen) werden entfernt.
 */
export async function programmeAuffrischen(
  daten: string,
  schreibe: (daten: string, id: string, ziel: DateiProgramm) => Promise<{ datei: string; weitere: string[] }>,
  melde: (text: string) => void = () => undefined
): Promise<number> {
  const schnitt = join(daten, 'schnitt')
  let erneuert = 0
  for (const id of await readdir(schnitt).catch(() => [] as string[])) {
    const ordner = join(schnitt, id, 'programme')
    const namen = await readdir(ordner).catch(() => [] as string[])
    for (const [endung, ziel] of Object.entries(ENDUNG) as [keyof typeof ENDUNG, DateiProgramm][]) {
      const dateien = namen.filter((n) => extname(n).toLowerCase() === endung)
      if (!dateien.length) continue
      const kaputt = await Promise.all(dateien.map(async (n) => verlinktePfade(await readFile(join(ordner, n), 'utf8').catch(() => '')).some((p) => !existsSync(p))))
      if (!kaputt.some(Boolean) && dateien.length === 1) continue
      try {
        const neu = await schreibe(daten, id, ziel)
        for (const n of dateien) {
          const pfad = join(ordner, n)
          if (pfad === neu.datei) continue
          await rm(pfad, { force: true })
          if (ziel === 'resolve') await rm(pfad.replace(/\.fcpxml$/i, '.edl'), { force: true })
        }
        erneuert++
        melde(`${ziel}: ${neu.datei}`)
      } catch (err) {
        melde(`${ziel} ${id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  return erneuert
}
