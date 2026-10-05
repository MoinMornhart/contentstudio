// Herkunft: MoinStudio src/main/planung/verbindung.ts (MIT), verallgemeinert auf Texte jeder Plattform.
import { relative } from 'node:path'
import type { JobInfo } from '@shared/jobs'
import type { JobQueue } from '../jobs/queue'
import type { ExportErgebnis } from '../schnitt/export'
import { kapitelText } from '../schnitt/export'
import { ladeProjekt, type Projekt } from '../schnitt/projekt'
import { t } from '../i18n'
import { aendereKarte, ladeKarten, neueKarte, type Karte, type KartenAenderung, type Spalte } from './karten'

/**
 * Planung ↔ Thumbnail und Schnitt (ROADMAP 6.2): Karten rücken von selbst weiter, sobald im Schnitt oder beim Thumbnail
 * etwas fertig wird, und übernehmen Titel, Text und Kapitel aus dem Export.
 */

export type Ereignis = 'import' | 'export' | 'thumbnail-gewaehlt'

const REIHE: Spalte[] = ['idee', 'aufnahme', 'schnitt', 'thumbnail', 'upload', 'veroeffentlicht']
const vor = (a: Spalte, b: Spalte): boolean => REIHE.indexOf(a) < REIHE.indexOf(b)

/** Wohin rückt eine Karte nach einem Ereignis? Nie zurück, nie über „Upload“ hinaus (veröffentlichen macht der Creator). */
export function naechsteSpalte(karte: Pick<Karte, 'spalte' | 'thumbnail'>, ereignis: Ereignis, exportiert = false): Spalte {
  const ziel: Spalte =
    ereignis === 'import' ? 'schnitt' : ereignis === 'export' ? (karte.thumbnail?.gewaehlt ? 'upload' : 'thumbnail') : exportiert ? 'upload' : 'thumbnail'
  return vor(karte.spalte, ziel) ? ziel : karte.spalte
}

const FUELLWOERTER = new Set(['der', 'die', 'das', 'und', 'oder', 'ich', 'in', 'im', 'mit', 'mein', 'meine', 'ein', 'eine', 'aber', 'the', 'a', 'an', 'and', 'or', 'of', 'my', 'with', 'el', 'la', 'le', 'les', 'de', 'et', 'y', 'mp4', 'mov', 'mkv', 'final', 'video', 'aufnahme', 'folge', 'episode', 'recording'])

/** Lesbarer Titel aus einem Projekt- oder Dateinamen: ohne Endung, Datum, Uhrzeit, Unterstriche („2026-10-01_brot_backen_final.mp4“ → „Brot backen final“) – aus MoinStudio v0.41.0 */
export function titelAusName(name: string): string {
  const s = name
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/(?<!\d)\d{4}[-_.]\d{2}[-_.]\d{2}(?!\d)/g, ' ')
    .replace(/(?<!\d)\d{1,2}[-_.:]\d{2}([-_.:]\d{2})?(?!\d)/g, ' ')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : name
}

function woerter(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((w) => w.length > 1 && !FUELLWOERTER.has(w))
  )
}

/** Welche Karte gehört zu einem Video im Schnitt? Gleiches Konto, noch nicht verknüpft, noch nicht hochgeladen, und der
 *  Titel passt (Wortüberschneidung ≥ 50 % der kürzeren Seite). Bei mehreren gewinnt die beste. */
export function passendeKarte(karten: Karte[], projekt: Pick<Projekt, 'name' | 'kontoId'>): Karte | null {
  const pw = woerter(titelAusName(projekt.name))
  if (!pw.size) return null
  let beste: { k: Karte; wert: number } | null = null
  for (const k of karten) {
    if (k.schnitt || k.kontoId !== projekt.kontoId || !vor(k.spalte, 'upload')) continue
    const kw = woerter(k.titel)
    if (!kw.size) continue
    const gemeinsam = [...kw].filter((w) => pw.has(w)).length
    const wert = gemeinsam / Math.min(kw.size, pw.size)
    if (wert >= 0.5 && (!beste || wert > beste.wert)) beste = { k, wert }
  }
  return beste?.k ?? null
}

