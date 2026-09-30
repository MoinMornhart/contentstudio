// Herkunft: MoinStudio src/main/schnitt/import.ts (MIT).
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JobContext } from '../jobs/queue'
import { t } from '../i18n'
import { aendereProjekt, ladeProjekt, projektOrdner, quellInfoAus, schnellePruefsumme, type Projekt } from './projekt'

/**
 * Import eines Rohvideos (ROADMAP 5.1): Videodaten (ffprobe), Vorschau-Proxy in 540p zum flüssigen Abspielen und
 * Springen, Wellenform und Standbild-Leiste. Jeder Schritt wird im Projekt vermerkt; nach Neustart oder Pause laufen
 * nur die fehlenden Schritte. Das Original wird nie verändert.
 */

export interface ImportPayload {
  daten: string
  projekt: string
  ffmpeg: string
  ffprobe: string
}

/** FFmpeg mit Fortschritt (out_time aus -progress) – für lange Streams wichtig, damit man sieht, dass es läuft. */
export function ffmpegMitFortschritt(exe: string, args: string[], ctx: JobContext<unknown>, dauer: number, melde: (anteil: number) => void, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-hide_banner', '-y', '-nostats', '-progress', 'pipe:1', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd })
    ctx.track(child)
    let fehler = ''
    child.stdout.on('data', (d: Buffer) => {
      const m = /out_time_us=(\d+)/.exec(d.toString())
      if (m && dauer > 0) melde(Math.min(1, Number(m[1]) / 1e6 / dauer))
    })
    child.stderr.on('data', (d: Buffer) => (fehler = (fehler + d.toString()).slice(-4000)))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg Exit ${code}: ${fehler.trim().split(/\r?\n/).slice(-1)[0]}`))))
  })
}

function ausgabe(exe: string, args: string[], ctx: JobContext<unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    ctx.track(child)
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`ffprobe Exit ${code}`))))
  })
}

/** Rohe 16-Bit-Samples → Spitzenwerte je Abschnitt (0–100). Höchstens ~20 000 Werte, auch bei Stunden-Streams. */
export class WellenSammler {
  werte: number[] = []
  private max = 0
  private zaehler = 0
  private rest: Buffer | null = null
  constructor(private readonly samplesJeWert: number) {}
  schiebe(d: Buffer): void {
    const puffer = this.rest ? Buffer.concat([this.rest, d]) : d
    const n = Math.floor(puffer.length / 2)
    for (let i = 0; i < n; i++) {
      const v = Math.abs(puffer.readInt16LE(i * 2))
      if (v > this.max) this.max = v
      if (++this.zaehler >= this.samplesJeWert) this.abschliessen()
    }
    this.rest = puffer.length % 2 ? puffer.subarray(puffer.length - 1) : null
  }
  abschliessen(): void {
    if (!this.zaehler) return
    this.werte.push(Math.round((this.max / 32768) * 100))
    this.max = 0
    this.zaehler = 0
  }
}

export const WELLEN_RATE = 4000

export function wellenAufloesung(dauer: number): number {
  // mindestens 20 Werte pro Sekunde, höchstens 20 000 Werte insgesamt
  return Math.max(1 / 20, dauer / 20000)
}

export async function importJob(p: ImportPayload, ctx: JobContext<unknown>): Promise<{ projekt: string }> {
  const ordner = projektOrdner(p.daten, p.projekt)
  const laden = async (): Promise<Projekt> => {
    const pr = await ladeProjekt(p.daten, p.projekt)
    if (!pr?.quelle) throw new Error(t('schnitt.fehler.projekt'))
    return pr
  }
  let pr = await laden()
  const quelle = pr.quelle!
  const merke = async (patch: Partial<Projekt>): Promise<void> => {
    pr = (await aendereProjekt(p.daten, p.projekt, () => patch)) ?? pr
  }

  if (!quelle.dauer) {
    ctx.progress(2, t('schnitt.schritt.videodaten'))
    const probe = JSON.parse(await ausgabe(p.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', quelle.pfad], ctx))
    const summe = await schnellePruefsumme(quelle.pfad)
    await merke({ quelle: { ...quelle, ...quellInfoAus(probe), ...summe } })
  }
  const dauer = pr.quelle!.dauer
  if (!dauer) throw new Error(t('schnitt.fehler.laenge'))

  if (!pr.leiste) {
    await ctx.yield()
    ctx.progress(5, t('schnitt.schritt.leiste'))
    // 40 Bilder gleichmäßig über das Video, nebeneinander in einem Bild
    await ffmpegMitFortschritt(p.ffmpeg, ['-i', quelle.pfad, '-vf', `fps=40/${dauer.toFixed(3)},scale=192:-2,tile=40x1`, '-frames:v', '1', '-q:v', '4', join(ordner, 'leiste.jpg')], ctx, dauer, (a) => ctx.progress(5 + a * 10, t('schnitt.schritt.leiste')))
    await merke({ leiste: true })
  }

  if (!pr.wellenform && pr.quelle!.audio) {
    await ctx.yield()
    ctx.progress(15, t('schnitt.schritt.wellenform'))
    const aufloesung = wellenAufloesung(dauer)
    const sammler = new WellenSammler(Math.max(1, Math.round(WELLEN_RATE * aufloesung)))
    await new Promise<void>((resolve, reject) => {
      const child = spawn(p.ffmpeg, ['-hide_banner', '-v', 'error', '-i', quelle.pfad, '-vn', '-ac', '1', '-ar', String(WELLEN_RATE), '-f', 's16le', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      ctx.track(child)
      child.stdout.on('data', (d: Buffer) => sammler.schiebe(d))
      child.once('error', reject)
      child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg Exit ${code} (Wellenform)`))))
    })
    sammler.abschliessen()
    await writeFile(join(ordner, 'wellenform.json'), JSON.stringify({ aufloesung, werte: sammler.werte }))
    await merke({ wellenform: true })
  }

  if (!pr.proxy) {
    await ctx.yield()
    // Vorschau: 540p, kurze GOP (springt schnell), niedrige Qualität reicht – das Original wird beim Export genutzt
    await ffmpegMitFortschritt(
      p.ffmpeg,
      ['-i', quelle.pfad, '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=-2:540', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-g', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', join(ordner, 'proxy.mp4')],
      ctx,
      dauer,
      (a) => ctx.progress(25 + a * 74, t('schnitt.schritt.proxy', { prozent: Math.round(a * 100) }))
    )
    await merke({ proxy: true })
  }
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { projekt: p.projekt }
}
