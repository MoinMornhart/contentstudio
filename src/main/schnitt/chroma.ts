// Herkunft: MoinStudio src/main/schnitt/chroma.ts (MIT, v0.50.0).
import { execFile } from 'node:child_process'
import { extname } from 'node:path'
import type { Chroma } from './bibliothek'
import { t } from '../i18n'

/**
 * Greenscreen entfernen (Chroma Key) mit FFmpeg – ohne Adobe. Viele Abo-, Like- und Meme-Effekte gibt es nur mit grünem
 * oder blauem Hintergrund. chromakey stellt die Key-Farbe transparent, despill nimmt den Grünstich an den Rändern weg.
 */

const hex2 = (x: number): string => Math.round(x).toString(16).padStart(2, '0')
export const alsHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`

/** Ist die Farbe eher grün oder eher blau? (für despill) */
export function spillArt(farbe: string): 'green' | 'blue' {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(farbe.slice(i, i + 2), 16))
  return (b ?? 0) > (g ?? 0) && (b ?? 0) > (r ?? 0) ? 'blue' : 'green'
}

/** FFmpeg-Filterkette: Eingang beliebig, Ausgang rgba mit freigestelltem Hintergrund */
export function chromaFilter(c: Chroma): string {
  const aehnlich = (0.02 + c.toleranz * 0.33).toFixed(3)
  const weich = (c.weichheit * 0.25).toFixed(3)
  const spill = c.spill > 0.01 ? `,despill=type=${spillArt(c.farbe)}:mix=${c.spill.toFixed(2)}:expand=${(c.spill * 0.5).toFixed(2)}` : ''
  return `format=yuva444p,chromakey=color=0x${c.farbe.slice(1)}:similarity=${aehnlich}:blend=${weich}${spill},format=rgba`
}

/** WebM mit Alphakanal braucht den libvpx-Decoder, sonst geht die Transparenz verloren */
export const alphaDecoder = (datei: string): string[] => (extname(datei).toLowerCase() === '.webm' ? ['-c:v', 'libvpx-vp9'] : [])

function roh(ffmpeg: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    execFile(ffmpeg, ['-v', 'error', ...args], { windowsHide: true, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  )
}

/**
 * Key-Farbe automatisch erkennen: Randpixel eines frühen Bildes (bei Greenscreen-Effekten ist der Rand fast immer
 * Hintergrund), davon der Median. Liefert null, wenn der Rand nicht klar grün oder blau ist.
 */
export async function keyFarbeErkennen(ffmpeg: string, datei: string): Promise<string | null> {
  const b = await roh(ffmpeg, ['-ss', '0.3', '-i', datei, '-frames:v', '1', '-vf', 'scale=64:36', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).catch(() =>
    roh(ffmpeg, ['-i', datei, '-frames:v', '1', '-vf', 'scale=64:36', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
  )
  if (b.length < 64 * 36 * 3) return null
  const rand: [number, number, number][] = []
  for (let y = 0; y < 36; y++)
    for (let x = 0; x < 64; x++) {
      if (x > 2 && x < 61 && y > 2 && y < 33) continue
      const i = (y * 64 + x) * 3
      rand.push([b[i]!, b[i + 1]!, b[i + 2]!])
    }
  const median = (k: 0 | 1 | 2): number => rand.map((p) => p[k]).sort((a, c) => a - c)[Math.floor(rand.length / 2)]!
  const [r, g, bl] = [median(0), median(1), median(2)]
  const gruen = g > r * 1.25 && g > bl * 1.25 && g > 60
  const blau = bl > r * 1.25 && bl > g * 1.1 && bl > 60
  return gruen || blau ? alsHex(r, g, bl) : null
}

/** Pipette: Farbe an Stelle (x, y) (Anteile 0–1) im Bild bei `zeit` */
export async function pixelFarbe(ffmpeg: string, datei: string, x: number, y: number, zeit: number): Promise<string> {
  const k = (v: number): string => Math.min(0.999, Math.max(0, v)).toFixed(4)
  const b = await roh(ffmpeg, ['-ss', String(Math.max(0, zeit)), ...alphaDecoder(datei), '-i', datei, '-frames:v', '1', '-vf', `crop=3:3:iw*${k(x)}:ih*${k(y)},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
  if (b.length < 3) throw new Error(t('bib.fehler.farbe'))
  return alsHex(b[0]!, b[1]!, b[2]!)
}

/**
 * Vorschaubild (PNG als data:-URL): Effekt bei `zeit` über einem Beispielbild, mit oder ohne Chroma Key.
 * `hintergrund`: Pfad zu einem Bild/Video (z. B. Projekt-Vorschau) oder null für ein Schachbrett.
 */
export async function vorschauBild(ffmpeg: string, o: { video?: string; bild?: string; chroma?: Chroma | null; zeit: number; hintergrund?: string | null; roh?: boolean }): Promise<string> {
  const quelle = o.video ?? o.bild
  if (!quelle) throw new Error(t('bib.fehler.keineDatei'))
  const fg = o.video ? ['-ss', String(Math.max(0, o.zeit)), ...alphaDecoder(o.video), '-i', o.video] : ['-i', o.bild!]
  // Original (für die Pipette): nur das Effektbild, ganz – so entspricht ein Klick genau einer Stelle im Effekt
  if (o.roh) {
    const png = await roh(ffmpeg, [...fg, '-frames:v', '1', '-vf', 'scale=640:-2', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'])
    return `data:image/png;base64,${png.toString('base64')}`
  }
  const bg = o.hintergrund ? ['-ss', '1', '-i', o.hintergrund] : ['-f', 'lavfi', '-i', 'color=c=0x2e7d32:s=640x360,format=rgb24,geq=r=\'if(mod(floor(X/40)+floor(Y/40)\\,2)\\,200\\,150)\':g=\'if(mod(floor(X/40)+floor(Y/40)\\,2)\\,200\\,150)\':b=\'if(mod(floor(X/40)+floor(Y/40)\\,2)\\,200\\,150)\'']
  const kette = o.chroma ? chromaFilter(o.chroma) : 'format=rgba'
  const graph = `[1:v]scale=640:360:force_original_aspect_ratio=increase,crop=640:360[bg];[0:v]${kette},scale=w='min(600\\,iw)':h='min(340\\,ih)':force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto`
  const png = await roh(ffmpeg, [...fg, ...bg, '-filter_complex', graph, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'])
  return `data:image/png;base64,${png.toString('base64')}`
}

/** Länge einer Datei in Sekunden (ffprobe-frei über ffmpeg-Ausgabe) */
export async function dauerVon(ffmpeg: string, datei: string): Promise<number> {
  const text = await new Promise<string>((resolve) => execFile(ffmpeg, ['-i', datei], { windowsHide: true, timeout: 30_000 }, (_e, _o, stderr) => resolve(String(stderr))))
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(text)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
}
