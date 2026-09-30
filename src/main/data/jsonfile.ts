import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { z } from 'zod'

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Schreibt JSON atomar: erst in eine temporäre Datei daneben, dann per Umbenennen ersetzen.
 * So findet OneDrive (oder ein Absturz) nie eine halb geschriebene Datei vor. Kurzzeitige
 * Sperren durch OneDrive/Virenscanner (EPERM/EBUSY) werden mit kurzen Wartezeiten wiederholt.
 */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, path)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (!RETRY_CODES.has(code) || attempt >= 8) {
        await rm(tmp, { force: true })
        throw err
      }
      await wait(50 * 2 ** Math.min(attempt, 4))
    }
  }
}

export type ReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'missing' | 'invalid-json' | 'invalid-schema'; detail?: string }

/** Liest und prüft eine JSON-Datei gegen ein Zod-Schema, ohne bei Fehlern zu werfen. */
export async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<ReadResult<T>> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: false, reason: 'missing' }
    throw err
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch (err) {
    return { ok: false, reason: 'invalid-json', detail: (err as Error).message }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'invalid-schema', detail: parsed.error.message }
  return { ok: true, value: parsed.data }
}

/**
 * Liest eine Datei im geteilten Datenordner und repariert Konfliktkopien: iCloud legt beim schnellen Ersetzen
 * „name 2.json“ an (und das Original kann fehlen), OneDrive „name-GERÄT.json“, Dropbox „name (… conflicted copy …).json“
 * bzw. „name (Konfliktkopie …).json“, Google Drive „name (1).json“. Die jüngste gültige Fassung wird wieder unter dem
 * richtigen Namen abgelegt, die Kopien werden entfernt. Fehlt alles, wirft sie wie readFile.
 */
export async function liesMitKonfliktkopien(pfad: string): Promise<string> {
  const ordner = dirname(pfad)
  const name = basename(pfad)
  const punkt = name.lastIndexOf('.')
  const stamm = punkt > 0 ? name.slice(0, punkt) : name
  const endung = punkt > 0 ? name.slice(punkt) : ''
  const roh = (t: string): string => t.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')
  const muster = new RegExp('^' + roh(stamm) + '( \\d+| \\(\\d+\\)| \\([^()]*(?:conflicted copy|Konfliktkopie)[^()]*\\)|-[^.]+)' + roh(endung) + '$', 'i')
  const kopien = (await readdir(ordner).catch(() => [] as string[])).filter((n) => muster.test(n))
  if (!kopien.length) return readFile(pfad, 'utf8')
  const kandidaten = await Promise.all(
    [name, ...kopien].map(async (n) => {
      const p = join(ordner, n)
      const info = await stat(p).catch(() => null)
      const text = info ? await readFile(p, 'utf8').catch(() => null) : null
      const gueltig = ((): boolean => {
        if (text === null) return false
        if (endung !== '.json') return true
        try {
          JSON.parse(text)
          return true
        } catch {
          return false
        }
      })()
      return { p, text, zeit: info?.mtimeMs ?? 0, gueltig }
    })
  )
  const beste = kandidaten.filter((k) => k.gueltig).sort((a, b) => b.zeit - a.zeit)[0]
  if (!beste || beste.text === null) return readFile(pfad, 'utf8')
  if (beste.p !== pfad) await writeFile(pfad, beste.text, 'utf8')
  for (const k of kandidaten) if (k.p !== pfad) await rm(k.p, { force: true })
  return beste.text
}
