import { hex, luma, saettigung, verkleinere, type RohBild } from './rohbild'

/**
 * Lokale Bildanalyse ohne KI (ROADMAP 4.1 und 4.8): Farben, Helligkeit, Kontrast, Sättigung, Detailreichtum und der
 * optische Schwerpunkt. Läuft auf jedem Rechner in Millisekunden und liefert die Messwerte, die auch ohne Bild-KI ins
 * Stilbuch und in die technische Selbstprüfung eingehen.
 */
export interface LokaleAnalyse {
  breite: number
  hoehe: number
  /** Mittlere Helligkeit 0–1 */
  helligkeit: number
  /** Streuung der Helligkeit, auf 0–1 gebracht */
  kontrast: number
  /** Mittlere Sättigung 0–1 */
  saettigung: number
  /** Hauptfarben mit Anteil (höchstens 5, deutlich verschieden) */
  farben: { farbe: string; anteil: number }[]
  /** Kantenstärke 0–1: wenig = ruhige Flächen, viel = unruhiger Hintergrund */
  detail: number
  /** Optischer Schwerpunkt [u, v] (0–1, oben links = 0,0) */
  schwerpunkt: [number, number]
  /** Anteil fast weißer bzw. fast schwarzer Pixel */
  ueberstrahlt: number
  abgesoffen: number
}

export function analysiere(original: RohBild): LokaleAnalyse {
  const b = verkleinere(original, 160)
  const n = b.width * b.height
  const L = new Float32Array(n)
  let summeL = 0
  let summeS = 0
  let hell = 0
  let dunkel = 0
  const eimer = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < n; i++) {
    const r = b.data[i * 4]!
    const g = b.data[i * 4 + 1]!
    const bl = b.data[i * 4 + 2]!
    const l = luma(r, g, bl)
    L[i] = l
    summeL += l
    summeS += saettigung(r, g, bl)
    if (l > 0.97) hell++
    if (l < 0.03) dunkel++
    // 4 Bit je Kanal als Farbeimer
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4)
    const e = eimer.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++
    e.r += r
    e.g += g
    e.b += bl
    eimer.set(k, e)
  }
  const mittel = summeL / n
  let varianz = 0
  for (let i = 0; i < n; i++) varianz += (L[i]! - mittel) ** 2
  const std = Math.sqrt(varianz / n)

  // Kanten und Schwerpunkt: Gewicht = Kantenstärke + Abweichung von der mittleren Farbe (was sich vom Grund abhebt)
  const mf = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mf[c]! += b.data[i * 4 + c]! / n
  let kanten = 0
  let gw = 0
  let gu = 0
  let gv = 0
  for (let y = 1; y < b.height - 1; y++)
    for (let x = 1; x < b.width - 1; x++) {
      const i = y * b.width + x
      const gx = L[i + 1]! - L[i - 1]!
      const gy = L[i + b.width]! - L[i - b.width]!
      const k = Math.sqrt(gx * gx + gy * gy)
      kanten += k
      const abw = Math.hypot(b.data[i * 4]! - mf[0]!, b.data[i * 4 + 1]! - mf[1]!, b.data[i * 4 + 2]! - mf[2]!) / 441
      const w = k + abw * abw * 2
      gw += w
      gu += w * (x / b.width)
      gv += w * (y / b.height)
    }
  const innen = Math.max(1, (b.width - 2) * (b.height - 2))

  return {
    breite: original.width,
    hoehe: original.height,
    helligkeit: runde(mittel),
    kontrast: runde(Math.min(1, std * 2.5)),
    saettigung: runde(summeS / n),
    farben: hauptfarben(eimer, n),
    detail: runde(Math.min(1, (kanten / innen) * 6)),
    schwerpunkt: gw > 0 ? [runde(gu / gw), runde(gv / gw)] : [0.5, 0.5],
    ueberstrahlt: runde(hell / n),
    abgesoffen: runde(dunkel / n)
  }
}

const runde = (x: number): number => Math.round(x * 1000) / 1000

function hauptfarben(eimer: Map<number, { n: number; r: number; g: number; b: number }>, gesamt: number): LokaleAnalyse['farben'] {
  const sortiert = [...eimer.values()].sort((a, b) => b.n - a.n)
  const gewaehlt: { r: number; g: number; b: number; n: number }[] = []
  for (const e of sortiert) {
    const f = { r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n }
    const nah = gewaehlt.find((x) => Math.abs(x.r - f.r) + Math.abs(x.g - f.g) + Math.abs(x.b - f.b) < 90)
    if (nah) {
      nah.n += f.n
      continue
    }
    if (gewaehlt.length < 5) gewaehlt.push(f)
  }
  return gewaehlt.sort((a, b) => b.n - a.n).map((f) => ({ farbe: hex(f.r, f.g, f.b), anteil: runde(f.n / gesamt) }))
}

