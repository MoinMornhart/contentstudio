import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writePsdBuffer, type Layer, type Psd } from 'ag-psd'
import { EXPORT_GROESSEN, type ExportFormat } from '@shared/thumbnail'
import { skaliere, zuschnitt, type Box } from '../bild/komposit'
import { kodiereJpg, kodierePng, liesBild, type RohBild } from '../bild/rohbild'
import type { JobContext } from '../jobs/queue'
import { setzeTextUndLogo, type Bericht } from './render'
import type { VarianteErgebnis } from './typen'
import type { PyUmgebung, ThumbUmgebung } from './umgebung'

/**
 * Export (ROADMAP 4.10): PNG oder JPG in den Plattform-Formaten (16:9 YouTube, 9:16 Shorts/TikTok/Reels, 1:1 Instagram)
 * und PSD mit Ebenen (Hintergrund, Personen, Text, Logo) für die Weiterarbeit in Photoshop oder GIMP.
 * Hoch- und Quadratformat werden um die Gesichter herum zugeschnitten, damit niemand angeschnitten wird.
 */

/** Blickpunkt für den Zuschnitt: Mitte aller Köpfe (Hauptfigur doppelt gewichtet), sonst Bildmitte */
export function fokus(bericht: Bericht): [number, number] {
  const koepfe = Object.values(bericht.figuren ?? {})
    .map((f) => f.kopf_box)
    .filter((b): b is Box => !!b)
  if (!koepfe.length) return [0.5, 0.45]
  const gewichte = koepfe.map((_, i) => (i === 0 ? 2 : 1))
  const g = gewichte.reduce((a, b) => a + b, 0)
  const u = koepfe.reduce((s, b, i) => s + ((b[0] + b[2]) / 2) * gewichte[i]!, 0) / g
  const v = koepfe.reduce((s, b, i) => s + ((b[1] + b[3]) / 2) * gewichte[i]!, 0) / g
  return [u, v]
}

/** Ausschnitt mit Seitenverhältnis `ziel` (Breite/Höhe) um den Fokus, so groß wie möglich */
export function ausschnitt(w: number, h: number, ziel: number, f: [number, number]): { x: number; y: number; w: number; h: number } {
  let cw = w
  let ch = w / ziel
  if (ch > h) {
    ch = h
    cw = h * ziel
  }
  const x = Math.max(0, Math.min(w - cw, f[0] * w - cw / 2))
  const y = Math.max(0, Math.min(h - ch, f[1] * h - ch / 2))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(cw), h: Math.round(ch) }
}

export function imFormat(bild: RohBild, format: ExportFormat, bericht: Bericht): RohBild {
  const g = EXPORT_GROESSEN[format]
  const a = ausschnitt(bild.width, bild.height, g.breite / g.hoehe, fokus(bericht))
  return skaliere(zuschnitt(bild, a.x, a.y, a.w, a.h), g.breite, g.hoehe)
}

export async function exportiereBild(quelle: string, bericht: Bericht, format: ExportFormat, typ: 'png' | 'jpg', ziel: string): Promise<void> {
  const b = imFormat(await liesBild(quelle), format, bericht)
  await writeFile(ziel, typ === 'png' ? kodierePng(b) : kodiereJpg(b, 92))
}

/** Boxen des Berichts in die Koordinaten eines Ausschnitts umrechnen */
export function berichtImAusschnitt(b: Bericht, a: { x: number; y: number; w: number; h: number }, W: number, H: number): Bericht {
  const um = (box?: Box): Box | undefined => (box ? [(box[0] * W - a.x) / a.w, (box[1] * H - a.y) / a.h, (box[2] * W - a.x) / a.w, (box[3] * H - a.y) / a.h] : undefined)
  return {
    ...b,
    figuren: Object.fromEntries(Object.entries(b.figuren ?? {}).map(([k, f]) => [k, { ...f, box: um(f.box), kopf_box: um(f.kopf_box) }])),
    items: Object.fromEntries(Object.entries(b.items ?? {}).map(([k, i]) => [k, { ...i, box: um(i.box) }])),
    mobs: (b.mobs ?? []).map((m) => ({ ...m, box: um(m.box) }))
  }
}

/**
 * Hoch- und Quadratformat mit neu gesetztem Text: das Bild ohne Text um die Gesichter zuschneiden, dann Text und Logo
 * für das neue Format neu platzieren (sonst würde der Zuschnitt den Text abschneiden). 16:9 ist das fertige Bild.
 */
