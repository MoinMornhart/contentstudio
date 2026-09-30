// Herkunft: MoinStudio src/main/adobe/erkennung.ts (MIT), erweitert um DaVinci Resolve und CapCut.
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * Programm-Erkennung (ROADMAP 7.5): Premiere, Photoshop und After Effects über die Programmordner und die Registry
 * (App Paths), DaVinci Resolve unter „Blackmagic Design“, CapCut im Benutzerordner. Die Version kommt immer aus der exe, nie aus dem Ordnernamen (Photoshop zählt um eins versetzt:
 * 2026 = 27.x).
 */

export type AdobeId = 'premiere' | 'photoshop' | 'aftereffects'
export type ProgrammId = AdobeId | 'resolve' | 'capcut'

export interface ErkanntesProgramm {
  id: ProgrammId
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

export const PROGRAMM_NAMEN: Record<ProgrammId, string> = { premiere: 'Premiere Pro', photoshop: 'Photoshop', aftereffects: 'After Effects', resolve: 'DaVinci Resolve', capcut: 'CapCut' }

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
  /** %LOCALAPPDATA% (CapCut installiert sich dorthin) */
  lokal: string | null
  registry: (exe: string) => Promise<string | null>
  version: (pfad: string) => Promise<string | null>
}

const standard = (): ErkennungsQuellen => ({
  programmOrdner: [...new Set([process.env['ProgramFiles'], process.env['ProgramW6432'], 'C:\\Program Files'].filter((x): x is string => !!x))],
  lokal: process.env['LOCALAPPDATA'] ?? null,
  registry: registryPfad,
  version: exeVersion
})

export async function findeProgramme(q: ErkennungsQuellen = standard()): Promise<ErkanntesProgramm[]> {
  const gefunden = new Map<string, Omit<ErkanntesProgramm, 'version'>>()
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
  // DaVinci Resolve (Blackmagic Design) und CapCut (Benutzerordner, je Version ein Unterordner)
  for (const basis of q.programmOrdner) {
    const pfad = join(basis, 'Blackmagic Design', 'DaVinci Resolve', 'Resolve.exe')
    if (await gibtEs(pfad)) gefunden.set(pfad.toLowerCase(), { id: 'resolve', name: 'DaVinci Resolve', jahr: null, beta: false, pfad })
  }
  if (![...gefunden.values()].some((g) => g.id === 'resolve')) {
    const pfad = await q.registry('Resolve.exe')
    if (pfad && (await gibtEs(pfad))) gefunden.set(pfad.toLowerCase(), { id: 'resolve', name: 'DaVinci Resolve', jahr: null, beta: false, pfad })
  }
  if (q.lokal) {
    const apps = join(q.lokal, 'CapCut', 'Apps')
    const kandidaten = [join(apps, 'CapCut.exe'), ...(await ordnerListe(apps)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map((v) => join(apps, v, 'CapCut.exe'))]
    for (const pfad of kandidaten)
      if (await gibtEs(pfad)) {
        gefunden.set(pfad.toLowerCase(), { id: 'capcut', name: 'CapCut', jahr: null, beta: false, pfad })
        break
      }
  }
  const liste = await Promise.all([...gefunden.values()].map(async (g) => ({ ...g, version: await q.version(g.pfad) })))
  const rang: Record<ProgrammId, number> = { premiere: 0, aftereffects: 1, resolve: 2, capcut: 3, photoshop: 4 }
  // je Programm zuerst die normale Version, dann die neueste
  return liste.sort((a, b) => rang[a.id] - rang[b.id] || Number(a.beta) - Number(b.beta) || (b.version ?? '').localeCompare(a.version ?? '', undefined, { numeric: true }))
}
