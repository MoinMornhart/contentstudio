import { readFile, writeFile } from 'node:fs/promises'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

/**
 * Bilder ohne Zusatzprogramme lesen und schreiben (PNG und JPEG, reines JavaScript). Grundlage für die lokale
 * Bildanalyse (Vorbilder, Selbstprüfung), Farbübertragung und den PSD-Export.
 */
export interface RohBild {
  width: number
  height: number
  /** RGBA, 8 Bit je Kanal */
  data: Uint8Array
}

export class BildFormatFehler extends Error {}

export function dekodiere(puffer: Buffer): RohBild {
  if (puffer.length > 8 && puffer.readUInt32BE(0) === 0x89504e47) {
    const png = PNG.sync.read(puffer)
    return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) }
  }
  if (puffer.length > 3 && puffer[0] === 0xff && puffer[1] === 0xd8) {
    const j = jpeg.decode(puffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 })
    return { width: j.width, height: j.height, data: j.data }
  }
  throw new BildFormatFehler('PNG/JPEG')
}

export async function liesBild(pfad: string): Promise<RohBild> {
  return dekodiere(await readFile(pfad))
}

export function kodierePng(b: RohBild): Buffer {
  const png = new PNG({ width: b.width, height: b.height })
  Buffer.from(b.data.buffer, b.data.byteOffset, b.data.length).copy(png.data)
  return PNG.sync.write(png)
}

export async function schreibePng(pfad: string, b: RohBild): Promise<void> {
  await writeFile(pfad, kodierePng(b))
}

export function kodiereJpg(b: RohBild, qualitaet = 92): Buffer {
  return jpeg.encode({ width: b.width, height: b.height, data: Buffer.from(b.data.buffer, b.data.byteOffset, b.data.length) }, qualitaet).data
}

/** Verkleinert grob (Mittelwert je Block) – für Analysen reichen ~160 px Breite. */
export function verkleinere(b: RohBild, zielBreite = 160): RohBild {
  if (b.width <= zielBreite) return b
  const f = b.width / zielBreite
  const w = zielBreite
  const h = Math.max(1, Math.round(b.height / f))
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * f)
    const y1 = Math.min(b.height, Math.floor((y + 1) * f))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * f)
      const x1 = Math.min(b.width, Math.floor((x + 1) * f))
      const s = [0, 0, 0, 0]
      let n = 0
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * b.width + xx) * 4
          s[0]! += b.data[i]!
          s[1]! += b.data[i + 1]!
          s[2]! += b.data[i + 2]!
          s[3]! += b.data[i + 3]!
          n++
        }
      const o = (y * w + x) * 4
      for (let k = 0; k < 4; k++) out[o + k] = Math.round(s[k]! / Math.max(1, n))
    }
  }
  return { width: w, height: h, data: out }
}

export const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

export function ausHex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Helligkeit 0–1 (Rec. 709) */
export const luma = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

export function saettigung(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}
