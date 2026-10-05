import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
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

/** Konfliktkopien eines Dateinamens: iCloud „name 2.json“ und „name(1).json“, Google Drive „name (1).json“, OneDrive
 * „name-GERÄT.json“, Dropbox „name (… conflicted copy …).json“ bzw. „name (Konfliktkopie …).json“. */
export function konfliktMuster(name: string): RegExp {
  const punkt = name.lastIndexOf('.')
  const stamm = punkt > 0 ? name.slice(0, punkt) : name
  const endung = punkt > 0 ? name.slice(punkt) : ''
  const roh = (t: string): string => t.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')
  return new RegExp('^' + roh(stamm) + '( \\d+| ?\\(\\d+\\)| \\([^()]*(?:conflicted copy|Konfliktkopie)[^()]*\\)|-[^.]+)' + roh(endung) + '$', 'i')
}

/** Wohin Konfliktkopien verschoben werden: lokal, nicht in den Cloud-Ordner – nie löschen (aus MoinStudio v0.54.0) */
export function konfliktSicherung(): string {
  return join(process.env['LOCALAPPDATA'] ?? process.env['TEMP'] ?? '.', 'ContentStudio', 'konflikt-sicherung')
}

/**
 * Liest eine Datei im geteilten Datenordner und repariert Konfliktkopien (Muster siehe `konfliktMuster`; das Original
 * kann fehlen). Die jüngste gültige Fassung kommt wieder unter den richtigen Namen; bei JSON-Objekten werden Felder
 * ergänzt, die nur in einer älteren Kopie stehen. Die Kopien werden nicht gelöscht, sondern nach
 * %LOCALAPPDATA%\ContentStudio\konflikt-sicherung verschoben. Fehlt alles, wirft sie wie readFile.
 */
export async function liesMitKonfliktkopien(pfad: string): Promise<string> {
  const ordner = dirname(pfad)
  const name = basename(pfad)
  const json = name.toLowerCase().endsWith('.json')
  const muster = konfliktMuster(name)
  const kopien = (await readdir(ordner).catch(() => [] as string[])).filter((n) => muster.test(n))
  if (!kopien.length) return readFile(pfad, 'utf8')
  const kandidaten = await Promise.all(
    [name, ...kopien].map(async (n) => {
      const p = join(ordner, n)
      const info = await stat(p).catch(() => null)
      const text = info ? await readFile(p, 'utf8').catch(() => null) : null
      let wert: unknown = undefined
      let gueltig = text !== null
      if (text !== null && json) {
        try {
          wert = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
        } catch {
          gueltig = false
        }
      }
      return { p, text, wert, zeit: info?.mtimeMs ?? 0, gueltig }
    })
  )
  const gute = kandidaten.filter((k) => k.gueltig).sort((a, b) => b.zeit - a.zeit)
  const beste = gute[0]
  if (!beste || beste.text === null) return readFile(pfad, 'utf8')
  let text = beste.text
  const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  if (json && istObjekt(beste.wert)) {
    const zusammen: Record<string, unknown> = { ...beste.wert }
    for (const k of gute.slice(1)) if (istObjekt(k.wert)) for (const [f, v] of Object.entries(k.wert)) if (!(f in zusammen)) zusammen[f] = v
    if (Object.keys(zusammen).length !== Object.keys(beste.wert).length) text = `${JSON.stringify(zusammen, null, 2)}\n`
  }
  if (beste.p !== pfad || text !== beste.text) await writeFile(pfad, text, 'utf8')
  const sicherung = join(konfliktSicherung(), new Date().toISOString().replace(/[:.]/g, '-'))
  for (const k of kandidaten) {
    if (k.p === pfad || k.zeit === 0) continue
    await mkdir(sicherung, { recursive: true }).catch(() => undefined)
    const ziel = join(sicherung, `${basename(ordner)}-${basename(k.p)}`)
    // anderes Laufwerk: kopieren, dann entfernen
    await rename(k.p, ziel).catch(async () => {
      await copyFile(k.p, ziel)
      await rm(k.p, { force: true })
    })
  }
  return text
}
