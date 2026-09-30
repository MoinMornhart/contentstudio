// Erzeugt build/icon.png (1024 px) und build/icon.ico (16–256 px) ohne Zusatzpakete: abgerundetes Quadrat mit
// Verlauf Violett → Türkis und weißem Play-Dreieck, wie das Logo in der Seitenleiste. Aufruf: npm run icon
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

type Rgba = [number, number, number, number]
const VON: [number, number, number] = [0x8b, 0x6c, 0xff]
const BIS: [number, number, number] = [0x2f, 0xd3, 0xe6]

/** Farbe an einem Punkt (0–1-Koordinaten), ohne Kantenglättung */
function farbe(x: number, y: number): Rgba {
  const r = 0.2 // Eckradius relativ zur Kantenlänge
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return [0, 0, 0, 0]
  // Play-Dreieck: Spitze rechts, leicht nach rechts versetzt (optische Mitte)
  const ax = 0.38, ay = 0.28, bx = 0.38, by = 0.72, px = 0.74, py = 0.5
  const seite = (x1: number, y1: number, x2: number, y2: number): number => (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
  const d1 = seite(ax, ay, px, py), d2 = seite(px, py, bx, by), d3 = seite(bx, by, ax, ay)
  if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return [255, 255, 255, 255]
  const t = (x + y) / 2
  return [Math.round(VON[0] + (BIS[0] - VON[0]) * t), Math.round(VON[1] + (BIS[1] - VON[1]) * t), Math.round(VON[2] + (BIS[2] - VON[2]) * t), 255]
}

/** Bild mit 4×4-Überabtastung (glatte Kanten) als RGBA-Puffer */
function bild(groesse: number): Buffer {
  const px = Buffer.alloc(groesse * groesse * 4)
  const n = 4
  for (let y = 0; y < groesse; y++) {
    for (let x = 0; x < groesse; x++) {
      const summe = [0, 0, 0, 0]
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = farbe((x + (sx + 0.5) / n) / groesse, (y + (sy + 0.5) / n) / groesse)
          // vormultipliziert mitteln, damit Kanten nicht dunkel werden
          summe[0]! += c[0] * c[3]
          summe[1]! += c[1] * c[3]
          summe[2]! += c[2] * c[3]
          summe[3]! += c[3]
        }
      }
      const a = summe[3]!
      const i = (y * groesse + x) * 4
      px[i] = a ? Math.round(summe[0]! / a) : 0
      px[i + 1] = a ? Math.round(summe[1]! / a) : 0
      px[i + 2] = a ? Math.round(summe[2]! / a) : 0
      px[i + 3] = Math.round(a / (n * n))
    }
  }
  return px
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf: Buffer): number {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(typ: string, daten: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(daten.length)
  const td = Buffer.concat([Buffer.from(typ, 'ascii'), daten])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(groesse: number): Buffer {
  const px = bild(groesse)
  const zeilen = Buffer.alloc((groesse * 4 + 1) * groesse)
  for (let y = 0; y < groesse; y++) px.copy(zeilen, y * (groesse * 4 + 1) + 1, y * groesse * 4, (y + 1) * groesse * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(groesse, 0)
  ihdr.writeUInt32BE(groesse, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 6 // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(zeilen, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/** ICO mit eingebetteten PNGs (von Windows seit Vista unterstützt) */
function ico(groessen: number[]): Buffer {
  const bilder = groessen.map(png)
  const kopf = Buffer.alloc(6)
  kopf.writeUInt16LE(0, 0)
  kopf.writeUInt16LE(1, 2)
  kopf.writeUInt16LE(bilder.length, 4)
  let offset = 6 + 16 * bilder.length
  const eintraege = bilder.map((b, i) => {
    const e = Buffer.alloc(16)
    const g = groessen[i]!
    e[0] = g >= 256 ? 0 : g
    e[1] = g >= 256 ? 0 : g
    e.writeUInt16LE(1, 4) // Farbebenen
    e.writeUInt16LE(32, 6) // Bit pro Pixel
    e.writeUInt32LE(b.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += b.length
    return e
  })
  return Buffer.concat([kopf, ...eintraege, ...bilder])
}

writeFileSync('build/icon.png', png(1024))
writeFileSync('build/icon.ico', ico([256, 128, 64, 48, 32, 16]))
console.log('build/icon.png + build/icon.ico geschrieben')
