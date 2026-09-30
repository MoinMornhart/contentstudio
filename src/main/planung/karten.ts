import { randomBytes } from 'node:crypto'
import { watch } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { PLATTFORMEN } from '@shared/profil'
import { SPALTEN, type Spalte } from '@shared/planung'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import { t } from '../i18n'

// Herkunft: MoinStudio src/main/planung/karten.ts (MIT), verallgemeinert: Konto aus dem Creator-Profil statt fester
// Kanäle, Texte für jede Plattform, Cross-Posting-Plan.
/**
 * Planung (ROADMAP 6.1): eine JSON-Datei pro Karte in `<Daten>/planning/cards`.
 *
 * PC und Laptop teilen den Datenordner über iCloud oder OneDrive. Damit sich zwei Geräte nicht in die Quere kommen,
 * berührt jede Änderung nur die Datei einer Karte, die Reihenfolge steht als Bruchzahl in der Karte selbst, und jedes
 * Feld merkt sich, wann es zuletzt geändert wurde. Legt der Sync-Dienst bei gleichzeitigen Änderungen eine
 * Konfliktkopie an (OneDrive „<id>-LAPTOP.json“, iCloud „<id> 2.json“), werden beide Fassungen Feld für Feld
 * zusammengeführt: Es gewinnt jeweils die jüngere Änderung.
 */

export { SPALTEN, type Spalte }

const KarteSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+$/),
  /** Konto im Creator-Profil */
  kontoId: z.string().min(1),
  spalte: z.enum(SPALTEN),
  ordnung: z.number(),
  titel: z.string(),
  notizen: z.string().default(''),
  checkliste: z.array(z.object({ text: z.string(), erledigt: z.boolean() })).default([]),
  /** Upload-Termin als lokale Zeit „2026-10-03T17:00“ oder null */
  termin: z.string().nullable().default(null),
  /** Verknüpfungen zu den anderen Reitern (ROADMAP 6.2) */
  // Thumbnail-Auftrag (nur auf dem Gerät bekannt, das ihn gestartet hat) und Bild relativ zum Datenordner (überall sichtbar)
  thumbnail: z.object({ auftrag: z.string().nullable(), bild: z.string().nullable(), gewaehlt: z.boolean() }).nullable().catch(null).default(null),
  schnitt: z.string().nullable().default(null),
  /** Titel, Text und Kapitel für die Plattform (aus dem Export oder von Hand) */
  texte: z.object({ plattform: z.enum(PLATTFORMEN), titel: z.string(), beschreibung: z.string(), kapitel: z.string() }).nullable().catch(null).default(null),
  /** Cross-Posting-Plan (ROADMAP 6.4) */
  crossposting: z
    .array(z.object({ kontoId: z.string(), plattform: z.enum(PLATTFORMEN), art: z.enum(['lang', 'kurz']), von: z.number().nullable(), bis: z.number().nullable(), titel: z.string(), termin: z.string(), erledigt: z.boolean() }))
    .catch([])
    .default([]),
  erstellt: z.string(),
  rev: z.number().int(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  /** Zeitpunkt der letzten Änderung je Feld – Grundlage fürs Zusammenführen von Konfliktkopien */
  felder: z.record(z.string(), z.string()).default({})
})
export type Karte = z.infer<typeof KarteSchema>

/** Felder, die der Creator ändern kann (alles andere verwaltet der Speicher). */
export const FELDER = ['kontoId', 'spalte', 'ordnung', 'titel', 'notizen', 'checkliste', 'termin', 'thumbnail', 'schnitt', 'texte', 'crossposting'] as const
export type KartenAenderung = Partial<Pick<Karte, (typeof FELDER)[number]>>

export const kartenOrdner = (daten: string): string => join(daten, 'planning', 'cards')

/** Sortierbare, kurze ID ohne Bindestriche (sonst verwechselt die Konflikterkennung sie mit „-GERÄT“). */
export function neueId(jetzt = Date.now()): string {
  return jetzt.toString(36).padStart(9, '0') + randomBytes(4).toString('hex')
}

/** Zu welcher Karte gehört eine Datei? `abc.json` ist das Original, `abc-LAPTOP.json`, `abc 2.json` usw. sind Kopien. */
export function karteVonDatei(name: string): { id: string; kopie: boolean } | null {
  const m = /^([a-z0-9]{10,})(.*)\.json$/i.exec(name)
  if (!m || /^[a-z0-9]/i.test(m[2])) return null
  return { id: m[1].toLowerCase(), kopie: m[2] !== '' }
}