/** Video im Schnitt ohne Karte: passende Karte verknüpfen oder eine neue in der Spalte „Schnitt“ anlegen (aus MoinStudio v0.41.0). */
export async function videoInPlanung(daten: string, projektId: string): Promise<Karte | null> {
  const karten = await ladeKarten(daten)
  const schon = karten.find((k) => k.schnitt === projektId)
  if (schon) return schon
  const projekt = await ladeProjekt(daten, projektId)
  if (!projekt) return null
  const passend = passendeKarte(karten, projekt)
  if (passend) return aendereKarte(daten, passend.id, { schnitt: projektId, spalte: naechsteSpalte(passend, 'import') })
  return neueKarte(daten, { kontoId: projekt.kontoId, titel: titelAusName(projekt.name), spalte: 'schnitt', schnitt: projektId, notizen: t('planung.autoKarte') })
}

/** Texte einer Karte aus dem Export-Ergebnis (Titel, Text, Kapitel für die Plattform des Exports) */
export function texteAusExport(e: ExportErgebnis, karte: Pick<Karte, 'titel'>): NonNullable<Karte['texte']> {
  return { plattform: e.plattform as NonNullable<Karte['texte']>['plattform'], titel: e.titel[0] ?? karte.titel, beschreibung: e.beschreibung, kapitel: kapitelText(e.kapitel) }
}

/** Ergebnis eines Thumbnail-Auftrags: Varianten mit Bildpfad */
interface ThumbErgebnis {
  varianten?: { bild: string | null }[]
}

/** Beobachtet die Aufgabenliste und aktualisiert verknüpfte Karten, wenn Import, Export oder Thumbnail fertig sind. */
export function verbindePlanung(queue: JobQueue, daten: () => Promise<string>, geaendert: () => void): void {
  // Aufgaben, die schon vor dem Start fertig waren, nicht noch einmal auswerten
  const gesehen = new Set(queue.state().jobs.filter((j) => j.state === 'done').map((j) => j.id))
  const bearbeite = async (j: JobInfo): Promise<void> => {
    const d = await daten()
    const karten = await ladeKarten(d)
    if (j.kind === 'schnitt-import' || j.kind === 'schnitt-export') {
      const projekt = queue.payload<{ projekt: string }>(j.id)?.projekt
      const karte = karten.find((k) => k.schnitt && k.schnitt === projekt)
      if (!karte) {
        // noch keine Karte: passende verknüpfen oder neue anlegen
        if (projekt && (await videoInPlanung(d, projekt))) geaendert()
        return
      }
      if (j.kind === 'schnitt-import') {
        await aendereKarte(d, karte.id, { spalte: naechsteSpalte(karte, 'import') })
      } else {
        const e = queue.result<ExportErgebnis>(j.id)
        const aenderung: KartenAenderung = { spalte: naechsteSpalte(karte, 'export') }
        if (e) aenderung.texte = texteAusExport(e, karte)
        await aendereKarte(d, karte.id, aenderung)
      }
    } else if (j.kind === 'thumbnail') {
      const karte = karten.find((k) => k.thumbnail?.auftrag === j.id)
      const bild = queue.result<ThumbErgebnis>(j.id)?.varianten?.find((v) => v.bild)?.bild
      // Das erste Bild dient als Vorschau; weiter rückt die Karte erst, wenn der Creator eine Variante wählt
      if (karte?.thumbnail && !karte.thumbnail.bild && bild) await aendereKarte(d, karte.id, { thumbnail: { ...karte.thumbnail, bild: relative(d, bild).replace(/\\/g, '/') } })
    } else {
      return
    }
    geaendert()
  }
  queue.on('change', (state: { jobs: JobInfo[] }) => {
    for (const j of state.jobs) {
      if (j.state !== 'done' || gesehen.has(j.id)) continue
      gesehen.add(j.id)
      if (['schnitt-import', 'schnitt-export', 'thumbnail'].includes(j.kind)) void bearbeite(j).catch(() => undefined)
    }
  })
}
