import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Programm } from '@shared/profil'
import { findeAdobe, registryPfad, type ErkennungsQuellen } from './adobe'

/** Erkanntes Programm: für den Assistenten (Vorauswahl) und die Einstellungen */
export interface ProgrammFund {
  id: Programm
  pfad: string
  version: string | null
}

async function istDatei(p: string): Promise<boolean> {
  return (await stat(p).catch(() => null))?.isFile() ?? false
}

/** Übliche Installationsorte der Nicht-Adobe-Programme (pro Benutzer oder systemweit) und ihr App-Paths-Name */
function kandidaten(env: NodeJS.ProcessEnv): { id: Exclude<Programm, 'premiere' | 'aftereffects' | 'photoshop'>; pfade: string[]; appPath: string | null }[] {
  const pf = [...new Set([env['ProgramFiles'], env['ProgramW6432'], 'C:\\Program Files'].filter((x): x is string => !!x))]
  const local = env['LOCALAPPDATA'] ?? ''
  return [
    { id: 'resolve', pfade: pf.map((p) => join(p, 'Blackmagic Design', 'DaVinci Resolve', 'Resolve.exe')), appPath: 'Resolve.exe' },
    { id: 'capcut', pfade: local ? [join(local, 'CapCut', 'Apps', 'CapCut.exe'), join(local, 'Programs', 'CapCut', 'CapCut.exe')] : [], appPath: 'CapCut.exe' },
    { id: 'obs', pfade: pf.map((p) => join(p, 'obs-studio', 'bin', '64bit', 'obs64.exe')), appPath: 'obs64.exe' },
    { id: 'canva', pfade: local ? [join(local, 'Programs', 'Canva', 'Canva.exe')] : [], appPath: null }
  ]
}

/**
 * Sucht Premiere, After Effects, Photoshop, DaVinci Resolve, CapCut, OBS und Canva. Nichts wird gestartet oder
 * verändert; gefunden heißt nur „liegt dort“. Die Vorauswahl im Assistenten kann der Nutzer jederzeit ändern.
 */
export async function findeProgramme(q?: Partial<ErkennungsQuellen> & { env?: NodeJS.ProcessEnv }): Promise<ProgrammFund[]> {
  const env = q?.env ?? process.env
  const funde: ProgrammFund[] = []
  const adobe = await findeAdobe(q?.programmOrdner && q.registry && q.version ? (q as ErkennungsQuellen) : undefined)
  for (const a of adobe) if (!funde.some((f) => f.id === a.id)) funde.push({ id: a.id, pfad: a.pfad, version: a.version })
  const registry = q?.registry ?? registryPfad
  for (const k of kandidaten(env)) {
    let pfad: string | null = null
    for (const p of k.pfade) {
      if (await istDatei(p)) {
        pfad = p
        break
      }
    }
    if (!pfad && k.appPath) {
      const r = await registry(k.appPath)
      if (r && (await istDatei(r))) pfad = r
    }
    if (pfad) funde.push({ id: k.id, pfad, version: null })
  }
  return funde
}
