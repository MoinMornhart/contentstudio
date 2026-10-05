import type { RohBild } from './rohbild'

/**
 * Einfache Bildbearbeitung in JavaScript: skalieren, zuschneiden, übereinanderlegen, weichzeichnen, Masken und
 * Differenz-Ebenen. Grundlage für Logo, Export-Formate und PSD-Ebenen (ROADMAP 4.7, 4.10).
 */

export type Box = [number, number, number, number]

export function leer(width: number, height: number): RohBild {
  return { width, height, data: new Uint8Array(width * height * 4) }
}

/** Bilinear skalieren */
export function skaliere(b: RohBild, w: number, h: number): RohBild {
  w = Math.max(1, Math.round(w))
  h = Math.max(1, Math.round(h))
  const out = new Uint8Array(w * h * 4)
  const fx = b.width / w
  const fy = b.height / h
  for (let y = 0; y < h; y++) {
    const sy = Math.min(b.height - 1, Math.max(0, (y + 0.5) * fy - 0.5))
    const y0 = Math.floor(sy)
    const y1 = Math.min(b.height - 1, y0 + 1)
    const ty = sy - y0
    for (let x = 0; x < w; x++) {
      const sx = Math.min(b.width - 1, Math.max(0, (x + 0.5) * fx - 0.5))
      const x0 = Math.floor(sx)
      const x1 = Math.min(b.width - 1, x0 + 1)
      const tx = sx - x0
      const o = (y * w + x) * 4
      for (let c = 0; c < 4; c++) {
        const a = b.data[(y0 * b.width + x0) * 4 + c]! * (1 - tx) + b.data[(y0 * b.width + x1) * 4 + c]! * tx
        const d = b.data[(y1 * b.width + x0) * 4 + c]! * (1 - tx) + b.data[(y1 * b.width + x1) * 4 + c]! * tx
        out[o + c] = Math.round(a * (1 - ty) + d * ty)
      }
    }
  }
  return { width: w, height: h, data: out }
}

/** Ausschnitt in Pixeln (wird an den Bildrand geklemmt) */
export function zuschnitt(b: RohBild, x: number, y: number, w: number, h: number): RohBild {
  x = Math.max(0, Math.min(b.width - 1, Math.round(x)))
  y = Math.max(0, Math.min(b.height - 1, Math.round(y)))
  w = Math.max(1, Math.min(b.width - x, Math.round(w)))
  h = Math.max(1, Math.min(b.height - y, Math.round(h)))
  const out = new Uint8Array(w * h * 4)
  for (let r = 0; r < h; r++) out.set(b.data.subarray(((y + r) * b.width + x) * 4, ((y + r) * b.width + x + w) * 4), r * w * 4)
  return { width: w, height: h, data: out }
}

/** `oben` mit Alpha auf `ziel` legen (verändert `ziel`) */
export function legeAuf(ziel: RohBild, oben: RohBild, x: number, y: number): RohBild {
  x = Math.round(x)
  y = Math.round(y)
  for (let r = 0; r < oben.height; r++) {
    const zy = y + r
    if (zy < 0 || zy >= ziel.height) continue
    for (let c = 0; c < oben.width; c++) {
      const zx = x + c
      if (zx < 0 || zx >= ziel.width) continue
      const q = (r * oben.width + c) * 4
      const a = oben.data[q + 3]! / 255
      if (a <= 0) continue
      const z = (zy * ziel.width + zx) * 4
      const za = ziel.data[z + 3]! / 255
      const ra = a + za * (1 - a)
      for (let k = 0; k < 3; k++) ziel.data[z + k] = Math.round((oben.data[q + k]! * a + ziel.data[z + k]! * za * (1 - a)) / Math.max(ra, 1e-6))
      ziel.data[z + 3] = Math.round(ra * 255)
    }
  }
  return ziel
}

/** Schneller Weichzeichner (dreimal Kastenfilter auf verkleinertem Bild, dann wieder vergrößert) */
export function weichzeichnen(b: RohBild, staerke = 24): RohBild {
  const f = Math.max(1, Math.round(staerke / 3))
  let k = skaliere(b, b.width / f, b.height / f)
  for (let i = 0; i < 3; i++) k = kastenfilter(k, 2)
  return skaliere(k, b.width, b.height)
}

function kastenfilter(b: RohBild, r: number): RohBild {
  const tmp = new Float32Array(b.width * b.height * 4)
  const out = new Uint8Array(b.data.length)
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0
        let n = 0
        for (let d = -r; d <= r; d++) {
          const xx = Math.min(b.width - 1, Math.max(0, x + d))
          s += b.data[(y * b.width + xx) * 4 + c]!
          n++
        }
        tmp[(y * b.width + x) * 4 + c] = s / n
      }
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0
        let n = 0
        for (let d = -r; d <= r; d++) {
          const yy = Math.min(b.height - 1, Math.max(0, y + d))
          s += tmp[(yy * b.width + x) * 4 + c]!
          n++
        }
        out[(y * b.width + x) * 4 + c] = Math.round(s / n)
      }
  return { width: b.width, height: b.height, data: out }
}

