// Herkunft: MoinStudio src/main/adobe/erkennung.ts (MIT).
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * Adobe-Erkennung (ROADMAP 8.2): Premiere, Photoshop und After Effects über die Programmordner und die Registry
 * (App Paths) finden. Die Version kommt immer aus der exe, nie aus dem Ordnernamen (Photoshop zählt um eins versetzt:
 * 2026 = 27.x). Ungetestet, bis der Selbsttest auf einem Rechner mit Adobe grün war.
 */

export type AdobeId = 'premiere' | 'photoshop' | 'aftereffects'

export interface AdobeProgramm {
  id: AdobeId
  /** Ordner- bzw. Anzeigename, z. B. „Adobe Premiere Pro 2026“ */
  name: string
  /** Jahr aus dem Ordnernamen (nur Anzeige) */
  jahr: string | null
  /** Dateiversion der exe, z. B. „26.5.0.12“ */
  version: string | null
  beta: boolean
  pfad: string
}

const MUSTER: { id: AdobeId; ordner: RegExp; exe: string[] }[] = [
  // Premiere heißt ab 2026 evtl. „Adobe Premiere 2026“ statt „Adobe Premiere Pro 2026“ (docs/research/adobe.md §6)
  { id: 'premiere', ordner: /^Adobe Premiere( Pro)?( \d{4})?( \(Beta\))?$/i, exe: ['Adobe Premiere Pro.exe', 'Adobe Premiere.exe', 'Adobe Premiere Pro (Beta).exe', 'Adobe Premiere (Beta).exe'] },
  { id: 'photoshop', ordner: /^Adobe Photoshop( \d{4})?( \(Beta\))?$/i, exe: ['Photoshop.exe'] },
  { id: 'aftereffects', ordner: /^Adobe After Effects( \d{4})?( \(Beta\))?$/i, exe: [join('Support Files', 'AfterFX.exe')] }
]

/** Registry-Schlüssel unter App Paths je Programm */
export const APP_PATHS: Record<AdobeId, string> = {
  premiere: 'Adobe Premiere Pro.exe',
  photoshop: 'Photoshop.exe',
  aftereffects: 'AfterFX.exe'
}

export const ADOBE_NAMEN: Record<AdobeId, string> = { premiere: 'Premiere', photoshop: 'Photoshop', aftereffects: 'After Effects' }

async function gibtEs(p: string): Promise<boolean> {
  return (await stat(p).catch(() => null))?.isFile() ?? false
}

async function ordnerListe(dir: string): Promise<string[]> {
  return readdir(dir).catch(() => [])
}

/** Dateiversion einer exe über PowerShell (null, wenn nicht lesbar). */
export function exeVersion(pfad: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `(Get-Item -LiteralPath '${pfad.replace(/'/g, "''")}').VersionInfo.FileVersion`],
      { windowsHide: true, timeout: 10_000 },
      (err, stdout) => resolve(err ? null : stdout.trim() || null)
    )
  })
}

/** Standardwert eines App-Paths-Schlüssels (HKLM und HKCU), also der Pfad zur exe. */
export function registryPfad(exe: string): Promise<string | null> {
  const lies = (hive: string): Promise<string | null> =>
    new Promise((resolve) => {
      execFile('reg.exe', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, '/ve'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
        if (err) return resolve(null)
        const m = /REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(stdout)
        resolve(m ? m[1].trim().replace(/^"|"$/g, '') : null)
      })
    })
  return lies('HKLM').then((p) => p ?? lies('HKCU'))
}

export interface ErkennungsQuellen {
  programmOrdner: string[]
  registry: (exe: string) => Promise<string | null>
  version: (pfad: string) => Promise<string | null>
}

const standard = (): ErkennungsQuellen => ({
  programmOrdner: [...new Set([process.env['ProgramFiles'], process.env['ProgramW6432'], 'C:\\Program Files'].filter((x): x is string => !!x))],
  registry: registryPfad,
  version: exeVersion
})

export async function findeAdobe(q: ErkennungsQuellen = standard()): Promise<AdobeProgramm[]> {
  const gefunden = new Map<string, Omit<AdobeProgramm, 'version'>>()
  for (const basis of q.programmOrdner) {
    for (const ordner of await ordnerListe(join(basis, 'Adobe'))) {
      const m = MUSTER.find((x) => x.ordner.test(ordner))
      if (!m) continue
      for (const exe of m.exe) {
        const pfad = join(basis, 'Adobe', ordner, exe)
        if (!(await gibtEs(pfad))) continue
        gefunden.set(pfad.toLowerCase(), { id: m.id, name: ordner, jahr: /(\d{4})/.exec(ordner)?.[1] ?? null, beta: /beta/i.test(ordner) || /beta/i.test(exe), pfad })
        break
      }
    }
  }
  // Installationen außerhalb des Standardordners (anderes Laufwerk) über die Registry
  for (const id of Object.keys(APP_PATHS) as AdobeId[]) {
    if ([...gefunden.values()].some((g) => g.id === id)) continue
    const pfad = await q.registry(APP_PATHS[id])
    if (!pfad || !(await gibtEs(pfad))) continue
    const ordner = basename(id === 'aftereffects' ? dirname(dirname(pfad)) : dirname(pfad))
    gefunden.set(pfad.toLowerCase(), { id, name: ordner, jahr: /(\d{4})/.exec(ordner)?.[1] ?? null, beta: /beta/i.test(pfad), pfad })
  }
  const liste = await Promise.all([...gefunden.values()].map(async (g) => ({ ...g, version: await q.version(g.pfad) })))
  const rang: Record<AdobeId, number> = { premiere: 0, photoshop: 1, aftereffects: 2 }
  // je Programm zuerst die normale Version, dann die neueste
  return liste.sort((a, b) => rang[a.id] - rang[b.id] || Number(a.beta) - Number(b.beta) || (b.version ?? '').localeCompare(a.version ?? '', undefined, { numeric: true }))
}
