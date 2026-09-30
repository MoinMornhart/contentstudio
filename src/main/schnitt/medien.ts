// Herkunft: MoinStudio src/main/schnitt/medien.ts (MIT).
import { app, protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { SettingsStore } from '../data/settings'

/**
 * Eigenes Protokoll „cs-media://datei/<pfad>“ für den Video-Player im Schnitt-Reiter (ROADMAP 5.1). Unterstützt
 * Range-Anfragen, damit man im Video springen kann. Ausgeliefert werden nur Dateien im Datenordner (Proxys, Exporte) –
 * nie beliebige Pfade.
 */
export const MEDIEN_SCHEMA = 'cs-media'

const TYPEN: Record<string, string> = { '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' }

/** Muss vor „app ready“ aufgerufen werden. */
export function medienSchemaAnmelden(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIEN_SCHEMA, privileges: { stream: true, supportFetchAPI: true, secure: true, standard: true } }])
}

/** Adresse für eine Datei im Datenordner. */
export function medienUrl(pfad: string): string {
  return `${MEDIEN_SCHEMA}://datei/${encodeURIComponent(pfad)}`
}

/** Range-Kopf „bytes=a-b“ → [start, ende] (inklusive), begrenzt auf die Dateigröße; null = ganze Datei. */
export function bereich(kopf: string | null, groesse: number): [number, number] | null {
  const m = kopf ? /^bytes=(\d*)-(\d*)$/.exec(kopf.trim()) : null
  if (!m || (!m[1] && !m[2])) return null
  if (!m[1]) {
    const n = Math.min(groesse, Number(m[2]))
    return [groesse - n, groesse - 1]
  }
  const start = Number(m[1])
  const ende = m[2] ? Math.min(Number(m[2]), groesse - 1) : groesse - 1
  return start > ende ? null : [start, ende]
}

export function medienBedienen(settings: SettingsStore): void {
  void app.whenReady().then(() =>
    protocol.handle(MEDIEN_SCHEMA, async (req) => {
      const pfad = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, '')) // ?v=… (neu laden) wird ignoriert
      const daten = (await settings.load()).dataDir
      if (!daten || !resolve(pfad).startsWith(resolve(daten) + sep)) return new Response('verboten', { status: 403 })
      const info = await stat(pfad).catch(() => null)
      if (!info?.isFile()) return new Response('nicht gefunden', { status: 404 })
      const typ = TYPEN[extname(pfad).toLowerCase()] ?? 'application/octet-stream'
      const b = bereich(req.headers.get('range'), info.size)
      const [start, ende] = b ?? [0, info.size - 1]
      const strom = Readable.toWeb(createReadStream(pfad, { start, end: ende })) as ReadableStream
      return new Response(strom, {
        status: b ? 206 : 200,
        headers: {
          'Content-Type': typ,
          'Content-Length': String(ende - start + 1),
          'Accept-Ranges': 'bytes',
          ...(b ? { 'Content-Range': `bytes ${start}-${ende}/${info.size}` } : {})
        }
      })
    })
  )
}
