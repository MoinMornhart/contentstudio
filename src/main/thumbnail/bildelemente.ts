import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Bildelemente für Foto-, Modell- und Grafik-Thumbnails (ROADMAP 8.1): echte Orte als Hintergrund und Gegenstände als
 * 3D-Sticker, damit das Thema ohne Titel erkennbar ist (Küche und Teller beim Kochen, Hantel beim Fitness). Beides
 * wird erst beim ersten Gebrauch geladen und lokal zwischengespeichert:
 * - Orte: Fotos („Backplates“) von Poly Haven, CC0 (api.polyhaven.com)
 * - Gegenstände: Fluent Emoji 3D von Microsoft, MIT-Lizenz (github.com/microsoft/fluentui-emoji)
 * Quellen und Lizenzen: docs/datenquellen.md. Schlägt etwas fehl, entsteht das Bild ohne das Element.
 */

export type Holen = typeof fetch

const POLYHAVEN = 'https://api.polyhaven.com'
const FLUENT = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets'
const KATALOG_TAGE = 30

export interface Ort {
  id: string
  name: string
  stichworte: string[]
}

/** Wörter für den Vergleich: klein, ohne Satzzeichen, einfache Mehrzahl entfernt */
function woerter(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/(ies)$/, 'y').replace(/s$/, ''))
}

/** Orte mit Fotos (Backplates) aus dem Poly-Haven-Katalog, 30 Tage zwischengespeichert */
export async function orteKatalog(ordner: string, holen: Holen = fetch): Promise<Ort[]> {
  const datei = join(ordner, 'orte.json')
  const alt = await stat(datei).catch(() => null)
  if (alt && Date.now() - alt.mtimeMs < KATALOG_TAGE * 86_400_000) return JSON.parse(await readFile(datei, 'utf8')) as Ort[]
  const r = await holen(`${POLYHAVEN}/assets?t=hdris`, { headers: { 'User-Agent': 'ContentStudio' } })
  if (!r.ok) throw new Error(`Poly Haven ${r.status}`)
  const roh = (await r.json()) as Record<string, { name: string; tags?: string[]; categories?: string[] }>
  const orte = Object.entries(roh)
    .filter(([, a]) => (a.tags ?? []).includes('backplates'))
    .map(([id, a]) => ({ id, name: a.name, stichworte: [...new Set([...woerter(id.replace(/_/g, ' ')), ...woerter(a.name), ...(a.tags ?? []).flatMap(woerter), ...(a.categories ?? []).flatMap(woerter)])] }))
  await mkdir(ordner, { recursive: true })
  await writeFile(datei, JSON.stringify(orte))
  return orte
}

/** Passendster Ort zu einer Suche („kitchen“, „gym“, „city street at night“); null, wenn nichts passt */
export function waehleOrt(orte: Ort[], suche: string): Ort | null {
  const such = woerter(suche)
  if (!such.length) return null
  let bester: { ort: Ort; wert: number } | null = null
  for (const ort of orte) {
    // Treffer im Namen zählen doppelt; bei Gleichstand gewinnt der Ort mit weniger Stichworten (spezifischer)
    const wert = such.reduce((s, w) => s + (ort.stichworte.includes(w) ? (woerter(ort.name).includes(w) ? 2 : 1) : 0), 0) - ort.stichworte.length / 1000
    if (wert >= 1 && (!bester || wert > bester.wert)) bester = { ort, wert }
  }
  return bester?.ort ?? null
}

