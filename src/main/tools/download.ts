import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { t } from '../i18n'

export interface DownloadProgress {
  received: number
  total: number | null
}

export interface DownloadOptions {
  sha256?: string
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
  userAgent?: string
}

export class ChecksumError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string
  ) {
    super(t('werkzeuge.fehler.pruefsummeFalsch', { erwartet: expected, erhalten: actual }))
  }
}

/**
 * Lädt eine Datei herunter, berechnet dabei SHA256 und benennt sie erst nach erfolgreicher
 * Prüfung von `.part` auf den Zielnamen um. Gibt den berechneten Hash zurück.
 */
export async function downloadFile(url: string, dest: string, opts: DownloadOptions = {}): Promise<string> {
  await mkdir(dirname(dest), { recursive: true })
  const part = `${dest}.part`
  const res = await fetch(url, {
    signal: opts.signal,
    redirect: 'follow',
    headers: { 'User-Agent': opts.userAgent ?? 'ContentStudio (github.com/MoinMornhart/contentstudio)' }
  })
  if (!res.ok || !res.body) throw new Error(t('werkzeuge.fehler.download', { status: `${res.status} ${res.statusText}`, url }))
  const totalHeader = Number(res.headers.get('content-length'))
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null

  const hash = createHash('sha256')
  let received = 0
  let lastReport = 0
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      received += chunk.length
      const now = Date.now()
      if (now - lastReport > 200) {
        lastReport = now
        opts.onProgress?.({ received, total })
      }
      cb(null, chunk)
    }
  })

  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream), meter, createWriteStream(part), {
      signal: opts.signal
    })
  } catch (err) {
    await rm(part, { force: true })
    throw err
  }
  opts.onProgress?.({ received, total })

  const actual = hash.digest('hex')
  if (opts.sha256 && actual !== opts.sha256.toLowerCase()) {
    await rm(part, { force: true })
    throw new ChecksumError(opts.sha256, actual)
  }
  await rm(dest, { force: true })
  await rename(part, dest)
  return actual
}

/** Lädt eine kleine Textdatei (z. B. Prüfsummenliste). */
export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: { 'User-Agent': 'ContentStudio (github.com/MoinMornhart/contentstudio)' }
  })
  if (!res.ok) throw new Error(t('werkzeuge.fehler.download', { status: String(res.status), url }))
  return res.text()
}
