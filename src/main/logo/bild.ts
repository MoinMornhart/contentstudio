// Herkunft: MoinStudio src/main/logo/bild.ts (MIT), v0.38.0 – hier auf RohBild (RGBA, nicht vormultipliziert).
import type { RohBild } from '../bild/rohbild'

/**
 * Pixelarbeit für hochgeladene Logos und den Export: Freistellen, wenn ein Logo keine Transparenz hat (einfarbiger
 * Hintergrund, von den Rändern her entfernt), Zuschneiden und Auffüllen auf ein Quadrat (YouTube-Wasserzeichen).
 */

export function hatTransparenz(b: RohBild): boolean {
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i]! < 250) return true
  return false
}

/** Häufigste Randfarbe (auf 8er-Stufen gerundet) = Hintergrund */
function randFarbe(b: RohBild): [number, number, number] {
  const zaehler = new Map<number, number>()
  const nimm = (x: number, y: number): void => {
    const o = (y * b.width + x) * 4
    const k = ((b.data[o]! >> 3) << 10) | ((b.data[o + 1]! >> 3) << 5) | (b.data[o + 2]! >> 3)
    zaehler.set(k, (zaehler.get(k) ?? 0) + 1)
  }
  for (let x = 0; x < b.width; x++) {
    nimm(x, 0)
    nimm(x, b.height - 1)
  }
  for (let y = 0; y < b.height; y++) {
    nimm(0, y)
    nimm(b.width - 1, y)
  }
  const k = [...zaehler.entries()].sort((a, z) => z[1] - a[1])[0]![0]
  return [((k >> 10) << 3) + 4, (((k >> 5) & 31) << 3) + 4, ((k & 31) << 3) + 4]
}

/**
 * Hintergrund entfernen: alles, was vom Rand aus zusammenhängend fast die Randfarbe hat, wird durchsichtig; am Übergang
 * weich, damit keine Treppen entstehen. Innere Flächen in Hintergrundfarbe (das Loch im „O“) bleiben nur stehen, wenn
 * sie nicht mit dem Rand verbunden sind.
 */
export function freistellen(b: RohBild, toleranz = 38): RohBild {
  const { width: w, height: h } = b
  const px = Uint8Array.from(b.data)
  const [r, g, bl] = randFarbe(b)
  const abstand = (i: number): number => Math.hypot(px[i * 4]! - r, px[i * 4 + 1]! - g, px[i * 4 + 2]! - bl)
  const weg = new Uint8Array(w * h)
  const stapel: number[] = []
  const pruefe = (i: number): void => {
    if (!weg[i] && abstand(i) <= toleranz) {
      weg[i] = 1
      stapel.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    pruefe(x)
    pruefe((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    pruefe(y * w)
    pruefe(y * w + w - 1)
  }
  while (stapel.length) {
    const i = stapel.pop()!
    const x = i % w
    if (x > 0) pruefe(i - 1)
    if (x < w - 1) pruefe(i + 1)
    if (i >= w) pruefe(i - w)
    if (i < w * (h - 1)) pruefe(i + w)
  }
  for (let i = 0; i < w * h; i++) {
    let a = 255
    if (weg[i]) a = 0
    else {
      // Kante: Nachbar entfernt und Farbe nah am Hintergrund → teilweise durchsichtig
      const x = i % w
      const nachbar = (x > 0 && weg[i - 1]) || (x < w - 1 && weg[i + 1]) || (i >= w && weg[i - w]) || (i < w * (h - 1) && weg[i + w])
      if (nachbar) a = Math.round(255 * Math.min(1, Math.max(0.35, (abstand(i) - toleranz) / (toleranz * 2) + 0.35)))
    }
    px[i * 4 + 3] = Math.min(px[i * 4 + 3]!, a)
  }
  return { width: w, height: h, data: px }
}

/** Durchsichtigen Rand abschneiden, `rand` Pixel Luft lassen. */
export function zuschneiden(b: RohBild, rand = 0): RohBild {
  let x0 = b.width
  let y0 = b.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++)
      if (b.data[(y * b.width + x) * 4 + 3]! > 8) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  if (x1 < 0) return b
  x0 = Math.max(0, x0 - rand)
  y0 = Math.max(0, y0 - rand)
  x1 = Math.min(b.width - 1, x1 + rand)
  y1 = Math.min(b.height - 1, y1 + rand)
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) data.set(b.data.subarray(((y0 + y) * b.width + x0) * 4, ((y0 + y) * b.width + x0 + width) * 4), y * width * 4)
  return { width, height, data }
}

/** Auf ein durchsichtiges Quadrat setzen (mittig), z. B. für das YouTube-Wasserzeichen. */
export function aufQuadrat(b: RohBild): RohBild {
  const s = Math.max(b.width, b.height)
  const data = new Uint8Array(s * s * 4)
  const x0 = Math.floor((s - b.width) / 2)
  const y0 = Math.floor((s - b.height) / 2)
  for (let y = 0; y < b.height; y++) data.set(b.data.subarray(y * b.width * 4, (y + 1) * b.width * 4), ((y0 + y) * s + x0) * 4)
  return { width: s, height: s, data }
}

/** Zielgröße beim Export: längste Seite = n Pixel */
export function exportGroesse(breite: number, hoehe: number, n: number): { breite: number; hoehe: number } {
  const f = n / Math.max(breite, hoehe)
  return { breite: Math.max(1, Math.round(breite * f)), hoehe: Math.max(1, Math.round(hoehe * f)) }
}