const gleich = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
// Ein Feld ohne eigene Zeit wurde seit dem Anlegen nicht geändert und verliert gegen jede echte Änderung
const feldZeit = (k: Karte, f: string): string => k.felder[f] ?? ''

/** Führt Fassungen derselben Karte zusammen: je Feld gewinnt die jüngste Änderung. */
export function fuehreZusammen(fassungen: Karte[]): Karte {
  const [erste, ...rest] = [...fassungen].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const karte: Karte = structuredClone(erste)
  for (const andere of rest) {
    for (const f of FELDER) {
      if (feldZeit(andere, f) > feldZeit(karte, f)) {
        ;(karte as Record<string, unknown>)[f] = structuredClone(andere[f])
        karte.felder[f] = feldZeit(andere, f)
      }
    }
  }
  karte.rev = Math.max(...fassungen.map((k) => k.rev)) + 1
  return karte
}

/** Wendet eine Änderung an und merkt sich pro geändertem Feld die Zeit. Ohne echte Änderung bleibt die Karte gleich. */
export function wendeAn(karte: Karte, aenderung: KartenAenderung, geraet = hostname(), jetzt = new Date().toISOString()): Karte {
  const neu: Karte = structuredClone(karte)
  let geaendert = false
  for (const f of FELDER) {
    if (!(f in aenderung) || gleich(aenderung[f], karte[f])) continue
    ;(neu as Record<string, unknown>)[f] = structuredClone(aenderung[f])
    neu.felder[f] = jetzt
    geaendert = true
  }
  if (!geaendert) return karte
  return { ...neu, rev: karte.rev + 1, updatedAt: jetzt, updatedBy: geraet }
}

/** Reihenfolge-Wert für Position `index` in einer Spalte (ohne die verschobene Karte). null: Spalte neu durchzählen. */
export function ordnungFuer(spalte: Karte[], index: number): number | null {
  const liste = [...spalte].sort((a, b) => a.ordnung - b.ordnung)
  const i = Math.max(0, Math.min(index, liste.length))
  const vor = liste[i - 1]?.ordnung
  const nach = liste[i]?.ordnung
  if (vor === undefined && nach === undefined) return 1
  if (vor === undefined) return nach! - 1
  if (nach === undefined) return vor + 1
  const mitte = (vor + nach) / 2
  return mitte > vor && mitte < nach && nach - vor > 1e-9 ? mitte : null
}

/** Liest alle Karten; Konfliktkopien werden zusammengeführt, gespeichert und entfernt. Defekte Dateien werden übersprungen. */
export async function ladeKarten(daten: string, geraet = hostname()): Promise<Karte[]> {
  const ordner = kartenOrdner(daten)
  const namen = await readdir(ordner).catch(() => [] as string[])
  const gruppen = new Map<string, string[]>()
  for (const n of namen) {
    const k = karteVonDatei(n)
    if (k) gruppen.set(k.id, [...(gruppen.get(k.id) ?? []), n])
  }
  const karten: Karte[] = []
  for (const [id, dateien] of gruppen) {
    const fassungen: { name: string; karte: Karte }[] = []
    for (const name of dateien) {
      const r = await readJson(join(ordner, name), KarteSchema)
      if (r.ok && r.value.id === id) fassungen.push({ name, karte: r.value })
    }
    if (!fassungen.length) continue
    if (fassungen.length === 1 && fassungen[0].name === `${id}.json`) {
      karten.push(fassungen[0].karte)
      continue
    }
    const karte = { ...fuehreZusammen(fassungen.map((f) => f.karte)), updatedBy: geraet }
    await writeJsonAtomic(join(ordner, `${id}.json`), karte)
    for (const f of fassungen) if (f.name !== `${id}.json`) await rm(join(ordner, f.name), { force: true })
    karten.push(karte)
  }
  return karten.sort((a, b) => a.ordnung - b.ordnung)
}

// Änderungen an derselben Karte nacheinander ausführen (Oberfläche, MCP-App und Automatik können gleichzeitig schreiben)
const sperren = new Map<string, Promise<unknown>>()
async function gesperrt<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const vorher = sperren.get(id) ?? Promise.resolve()
  const lauf = vorher.catch(() => undefined).then(fn)
  sperren.set(id, lauf)
  try {
    return await lauf
  } finally {
    if (sperren.get(id) === lauf) sperren.delete(id)
  }
}

async function ladeKarte(daten: string, id: string): Promise<Karte | null> {
  const r = await readJson(join(kartenOrdner(daten), `${id}.json`), KarteSchema)
  return r.ok ? r.value : null
}

