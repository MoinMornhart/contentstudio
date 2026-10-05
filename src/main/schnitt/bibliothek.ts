// Herkunft: MoinStudio src/main/schnitt/bibliothek.ts (MIT, v0.50.0), Konten und Richtungen aus dem Creator-Profil
// statt fester Kanäle, dazu das automatische Einsetzen nach dem Rohschnitt.
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { liesMitKonfliktkopien, writeJsonAtomic } from '../data/jsonfile'
import { t } from '../i18n'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { waehlePlaetze, type Bereich, type PlatzEffekt } from './platzierung'

/**
 * Effekt-Bibliothek: eigene Effekte anlegen und benennen – „Abo-Animation“, „Boom“, „Meme-Einblendung“ … aus Video mit
 * Transparenz, Greenscreen-Video, Bild und/oder Sound. Ablage im Datenordner (<Daten>/effekte/<id>/effekt.json plus
 * Dateien), damit alle Geräte dieselbe Bibliothek haben. In Projekten stehen nur Verweise „bib:<id>/<datei>“; der Pfad
 * wird erst beim Rendern auf dem jeweiligen Gerät aufgelöst.
 */

export const LAGEN = ['oben-links', 'oben', 'oben-rechts', 'links', 'mitte', 'rechts', 'unten-links', 'unten', 'unten-rechts', 'voll'] as const
export type Lage = (typeof LAGEN)[number]

export interface Chroma {
  /** Key-Farbe als #rrggbb (automatisch erkannt oder per Pipette) */
  farbe: string
  /** 0–1: wie weit Farben um die Key-Farbe mit entfernt werden */
  toleranz: number
  /** 0–1: weiche Kante */
  weichheit: number
  /** 0–1: Grünstich an den Rändern entfernen */
  spill: number
}

export interface BibEffekt {
  id: string
  name: string
  /** Video mit Transparenz (Alpha) oder mit grünem/blauem Hintergrund (dann `chroma`) */
  video?: { datei: string; greenscreen: boolean; ton: boolean; /** Sekunden */ dauer?: number }
  bild?: { datei: string; dauer: number }
  sound?: { datei: string; lautstaerke: number; /** Sekunden */ dauer?: number }
  chroma?: Chroma
  haeufigkeit: { modus: 'immer' | 'manchmal' | 'manuell'; /** jedes n-te Video */ jedes?: number; /** oder Prozent der Videos */ prozent?: number }
  /** Konto-IDs aus dem Creator-Profil; leer = alle Konten */
  konten: string[]
  /** Richtungen (z. B. „Reactions“, „Gaming“); leer = alle */
  richtungen: string[]
  platzierung: { modus: 'fest' | 'ki'; /** fester Zeitpunkt: Sekunden ab Start oder vor dem Ende des fertigen Videos */ bezug?: 'start' | 'ende'; sekunden?: number }
  lage: Lage
  /** Anteil der Bildbreite (0,1–1; 1 = ganzes Bild) */
  groesse: number
  erstellt: string
  /** wie oft der Effekt automatisch eingesetzt wurde (für „jedes n-te Video“) */
  zaehler?: number
}

export const STANDARD_CHROMA: Chroma = { farbe: '#00ff00', toleranz: 0.3, weichheit: 0.1, spill: 0.5 }

export const bibOrdner = (daten: string): string => join(daten, 'effekte')
const effektOrdner = (daten: string, id: string): string => join(bibOrdner(daten), id)

const klemme = (x: unknown, a: number, b: number, std: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : std)
const gueltigeId = (id: string): boolean => /^[a-z0-9-]+$/i.test(id)

