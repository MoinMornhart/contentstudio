import { spawn } from 'node:child_process'
import type { JobContext } from '../jobs/queue'
import { t } from '../i18n'
import { aendereProjekt, ladeProjekt, quellInfoAus } from './projekt'

/**
 * Mehrere Spuren (ROADMAP 5.6): Facecam, Gameplay oder ein getrennt aufgenommener Ton kommen als eigene Dateien und
 * werden automatisch an der Hauptspur ausgerichtet – über den Ton: Lautstärkekurven beider Dateien (100 Werte je
 * Sekunde) werden verglichen, erst grob über ±2 Minuten, dann fein um den besten Treffer. Ergebnis ist der Versatz in
 * Sekunden (positiv = die Spur beginnt später als die Hauptspur) und wie sicher die Ausrichtung ist.
 */

export const RATE = 100

/** Lautstärkekurve (RMS je 10 ms) aus 16-Bit-Samples bei 8 kHz */
export function huellkurve(samples: Int16Array, abtastrate = 8000, rate = RATE): Float32Array {
  const je = Math.max(1, Math.round(abtastrate / rate))
  const n = Math.floor(samples.length / je)
  const aus = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = 0; k < je; k++) {
      const v = samples[i * je + k]! / 32768
      s += v * v
    }
    aus[i] = Math.sqrt(s / je)
  }
  return aus
}

/** Mittelwert 0, Streuung 1 – damit laute und leise Aufnahmen vergleichbar sind */
export function normiere(x: Float32Array): Float32Array {
  let m = 0
  for (const v of x) m += v
  m /= Math.max(1, x.length)
  let q = 0
  for (const v of x) q += (v - m) ** 2
  const s = Math.sqrt(q / Math.max(1, x.length)) || 1
  return x.map((v) => (v - m) / s)
}

function verkleinere(x: Float32Array, f: number): Float32Array {
  const n = Math.floor(x.length / f)
  const aus = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = 0; k < f; k++) s += x[i * f + k]!
    aus[i] = s / f
  }
  return aus
}

/**
 * Korrelation bei Verschiebung L (Spur b um L Werte später): Mittel über die Überlappung. Zu kleine Überlappungen zählen
 * nicht – dort passt zufällig fast alles.
 */
function korrelation(a: Float32Array, b: Float32Array, lag: number, minUeberlapp: number): number {
  const start = Math.max(0, lag)
  const ende = Math.min(a.length, b.length + lag)
  if (ende - start < minUeberlapp) return -1
  let s = 0
  for (let i = start; i < ende; i++) s += a[i]! * b[i - lag]!
  return s / (ende - start)
}

/**
 * Versatz zwischen Hauptspur a und Spur b (beide normierte Hüllkurven mit RATE Werten je Sekunde): in Sekunden und
 * Sicherheit (Korrelation 0–1 am besten Punkt).
 */
export function findeVersatz(a: Float32Array, b: Float32Array, maxSek = 120): { versatz: number; sicherheit: number } {
  // grob mit 25 Werten je Sekunde
  const f = 4
  const ga = verkleinere(a, f)
  const gb = verkleinere(b, f)
  const maxGrob = Math.round((maxSek * RATE) / f)
  // mindestens ein Drittel der kürzeren Spur (und 2 s) muss sich überlappen
  const grobMin = Math.max(50, Math.floor(Math.min(ga.length, gb.length) / 3))
  let besterGrob = 0
  let wertGrob = -Infinity
  for (let l = -maxGrob; l <= maxGrob; l++) {
    const c = korrelation(ga, gb, l, grobMin)
    if (c > wertGrob) {
      wertGrob = c
      besterGrob = l
    }
  }
  // fein um den groben Treffer
  let bester = besterGrob * f
  let wert = -Infinity
  for (let l = bester - 2 * f; l <= bester + 2 * f; l++) {
    const c = korrelation(a, b, l, grobMin * f)
    if (c > wert) {
      wert = c
      bester = l
    }
  }
  return { versatz: Math.round((bester / RATE) * 1000) / 1000, sicherheit: Math.max(0, Math.min(1, Math.round(wert * 1000) / 1000)) }
}

/** Tonkurve einer Datei (die ersten `sek` Sekunden), leer ohne Tonspur */
export function tonKurve(ffmpeg: string, datei: string, sek: number, ctx: JobContext<unknown>): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-v', 'error', '-t', String(sek), '-i', datei, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    ctx.track(child)
    const teile: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => teile.push(d))
    child.once('error', reject)
    child.once('exit', () => {
      const b = Buffer.concat(teile)
      const samples = new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2))
      resolve(normiere(huellkurve(samples)))
    })
  })
}

function probe(ffprobe: string, datei: string, ctx: JobContext<unknown>): Promise<ReturnType<typeof quellInfoAus>> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', datei], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    ctx.track(child)
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve(quellInfoAus(JSON.parse(out))) : reject(new Error(`ffprobe ${code}`))))
  })
}

export interface SpurPayload {
  daten: string
  projekt: string
  /** Index in projekt.spuren */
  index: number
  ffmpeg: string
  ffprobe: string
}

/** Auftrag „Spur ausrichten“: Länge lesen, Versatz über den Ton finden, im Projekt speichern */
export async function spurJob(p: SpurPayload, ctx: JobContext<unknown>): Promise<{ versatz: number | null; sicherheit: number | null }> {
  const pr = await ladeProjekt(p.daten, p.projekt)
  const spur = pr?.spuren?.[p.index]
  if (!pr?.quelle || !spur) throw new Error(t('schnitt.fehler.projekt'))
  ctx.progress(5, t('schnitt.schritt.spurLesen'))
  const info = await probe(p.ffprobe, spur.pfad, ctx)
  let versatz: number | null = null
  let sicherheit: number | null = null
  if (info.audio && pr.quelle.audio) {
    ctx.progress(30, t('schnitt.schritt.spurAusrichten'))
    // 10 Minuten reichen für einen eindeutigen Treffer, auch bei Streams
    const [a, b] = await Promise.all([tonKurve(p.ffmpeg, pr.quelle.pfad, 600, ctx), tonKurve(p.ffmpeg, spur.pfad, 600, ctx)])
    const r = findeVersatz(a, b)
    versatz = r.versatz
    sicherheit = r.sicherheit
  }
  await aendereProjekt(p.daten, p.projekt, (x) => ({ spuren: (x.spuren ?? []).map((s, i) => (i === p.index ? { ...s, dauer: info.dauer, versatz: versatz ?? 0, sicherheit } : s)) }))
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { versatz, sicherheit }
}
