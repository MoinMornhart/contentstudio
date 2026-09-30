// Herkunft: MoinStudio src/main/data/datadir.ts (MIT), erweitert um Konfliktkopien von iCloud, Dropbox und Google Drive.
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from './jsonfile'

/** Unterordner des Datenordners. Alles, was mehrere Geräte teilen, liegt hier – nie Caches oder Werkzeuge. */
export const DATA_LAYOUT = [
  'profil',
  'avatare',
  'freunde',
  'marke',
  'vorbilder',
  'thumbnails',
  'projekte',
  'planning/cards'
] as const

export const MARKER_FILE = 'contentstudio-data.json'
export const SUBFOLDER_NAME = 'ContentStudio'

const MarkerSchema = z.object({ format: z.literal(1), createdAt: z.string() })

export async function isDataDir(dir: string): Promise<boolean> {
  return (await readJson(join(dir, MARKER_FILE), MarkerSchema)).ok
}

async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).filter((n) => n !== 'desktop.ini' && n !== 'Thumbs.db' && n !== '.DS_Store').length === 0
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw err
  }
}

/**
 * Entscheidet, wo die Daten landen: Ein vorhandener ContentStudio-Datenordner oder ein leerer Ordner wird direkt genutzt.
 * In einem Ordner mit fremden Dateien (z. B. dem OneDrive- oder iCloud-Hauptordner) wird stattdessen ein Unterordner
 * „ContentStudio“ verwendet, damit nichts durcheinandergerät.
 */
export async function resolveDataDir(chosen: string): Promise<string> {
  if ((await isDataDir(chosen)) || (await isEmptyDir(chosen))) return chosen
  return join(chosen, SUBFOLDER_NAME)
}

/** Legt Markierungsdatei und alle Unterordner an (idempotent). */
export async function ensureDataLayout(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  if (!(await isDataDir(dir))) {
    await writeJsonAtomic(join(dir, MARKER_FILE), { format: 1, createdAt: new Date().toISOString() })
  }
  for (const sub of DATA_LAYOUT) await mkdir(join(dir, sub), { recursive: true })
}

export interface SyncConflict {
  /** Originaldatei relativ zum Datenordner */
  original: string
  /** Konfliktkopie relativ zum Datenordner, z. B. `planning/cards/abc-LAPTOP.json` */
  copy: string
}

const SYNCED_EXT = /\.(json|yaml|yml)$/i
/**
 * Ordner, die ContentStudio nur herunterlädt oder zwischenspeichert. Dort gibt es keine echten Konfliktkopien, und sie
 * sollen gar nicht erst im Datenordner liegen (Caches gehören nach %LOCALAPPDATA%\ContentStudio).
 */
export const NICHT_SYNCHRON = new Set(['mc', 'node_modules', '.cache', 'cache', 'downloads', '.dropbox.cache', '.tmp.drivedownload', '.tmp.driveupload'])

/**
 * Muster der Sync-Dienste für Konfliktkopien von „name.json“:
 * - OneDrive: „name-GERÄT.json“ (Gerätename kann Bindestriche enthalten, evtl. mit Zähler „-2“)
 * - iCloud Drive: „name 2.json“
 * - Dropbox: „name (Gerät's conflicted copy 2026-09-30).json“, deutsch „name (Konfliktkopie von Gerät 2026-09-30).json“
 * - Google Drive: „name (1).json“
 */
const KOPIE_ENDUNGEN = [/ \d+$/, / \([^()]*(conflicted copy|Konfliktkopie|konflikt)[^()]*\)$/i, / \(\d+\)$/]

/** Welche Datei ist das Original einer Konfliktkopie? null = keine Konfliktkopie. */
export function conflictOriginal(name: string, siblings: ReadonlySet<string>): string | null {
  const ext = SYNCED_EXT.exec(name)?.[0]
  if (!ext) return null
  const stem = name.slice(0, -ext.length)
  for (const muster of KOPIE_ENDUNGEN) {
    const m = muster.exec(stem)
    if (m) {
      const candidate = `${stem.slice(0, m.index)}${ext}`
      if (candidate !== name && siblings.has(candidate)) return candidate
    }
  }
  // OneDrive: jede Bindestrich-Position als Trennstelle probieren
  for (let i = stem.indexOf('-'); i > 0; i = stem.indexOf('-', i + 1)) {
    const candidate = `${stem.slice(0, i)}${ext}`
    if (siblings.has(candidate)) return candidate
  }
  return null
}

/**
 * Findet Konfliktkopien, die Sync-Dienste anlegen, wenn dieselbe Datei auf zwei Geräten geändert wurde.
 * Geprüft werden nur JSON/YAML-Dateien.
 */
export async function findSyncConflicts(dir: string, maxDepth = 4): Promise<SyncConflict[]> {
  const conflicts: SyncConflict[] = []
  async function walk(current: string, depth: number): Promise<void> {
    let names: string[]
    try {
      names = await readdir(current)
    } catch {
      return
    }
    const files = new Set<string>()
    for (const name of names) {
      const full = join(current, name)
      const info = await stat(full).catch(() => null)
      if (!info) continue
      if (info.isDirectory()) {
        if (depth < maxDepth && !NICHT_SYNCHRON.has(name)) await walk(full, depth + 1)
      } else {
        files.add(name)
      }
    }
    for (const name of files) {
      const original = conflictOriginal(name, files)
      if (original) conflicts.push({ original: relative(dir, join(current, original)), copy: relative(dir, join(current, name)) })
    }
  }
  await walk(dir, 0)
  return conflicts.sort((a, b) => a.copy.localeCompare(b.copy))
}