/** Neue Karte am Ende der Spalte. */
export async function neueKarte(daten: string, basis: Pick<Karte, 'kontoId' | 'titel'> & KartenAenderung, geraet = hostname()): Promise<Karte> {
  const alle = await ladeKarten(daten, geraet)
  const spalte = basis.spalte ?? 'idee'
  const jetzt = new Date().toISOString()
  const karte = KarteSchema.parse({
    ...basis,
    id: neueId(),
    spalte,
    ordnung: basis.ordnung ?? ordnungFuer(alle.filter((k) => k.kontoId === basis.kontoId && k.spalte === spalte), Infinity)!,
    erstellt: jetzt,
    rev: 1,
    updatedAt: jetzt,
    updatedBy: geraet,
    felder: {}
  })
  await writeJsonAtomic(join(kartenOrdner(daten), `${karte.id}.json`), karte)
  return karte
}

/**
 * Prüft eine Änderung. Nur die übergebenen Felder bleiben übrig – `partial()` allein würde bei fehlenden Feldern die
 * Standardwerte einsetzen (leere Notizen, kein Termin) und damit alles andere löschen.
 */
export function pruefeAenderung(aenderung: unknown): KartenAenderung {
  const roh = (aenderung ?? {}) as Record<string, unknown>
  const geprueft = KarteSchema.pick(Object.fromEntries(FELDER.map((f) => [f, true])) as { [K in (typeof FELDER)[number]]: true }).partial().parse(roh)
  return Object.fromEntries(Object.entries(geprueft).filter(([f]) => f in roh)) as KartenAenderung
}

/** Ändert Felder einer Karte (liest vorher neu ein, damit Änderungen vom anderen Gerät erhalten bleiben). */
export async function aendereKarte(daten: string, id: string, aenderung: KartenAenderung, geraet = hostname()): Promise<Karte> {
  return gesperrt(id, async () => {
    const alt = await ladeKarte(daten, id)
    if (!alt) throw new Error(t('planung.fehler.karte'))
    const neu = wendeAn(alt, pruefeAenderung(aenderung), geraet)
    if (neu !== alt) await writeJsonAtomic(join(kartenOrdner(daten), `${id}.json`), neu)
    return neu
  })
}

/** Verschiebt eine Karte an Position `index` einer Spalte (auch in ein anderes Konto). */
export async function verschiebeKarte(daten: string, id: string, ziel: { spalte: Spalte; index: number; kontoId?: string }, geraet = hostname()): Promise<Karte> {
  const alle = await ladeKarten(daten, geraet)
  const karte = alle.find((k) => k.id === id)
  if (!karte) throw new Error(t('planung.fehler.karte'))
  const kontoId = ziel.kontoId ?? karte.kontoId
  const spalte = alle.filter((k) => k.id !== id && k.kontoId === kontoId && k.spalte === ziel.spalte).sort((a, b) => a.ordnung - b.ordnung)
  let ordnung = ordnungFuer(spalte, ziel.index)
  if (ordnung === null) {
    // Kein Platz mehr zwischen zwei Nachbarn: Spalte in ganzen Zahlen neu durchzählen (selten)
    for (const [i, k] of spalte.entries()) if (k.ordnung !== i + 1) await aendereKarte(daten, k.id, { ordnung: i + 1 }, geraet)
    ordnung = ordnungFuer(spalte.map((k, i) => ({ ...k, ordnung: i + 1 })), ziel.index)!
  }
  return aendereKarte(daten, id, { kontoId, spalte: ziel.spalte, ordnung }, geraet)
}

export async function loescheKarte(daten: string, id: string): Promise<void> {
  if (!/^[a-z0-9]+$/.test(id)) throw new Error(t('planung.fehler.karte'))
  await gesperrt(id, () => rm(join(kartenOrdner(daten), `${id}.json`), { force: true }))
}

/** Beobachtet den Kartenordner (auch Änderungen, die der Sync-Dienst vom anderen Gerät einspielt). */
export function beobachteKarten(daten: string, melde: () => void, warte = 400): () => void {
  let zeit: NodeJS.Timeout | null = null
  let beobachter: ReturnType<typeof watch> | null = null
  try {
    beobachter = watch(kartenOrdner(daten), (_art, name) => {
      if (name && !String(name).endsWith('.json')) return
      if (zeit) clearTimeout(zeit)
      zeit = setTimeout(melde, warte)
    })
    beobachter.on('error', () => undefined)
  } catch {
    // Ordner fehlt noch – die Oberfläche lädt dann eben beim nächsten Öffnen
  }
  return () => {
    if (zeit) clearTimeout(zeit)
    beobachter?.close()
  }
}