async function lade(url: string, ziel: string, holen: Holen, md5?: string): Promise<string> {
  if (existsSync(ziel)) return ziel
  const r = await holen(url, { headers: { 'User-Agent': 'ContentStudio' } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  const daten = Buffer.from(await r.arrayBuffer())
  if (md5 && createHash('md5').update(daten).digest('hex') !== md5) throw new Error(`Prüfsumme falsch: ${url}`)
  await writeFile(`${ziel}.teil`, daten)
  await rename(`${ziel}.teil`, ziel)
  return ziel
}

/** Foto eines Ortes (erste Backplate), lokal zwischengespeichert */
export async function ortFoto(ordner: string, ort: Ort, holen: Holen = fetch): Promise<string> {
  const r = await holen(`${POLYHAVEN}/files/${encodeURIComponent(ort.id)}`, { headers: { 'User-Agent': 'ContentStudio' } })
  if (!r.ok) throw new Error(`Poly Haven ${r.status}`)
  const dateien = (await r.json()) as { backplates?: Record<string, { jpg_pretty?: { url: string; md5: string }; jpg_plain?: { url: string; md5: string } }> }
  const schluessel = Object.keys(dateien.backplates ?? {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0]
  const eintrag = schluessel ? (dateien.backplates![schluessel]!.jpg_pretty ?? dateien.backplates![schluessel]!.jpg_plain) : undefined
  if (!eintrag) throw new Error(`kein Foto für ${ort.id}`)
  await mkdir(ordner, { recursive: true })
  return lade(eintrag.url, join(ordner, `${ort.id}-${schluessel}.jpg`), holen, eintrag.md5)
}

/** Englischer Emoji-Name (CLDR, z. B. „hot pepper“) → mögliche Pfade im Fluent-Emoji-Archiv */
export function emojiPfade(name: string): string[] {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n || /[^a-z0-9 -]/.test(n)) return []
  const ordner = encodeURIComponent(n[0]!.toUpperCase() + n.slice(1))
  const datei = n.replace(/[ -]/g, '_')
  return [`${FLUENT}/${ordner}/3D/${datei}_3d.png`, `${FLUENT}/${ordner}/Default/3D/${datei}_3d_default.png`]
}

/** 3D-Sticker eines Gegenstands, lokal zwischengespeichert; null, wenn es ihn nicht gibt */
export async function emojiBild(ordner: string, name: string, holen: Holen = fetch): Promise<string | null> {
  await mkdir(ordner, { recursive: true })
  const ziel = (url: string): string => join(ordner, decodeURIComponent(url.split('/').pop()!))
  // erst alle Schreibweisen im Zwischenspeicher, dann im Netz
  const vorhanden = emojiPfade(name).map(ziel).find((z) => existsSync(z))
  if (vorhanden) return vorhanden
  for (const url of emojiPfade(name)) {
    try {
      return await lade(url, ziel(url), holen)
    } catch {
      // nächste Schreibweise versuchen
    }
  }
  return null
}

export interface Objekt {
  emoji: string
  x: number
  y: number
  groesse: number
  drehung?: number
}

/** Ort und Gegenstände einer Variante auflösen; was fehlt, fällt weg (mit Hinweis) */
export async function loeseElemente(
  werkzeugRoot: string,
  v: { hintergrund: { art: string; ort?: string }; objekte?: Objekt[] },
  holen: Holen = fetch
): Promise<{ ortFoto: string | null; objekte: (Objekt & { pfad: string })[]; hinweise: string[] }> {
  const hinweise: string[] = []
  let foto: string | null = null
  if (v.hintergrund.art === 'ort' && v.hintergrund.ort) {
    try {
      const ort = waehleOrt(await orteKatalog(join(werkzeugRoot, 'bilder', 'orte'), holen), v.hintergrund.ort)
      if (ort) foto = await ortFoto(join(werkzeugRoot, 'bilder', 'orte'), ort, holen)
      else hinweise.push(`Kein Ortsfoto zu „${v.hintergrund.ort}“ – Farbverlauf stattdessen`)
    } catch (e) {
      hinweise.push(`Ortsfoto nicht geladen (${e instanceof Error ? e.message : String(e)}) – Farbverlauf stattdessen`)
    }
  }
  const objekte: (Objekt & { pfad: string })[] = []
  for (const o of v.objekte ?? []) {
    const pfad = await emojiBild(join(werkzeugRoot, 'bilder', 'emoji'), o.emoji, holen).catch(() => null)
    if (pfad) objekte.push({ ...o, pfad })
    else hinweise.push(`Gegenstand „${o.emoji}“ nicht gefunden – weggelassen`)
  }
  return { ortFoto: foto, objekte, hinweise }
}