/** Eingaben aus der Oberfläche prüfen und mit Standardwerten auffüllen */
export function pruefeBibEffekt(roh: Partial<BibEffekt>, alt?: BibEffekt): BibEffekt {
  const b = { ...alt, ...roh } as Partial<BibEffekt>
  const name = String(b.name ?? '').trim().slice(0, 60)
  if (!name) throw new Error(t('bib.fehler.name'))
  const modus = b.haeufigkeit?.modus && ['immer', 'manchmal', 'manuell'].includes(b.haeufigkeit.modus) ? b.haeufigkeit.modus : 'manuell'
  const liste = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string').map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 20) : [])
  const platz = b.platzierung?.modus === 'fest' ? 'fest' : 'ki'
  const datei = (d: unknown): string => {
    const s = String(d ?? '')
    if (!/^[\w.-]+$/.test(s)) throw new Error(t('bib.fehler.keineDatei'))
    return s
  }
  return {
    id: alt?.id ?? (b.id && gueltigeId(b.id) ? b.id : randomUUID().slice(0, 8)),
    name,
    ...(b.video ? { video: { datei: datei(b.video.datei), greenscreen: !!b.video.greenscreen, ton: !!b.video.ton, ...(b.video.dauer ? { dauer: klemme(b.video.dauer, 0.1, 600, 3) } : {}) } } : {}),
    ...(b.bild ? { bild: { datei: datei(b.bild.datei), dauer: klemme(b.bild.dauer, 0.3, 30, 2) } } : {}),
    ...(b.sound ? { sound: { datei: datei(b.sound.datei), lautstaerke: klemme(b.sound.lautstaerke, 0, 2, 1), ...(b.sound.dauer ? { dauer: klemme(b.sound.dauer, 0.1, 600, 1) } : {}) } } : {}),
    ...(b.video?.greenscreen
      ? { chroma: { farbe: /^#[0-9a-f]{6}$/i.test(b.chroma?.farbe ?? '') ? b.chroma!.farbe : STANDARD_CHROMA.farbe, toleranz: klemme(b.chroma?.toleranz, 0, 1, STANDARD_CHROMA.toleranz), weichheit: klemme(b.chroma?.weichheit, 0, 1, STANDARD_CHROMA.weichheit), spill: klemme(b.chroma?.spill, 0, 1, STANDARD_CHROMA.spill) } }
      : {}),
    haeufigkeit: { modus, ...(modus === 'manchmal' ? (b.haeufigkeit?.prozent ? { prozent: klemme(b.haeufigkeit.prozent, 1, 100, 50) } : { jedes: Math.round(klemme(b.haeufigkeit?.jedes, 2, 50, 3)) }) : {}) },
    konten: liste(b.konten),
    richtungen: liste(b.richtungen),
    platzierung: platz === 'fest' ? { modus: 'fest', bezug: b.platzierung?.bezug === 'ende' ? 'ende' : 'start', sekunden: klemme(b.platzierung?.sekunden, 0, 36000, 30) } : { modus: 'ki' },
    lage: (LAGEN as readonly string[]).includes(b.lage ?? '') ? b.lage! : 'unten-rechts',
    groesse: klemme(b.groesse, 0.1, 1, 0.35),
    erstellt: alt?.erstellt ?? b.erstellt ?? new Date().toISOString(),
    ...(alt?.zaehler !== undefined ? { zaehler: alt.zaehler } : {})
  }
}

export async function ladeBibliothek(daten: string): Promise<BibEffekt[]> {
  const ids = await readdir(bibOrdner(daten)).catch(() => [] as string[])
  const liste: BibEffekt[] = []
  for (const id of ids) {
    try {
      liste.push(JSON.parse(await liesMitKonfliktkopien(join(effektOrdner(daten, id), 'effekt.json'))) as BibEffekt)
    } catch {
      // halb angelegter oder fremder Ordner
    }
  }
  return liste.sort((a, b) => a.name.localeCompare(b.name))
}

export async function ladeBibEffekt(daten: string, id: string): Promise<BibEffekt | null> {
  if (!gueltigeId(id)) return null
  return JSON.parse(await liesMitKonfliktkopien(join(effektOrdner(daten, id), 'effekt.json')).catch(() => 'null')) as BibEffekt | null
}

export async function speichereBibEffekt(daten: string, roh: Partial<BibEffekt>): Promise<BibEffekt> {
  const alt = roh.id ? await ladeBibEffekt(daten, roh.id) : null
  const e = pruefeBibEffekt(roh, alt ?? undefined)
  if (!e.video && !e.bild && !e.sound) throw new Error(t('bib.fehler.ohneDatei'))
  await mkdir(effektOrdner(daten, e.id), { recursive: true })
  await writeJsonAtomic(join(effektOrdner(daten, e.id), 'effekt.json'), e)
  return e
}

export async function loescheBibEffekt(daten: string, id: string): Promise<void> {
  if (!gueltigeId(id)) throw new Error(t('bib.fehler.id'))
  await rm(effektOrdner(daten, id), { recursive: true, force: true })
}

/** Datei in den Effekt-Ordner kopieren; gibt den Dateinamen im Ordner zurück (für `video.datei` usw.). */
export async function dateiInBibliothek(daten: string, id: string, rolle: 'video' | 'bild' | 'sound', quelle: string): Promise<string> {
  if (!gueltigeId(id)) throw new Error(t('bib.fehler.id'))
  const name = `${rolle}${extname(quelle).toLowerCase() || '.bin'}`
  await mkdir(effektOrdner(daten, id), { recursive: true })
  for (const f of await readdir(effektOrdner(daten, id)).catch(() => [] as string[])) if (f.startsWith(`${rolle}.`) && f !== name) await rm(join(effektOrdner(daten, id), f), { force: true })
  await copyFile(quelle, join(effektOrdner(daten, id), name))
  return name
}

/** Verweis in Projekten → Pfad auf diesem Gerät */
export const bibVerweis = (id: string, datei: string): string => `bib:${id}/${datei}`
export function bibPfad(daten: string, verweis: string): string | null {
  const m = /^bib:([a-z0-9-]+)\/([\w.-]+)$/i.exec(verweis)
  if (!m) return null
  const p = join(effektOrdner(daten, m[1]!), m[2]!)
  return existsSync(p) ? p : null
}

/** Passt der Effekt zu Konto und Richtung des Projekts? Leere Listen gelten für alle. */
export function passtZu(e: BibEffekt, kontoId: string, richtung: string): boolean {
  const r = richtung.toLowerCase()
  return (!e.konten.length || e.konten.includes(kontoId)) && (!e.richtungen.length || e.richtungen.some((x) => r.includes(x.toLowerCase()) || x.toLowerCase().includes(r)))
}

/** Ist das Projekt mit dieser laufenden Nummer dran? (immer / jedes n-te / Prozent – gleichmäßig verteilt) */
export function istDran(e: BibEffekt, nummer: number): boolean {
  if (e.haeufigkeit.modus === 'immer') return true
  if (e.haeufigkeit.modus !== 'manchmal') return false
  if (e.haeufigkeit.prozent) {
    const p = e.haeufigkeit.prozent / 100
    return Math.floor((nummer + 1) * p) > Math.floor(nummer * p)
  }
  return nummer % Math.max(2, e.haeufigkeit.jedes ?? 3) === 0
}

/** Ein Effekt der Bibliothek als Bausteine der Effektliste (Zeiten in Schnittzeit, `bei` = Start) */
export function alsBausteine(e: BibEffekt, bei: number, auto: boolean): Record<string, unknown>[] {
  const bib = { id: e.id, name: e.name, ...(auto ? { auto: true } : {}) }
  const teile: Record<string, unknown>[] = []
  if (e.video) teile.push({ art: 'video', bei, datei: bibVerweis(e.id, e.video.datei), lage: e.lage, groesse: e.groesse, ton: e.video.ton, ...(e.chroma ? { chroma: e.chroma } : {}), bib })
  if (e.bild) teile.push({ art: 'bild', von: bei, bis: bei + e.bild.dauer, datei: bibVerweis(e.id, e.bild.datei), lage: e.lage, groesse: e.groesse, bib })
  if (e.sound) teile.push({ art: 'geraeusch', bei, klang: bibVerweis(e.id, e.sound.datei), lautstaerke: e.sound.lautstaerke, bib })
  return teile
}

/** Wie lange ein Bibliotheks-Effekt sichtbar oder hörbar ist (Sekunden) */
export function bibDauer(e: BibEffekt): number {
  return Math.max(e.video?.dauer ?? 0, e.bild?.dauer ?? 0, e.sound?.dauer ?? 0) || 3
}

/** Ein Bibliotheks-Effekt für die Platzwahl */
export function alsPlatzEffekt(e: BibEffekt): PlatzEffekt {
  const art = e.video ? (e.video.greenscreen ? 'Greenscreen-Video' : 'Video') : e.bild ? 'Bild' : 'Sound'
  return { id: e.id, name: e.name, dauer: bibDauer(e), art, ...(e.platzierung.modus === 'fest' ? { fest: { bezug: e.platzierung.bezug ?? 'start', sekunden: e.platzierung.sekunden ?? 30 } } : {}) }
}

/** Originalzeit → Schnittzeit; null, wenn die Stelle herausgeschnitten ist */
export function imSchnitt(behalten: readonly { start: number; ende: number }[], t: number): number | null {
  let summe = 0
  for (const b of behalten) {
    if (t >= b.start && t <= b.ende) return summe + (t - b.start)
    summe += b.ende - b.start
  }
  return null
}

/** Belegte Bereiche (Schnittzeit) aus Effekten mit Bild oder Ton */
function belegt(effekte: Record<string, unknown>[], behalten: readonly { start: number; ende: number }[]): Bereich[] {
  const aus: Bereich[] = []
  for (const e of effekte) {
    if (e['art'] !== 'video' && e['art'] !== 'geraeusch' && e['art'] !== 'bild') continue
    const start = typeof e['von'] === 'number' ? e['von'] : e['bei']
    if (typeof start !== 'number') continue
    const von = imSchnitt(behalten, start)
    if (von === null) continue
    const bis = typeof e['bis'] === 'number' ? (imSchnitt(behalten, e['bis']) ?? von + 1) : von + (e['art'] === 'video' ? 3 : 1)
    aus.push({ von, bis })
  }
  return aus
}

/** Schnittzeit → Originalzeit (Effekte werden in Originalzeit gespeichert) */
export function imOriginal(behalten: readonly { start: number; ende: number }[], t: number): number {
  let summe = 0
  for (const b of behalten) {
    const d = b.ende - b.start
    if (t <= summe + d) return b.start + (t - summe)
    summe += d
  }
  return behalten.at(-1)?.ende ?? t
}

/**
 * Nach dem Rohschnitt (oder per „neu verteilen“): Effekte der Bibliothek mit „in jedem Video“ oder „nur in manchen“
 * einsetzen, passend zu Konto und Richtung. Ob ein Projekt „dran“ ist, wird einmal entschieden und im Projekt gemerkt
 * (`entscheid`), damit ein neuer Rohschnitt den Zähler nicht weiterdreht. Schon automatisch gesetzte
 * Bibliotheks-Effekte werden ersetzt, von Hand oder per Wunsch gesetzte bleiben. Die Plätze wählt die KI innerhalb fester
 * Grenzen (aus MoinStudio v0.51.0), sonst eine Regel. `laut` und `saetze` in Originalzeit.
 */
export async function bibAutomatisch(
  daten: string,
  o: {
    kontoId: string
    richtung: string
    behalten: { start: number; ende: number }[]
    laut: number[]
    effekte: Record<string, unknown>[]
    entscheid: Record<string, boolean>
    saetze?: { ende: number; text: string }[]
    beschreibung?: string
    ki?: { schicht: KiSchicht; ctx: JobContext<unknown> } | null
  }
): Promise<{ effekte: Record<string, unknown>[]; entscheid: Record<string, boolean>; gesetzt: string[] }> {
  const laenge = o.behalten.reduce((s, b) => s + b.ende - b.start, 0)
  const lautSchnitt = o.laut.map((t) => imSchnitt(o.behalten, t)).filter((t): t is number => t !== null)
  const bleiben = o.effekte.filter((e) => !(e['bib'] as { auto?: boolean } | undefined)?.auto)
  const entscheid = { ...o.entscheid }
  const gewaehlt: BibEffekt[] = []
  for (const e of await ladeBibliothek(daten)) {
    if (e.haeufigkeit.modus === 'manuell' || !passtZu(e, o.kontoId, o.richtung)) continue
    if (entscheid[e.id] === undefined) {
      entscheid[e.id] = istDran(e, e.zaehler ?? 0)
      await writeJsonAtomic(join(effektOrdner(daten, e.id), 'effekt.json'), { ...e, zaehler: (e.zaehler ?? 0) + 1 })
    }
    if (entscheid[e.id]) gewaehlt.push(e)
  }
  if (!gewaehlt.length) return { effekte: bleiben, entscheid, gesetzt: [] }
  const saetze = (o.saetze ?? []).flatMap((x) => {
    const bei = imSchnitt(o.behalten, x.ende)
    return bei === null ? [] : [{ bei: bei + 0.15, text: x.text }]
  })
  const plaetze = await waehlePlaetze(gewaehlt.map(alsPlatzEffekt), { laenge, belegt: belegt(bleiben, o.behalten), laut: lautSchnitt, saetze, beschreibung: o.beschreibung ?? `Ein Video der Richtung „${o.richtung}“.`, ki: o.ki ?? null })
  const neu = [...bleiben]
  const gesetzt: string[] = []
  for (const p of plaetze) {
    const e = gewaehlt.find((x) => x.id === p.id)
    if (!e) continue
    for (const b of alsBausteine(e, imOriginal(o.behalten, p.bei), true)) {
      // Bilder: Ende über ein Stückende hinaus – die Umrechnung in Schnittzeit kürzt passend
      if (b['art'] === 'bild') b['bis'] = imOriginal(o.behalten, p.bei + (e.bild?.dauer ?? 2))
      neu.push(b)
    }
    gesetzt.push(e.name)
  }
  return { effekte: neu, entscheid, gesetzt }
}
