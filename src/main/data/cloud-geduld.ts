// Herkunft: MoinStudio src/main/data/icloud-geduld.ts (MIT, v0.48.0), erweitert um Dropbox.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/**
 * iCloud, OneDrive und Dropbox sperren Dateien kurz, während sie hoch- oder heruntergeladen werden, und Platzhalter
 * („Verfügbar, wenn online“) werden erst beim ersten Lesen geholt. In der App zeigte sich das als lästige Fehler.
 * Lesen, Schreiben, Kopieren, Umbenennen und Löschen im Datenordner werden deshalb bei solchen vorübergehenden Fehlern
 * bis zu ~10 Sekunden lang wiederholt, bevor der Fehler weitergegeben wird. Außerhalb des Datenordners ändert sich nichts.
 */

export const VORUEBERGEHEND = new Set(['EBUSY', 'EPERM', 'EACCES', 'EIO', 'UNKNOWN', 'ETIMEDOUT', 'EAGAIN', 'ENOTEMPTY'])
const WARTEZEITEN = [100, 200, 400, 800, 1200, 1600, 2000, 2000, 2000]

let ordner: string | null = null

let angeheftet: string | null = null

export function setzeDatenordner(pfad: string | null): void {
  ordner = pfad ? resolve(pfad).toLowerCase() : null
  if (pfad && ordner !== angeheftet) {
    angeheftet = ordner
    immerLokal(pfad)
  }
}

/**
 * Datenordner in iCloud/OneDrive/Dropbox auf „Immer auf diesem Gerät behalten“ stellen (Windows: Attribut „angeheftet“).
 * Sonst sind Dateien nur Platzhalter, die erst beim Öffnen geladen werden – Blender, FFmpeg und Premiere scheitern
 * daran, und die App meldete Fehler. Läuft im Hintergrund, Fehler werden ignoriert.
 */
export function immerLokal(pfad: string): void {
  if (process.platform !== 'win32' || process.env['VITEST'] || !/icloud|onedrive|dropbox/i.test(pfad)) return
  try {
    const attrib = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'attrib.exe')
    const p = spawn(attrib, ['+P', '-U', join(pfad, '*'), '/S', '/D'], { windowsHide: true, stdio: 'ignore', detached: false })
    p.on('error', () => undefined)
  } catch {
    // nicht schlimm: dann bleibt es beim Wiederholen bei Sperren
  }
}

function imDatenordner(pfad: unknown): boolean {
  if (!ordner || (typeof pfad !== 'string' && !(pfad instanceof URL))) return false
  const p = resolve(String(pfad instanceof URL ? pfad.pathname : pfad)).toLowerCase()
  return p === ordner || p.startsWith(ordner + sep)
}

export async function mitGeduld<T>(lauf: () => Promise<T>, warte = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await lauf()
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (!VORUEBERGEHEND.has(code) || i >= WARTEZEITEN.length) throw err
      await warte(WARTEZEITEN[i]!)
    }
  }
}

type Fn = (...a: unknown[]) => Promise<unknown>
const NAMEN = ['readFile', 'writeFile', 'appendFile', 'copyFile', 'rename', 'rm', 'unlink', 'stat', 'readdir', 'mkdir', 'cp', 'open'] as const

let aktiv = false

/** Einmal beim Start aufrufen (vor dem ersten Dateizugriff). */
export function installiereCloudGeduld(): void {
  if (aktiv) return
  aktiv = true
  const ziele = [fsp as unknown as Record<string, Fn>, fs.promises as unknown as Record<string, Fn>]
  for (const ziel of new Set(ziele)) {
    for (const name of NAMEN) {
      const original = ziel[name]
      if (typeof original !== 'function') continue
      ziel[name] = function (this: unknown, ...a: unknown[]) {
        const betroffen = imDatenordner(a[0]) || ((name === 'copyFile' || name === 'rename' || name === 'cp') && imDatenordner(a[1]))
        return betroffen ? mitGeduld(() => original.apply(this, a)) : original.apply(this, a)
      }
    }
  }
}