// --- Farbübertragung (Auftrags-Vorbild „nur die Farben“, ROADMAP 4.2) -------------------------------------------

function zuLinear(c: number): number {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
function ausLinear(x: number): number {
  const c = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}
const fLab = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
const fLabInv = (t: number): number => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))

export function rgbZuLab(r: number, g: number, b: number): [number, number, number] {
  const R = zuLinear(r)
  const G = zuLinear(g)
  const B = zuLinear(b)
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const fx = fLab(X)
  const fy = fLab(Y)
  const fz = fLab(Z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labZuRgb(L: number, a: number, bb: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - bb / 200
  const X = fLabInv(fx) * 0.95047
  const Y = fLabInv(fy)
  const Z = fLabInv(fz) * 1.08883
  const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z
  const G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z
  const B = 0.0557 * X - 0.204 * Y + 1.057 * Z
  return [ausLinear(R), ausLinear(G), ausLinear(B)]
}

function labStatistik(b: RohBild): { mittel: [number, number, number]; std: [number, number, number] } {
  const k = verkleinere(b, 200)
  const n = k.width * k.height
  const s = [0, 0, 0]
  const q = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const lab = rgbZuLab(k.data[i * 4]!, k.data[i * 4 + 1]!, k.data[i * 4 + 2]!)
    for (let c = 0; c < 3; c++) {
      s[c]! += lab[c]!
      q[c]! += lab[c]! ** 2
    }
  }
  const mittel = s.map((x) => x / n) as [number, number, number]
  const std = q.map((x, c) => Math.sqrt(Math.max(1e-6, x / n - mittel[c]! ** 2))) as [number, number, number]
  return { mittel, std }
}

/**
 * Überträgt die Farbstimmung der Referenz auf das Bild (Reinhard im Lab-Raum). `staerke` 0–1 mischt mit dem Original.
 * Der Bildaufbau bleibt unverändert: jedes Pixel behält seine Lage, nur die Farbwerte verschieben sich.
 */
export function uebertrageFarben(ziel: RohBild, referenz: RohBild, staerke = 0.8): RohBild {
  const z = labStatistik(ziel)
  const r = labStatistik(referenz)
  const out = new Uint8Array(ziel.data.length)
  const tabelle = new Map<number, [number, number, number]>()
  for (let i = 0; i < ziel.width * ziel.height; i++) {
    const o = i * 4
    const key = (ziel.data[o]! << 16) | (ziel.data[o + 1]! << 8) | ziel.data[o + 2]!
    let neu = tabelle.get(key)
    if (!neu) {
      const lab = rgbZuLab(ziel.data[o]!, ziel.data[o + 1]!, ziel.data[o + 2]!)
      // Helligkeit nur halb angleichen, damit Gesichter und Figuren lesbar bleiben
      const t = lab.map((v, c) => {
        const x = ((v - z.mittel[c]!) / z.std[c]!) * r.std[c]! + r.mittel[c]!
        const s = c === 0 ? staerke * 0.5 : staerke
        return v + (x - v) * s
      }) as [number, number, number]
      neu = labZuRgb(t[0], t[1], t[2])
      if (tabelle.size < 200_000) tabelle.set(key, neu)
    }
    out[o] = neu[0]
    out[o + 1] = neu[1]
    out[o + 2] = neu[2]
    out[o + 3] = ziel.data[o + 3]!
  }
  return { width: ziel.width, height: ziel.height, data: out }
}

/** Mittlerer Farbabstand zweier Paletten im Lab-Raum (für Tests und die Selbstprüfung) */
export function farbAbstand(a: RohBild, b: RohBild): number {
  const x = labStatistik(a).mittel
  const y = labStatistik(b).mittel
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/** Kantenbild als Vergleich des Bildaufbaus: Korrelation der Helligkeitskanten zweier gleich großer Bilder (−1…1) */
export function aufbauAehnlichkeit(a: RohBild, b: RohBild): number {
  const ka = kantenfeld(verkleinere(a, 128))
  const kb = kantenfeld(verkleinere(b, 128))
  const n = Math.min(ka.length, kb.length)
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += ka[i]!
    mb += kb[i]!
  }
  ma /= n
  mb /= n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    const da = ka[i]! - ma
    const db = kb[i]! - mb
    sab += da * db
    saa += da * da
    sbb += db * db
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0
}

function kantenfeld(b: RohBild): Float32Array {
  const out = new Float32Array(b.width * b.height)
  const L = (x: number, y: number): number => {
    const i = (y * b.width + x) * 4
    return luma(b.data[i]!, b.data[i + 1]!, b.data[i + 2]!)
  }
  for (let y = 1; y < b.height - 1; y++) for (let x = 1; x < b.width - 1; x++) out[y * b.width + x] = Math.hypot(L(x + 1, y) - L(x - 1, y), L(x, y + 1) - L(x, y - 1))
  return out
}