export async function exportiereFormat(o: {
  v: VarianteErgebnis
  format: ExportFormat
  typ: 'png' | 'jpg'
  ziel: string
  arbeit: string
  umgebung: ThumbUmgebung | null
  py: PyUmgebung | null
  marke: { schrift: string | null; logo: string | null; farben: string[] }
  ctx: JobContext<unknown>
}): Promise<void> {
  const { v, format } = o
  const bericht = v.bericht ? (JSON.parse(await readFile(v.bericht, 'utf8').catch(() => '{}')) as Bericht) : {}
  const g = EXPORT_GROESSEN[format]
  if (format === '16:9' || !v.roh) {
    const b = imFormat(await liesBild(v.bild!), format, bericht)
    await writeFile(o.ziel, o.typ === 'png' ? kodierePng(b) : kodiereJpg(b, 92))
    return
  }
  const roh = await liesBild(v.roh)
  const a = ausschnitt(roh.width, roh.height, g.breite / g.hoehe, fokus(bericht))
  const neu = skaliere(zuschnitt(roh, a.x, a.y, a.w, a.h), g.breite, g.hoehe)
  await mkdir(o.arbeit, { recursive: true })
  const basis = join(o.arbeit, `export-${format.replace(':', 'x')}`)
  await writeFile(`${basis}.roh.png`, kodierePng(neu))
  const b2 = berichtImAusschnitt(bericht, a, roh.width, roh.height)
  await writeFile(`${basis}.bericht.json`, JSON.stringify(b2))
  let fertig = `${basis}.roh.png`
  const kannText = v.schriftAssets ? !!o.umgebung?.blender : !!o.py
  if ((v.texte.length || o.marke.logo) && o.umgebung && kannText) {
    const tl = await setzeTextUndLogo(o.umgebung, o.py, fertig, b2, { texte: v.texte, minecraftAssets: v.schriftAssets ?? undefined, schrift: o.marke.schrift, farben: o.marke.farben, logo: o.marke.logo }, basis, o.ctx)
    fertig = tl.bild
  }
  const b = await liesBild(fertig)
  await writeFile(o.ziel, o.typ === 'png' ? kodierePng(b) : kodiereJpg(b, 92))
}

const EBENEN_REIHE = (n: string): number => (n === 'hintergrund.png' ? 0 : n.startsWith('person-') ? 1 : n === 'text.png' ? 2 : n === 'logo.png' ? 3 : 4)
const EBENEN_NAME: Record<string, string> = { 'hintergrund.png': 'Hintergrund', 'text.png': 'Text', 'logo.png': 'Logo' }

/** PSD mit Ebenen; ohne Ebenen-Ordner eine Ebene mit dem fertigen Bild */
export async function exportierePsd(bild: string, ebenen: string | null, ziel: string): Promise<number> {
  const gesamt = await liesBild(bild)
  const dateien = ebenen ? (await readdir(ebenen).catch(() => [] as string[])).filter((f) => f.endsWith('.png')).sort((a, b) => EBENEN_REIHE(a) - EBENEN_REIHE(b)) : []
  const layers: Layer[] = []
  for (const f of dateien) {
    let e = await liesBild(join(ebenen!, f))
    if (e.width !== gesamt.width || e.height !== gesamt.height) e = skaliere(e, gesamt.width, gesamt.height)
    layers.push({ name: EBENEN_NAME[f] ?? f.replace(/^person-/, '').replace(/\.png$/, ''), imageData: alsImageData(e) })
  }
  if (!layers.length) layers.push({ name: 'Thumbnail', imageData: alsImageData(gesamt) })
  // Übereinander müssen die Ebenen genau das fertige Bild ergeben (ROADMAP 7.4). Was die Ebenen allein nicht erklären
  // (Farbangleich, Licht, Kanten nach dem Zusammensetzen), kommt als oberste Ebene „Feinschliff“ dazu.
  const rest = feinschliff(gesamt, uebereinander(layers.map((l) => l.imageData as unknown as RohBild), gesamt.width, gesamt.height))
  if (rest) layers.push({ name: 'Feinschliff', imageData: alsImageData(rest) })
  const psd: Psd = { width: gesamt.width, height: gesamt.height, children: layers, imageData: alsImageData(gesamt) }
  await writeFile(ziel, Buffer.from(writePsdBuffer(psd, { generateThumbnail: false })))
  return layers.length
}

type PsdBild = NonNullable<Layer['imageData']>

/** Ebenen (RGBA, unten zuerst) übereinander wie „Normal“ in Photoshop: Deckkraft je Pixel, 8 Bit gerundet */
export function uebereinander(ebenen: RohBild[], breite: number, hoehe: number): RohBild {
  const aus = new Uint8Array(breite * hoehe * 4)
  for (const e of ebenen) {
    const d = e.data
    for (let i = 0; i < aus.length; i += 4) {
      const a = d[i + 3]! / 255
      if (a === 0) continue
      const unten = aus[i + 3]! / 255
      const neu = a + unten * (1 - a)
      for (let k = 0; k < 3; k++) aus[i + k] = Math.round((d[i + k]! * a + aus[i + k]! * unten * (1 - a)) / neu)
      aus[i + 3] = Math.round(neu * 255)
    }
  }
  return { width: breite, height: hoehe, data: aus }
}

/** Pixel, in denen das Ebenen-Ergebnis vom fertigen Bild abweicht, als deckende Ebene; null, wenn alles stimmt */
export function feinschliff(gesamt: RohBild, zusammen: RohBild): RohBild | null {
  const aus = new Uint8Array(gesamt.data.length)
  let abweichend = 0
  for (let i = 0; i < aus.length; i += 4) {
    const g = gesamt.data
    const z = zusammen.data
    if (g[i] === z[i] && g[i + 1] === z[i + 1] && g[i + 2] === z[i + 2] && g[i + 3] === z[i + 3]) continue
    aus.set([g[i]!, g[i + 1]!, g[i + 2]!, g[i + 3]!], i)
    abweichend++
  }
  return abweichend ? { width: gesamt.width, height: gesamt.height, data: aus } : null
}

function alsImageData(b: RohBild): PsdBild {
  return { width: b.width, height: b.height, data: new Uint8ClampedArray(b.data.buffer, b.data.byteOffset, b.data.length) } as unknown as PsdBild
}