/** Nur die Teile von `bild`, die in `maske` hell sind (weiß = sichtbar); Maske wird bei Bedarf skaliert */
export function maskiere(bild: RohBild, maske: RohBild): RohBild {
  const m = maske.width === bild.width && maske.height === bild.height ? maske : skaliere(maske, bild.width, bild.height)
  const out = new Uint8Array(bild.data)
  for (let i = 0; i < bild.width * bild.height; i++) {
    const hell = (m.data[i * 4]! + m.data[i * 4 + 1]! + m.data[i * 4 + 2]!) / 3
    out[i * 4 + 3] = Math.round((hell * m.data[i * 4 + 3]!) / 255)
  }
  return { width: bild.width, height: bild.height, data: out }
}

/** Ebene aus dem Unterschied zweier gleich großer Bilder (z. B. nur der gesetzte Text) */
export function differenzEbene(mit: RohBild, ohne: RohBild, schwelle = 18): RohBild {
  const out = new Uint8Array(mit.data.length)
  for (let i = 0; i < mit.width * mit.height; i++) {
    const o = i * 4
    const d = Math.abs(mit.data[o]! - ohne.data[o]!) + Math.abs(mit.data[o + 1]! - ohne.data[o + 1]!) + Math.abs(mit.data[o + 2]! - ohne.data[o + 2]!)
    if (d > schwelle) {
      out[o] = mit.data[o]!
      out[o + 1] = mit.data[o + 1]!
      out[o + 2] = mit.data[o + 2]!
      out[o + 3] = 255
    }
  }
  return { width: mit.width, height: mit.height, data: out }
}

export function ueberlappung(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  return w * h
}

/** Logo genau in eine Box setzen (Bildanteile 0–1), Seitenverhältnis bleibt; liefert Bild und Logo-Ebene. */
export function setzeLogoIn(bild: RohBild, logo: RohBild, box: Box): { bild: RohBild; ebene: RohBild; box: Box } {
  const bw = (box[2] - box[0]) * bild.width
  const bh = (box[3] - box[1]) * bild.height
  const f = Math.min(bw / logo.width, bh / logo.height)
  const lw = Math.max(1, Math.round(logo.width * f))
  const lh = Math.max(1, Math.round(logo.height * f))
  const klein = skaliere(logo, lw, lh)
  const x = box[0] * bild.width + (bw - lw) / 2
  const y = box[1] * bild.height + (bh - lh) / 2
  const ebene = legeAuf(leer(bild.width, bild.height), klein, x, y)
  const neu = legeAuf({ width: bild.width, height: bild.height, data: new Uint8Array(bild.data) }, klein, x, y)
  return { bild: neu, ebene, box }
}

/**
 * Logo in eine freie Ecke (unten bevorzugt). `breite` = Anteil der Bildbreite (Stilbuch: 12–20 %). Liefert das Bild mit
 * Logo, die Logo-Ebene und die gewählte Box – oder null, wenn jede Ecke Wichtiges überdeckt.
 */
export function setzeLogo(bild: RohBild, logo: RohBild, sperren: Box[], breite = 0.16): { bild: RohBild; ebene: RohBild; box: Box; frei: boolean } {
  let lw = Math.round(bild.width * breite)
  let lh = Math.round((logo.height * lw) / logo.width)
  if (lh > bild.height * 0.22) {
    lh = Math.round(bild.height * 0.22)
    lw = Math.round((logo.width * lh) / logo.height)
  }
  const rand = 0.03
  const bw = lw / bild.width
  const bh = lh / bild.height
  const ecken: Box[] = [
    [1 - rand - bw, 1 - rand - bh, 1 - rand, 1 - rand],
    [rand, 1 - rand - bh, rand + bw, 1 - rand],
    [1 - rand - bw, rand, 1 - rand, rand + bh],
    [rand, rand, rand + bw, rand + bh]
  ]
  const kosten = (e: Box): number => sperren.reduce((s, b) => s + ueberlappung(e, b), 0)
  const box = ecken.reduce((a, b) => (kosten(b) < kosten(a) ? b : a))
  const klein = skaliere(logo, lw, lh)
  const ebene = legeAuf(leer(bild.width, bild.height), klein, box[0] * bild.width, box[1] * bild.height)
  const neu = legeAuf({ width: bild.width, height: bild.height, data: new Uint8Array(bild.data) }, klein, box[0] * bild.width, box[1] * bild.height)
  return { bild: neu, ebene, box, frei: kosten(box) === 0 }
}
