// Herkunft: MoinStudio src/main/planung/verbindung.ts (MIT), verallgemeinert auf Texte jeder Plattform.
import { relative } from 'node:path'
import type { JobInfo } from '@shared/jobs'
import type { JobQueue } from '../jobs/queue'
import type { ExportErgebnis } from '../schnitt/export'
import { kapitelText } from '../schnitt/export'
import { aendereKarte, ladeKarten, type Karte, type KartenAenderung, type Spalte } from './karten'

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
      if (!karte) return
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
