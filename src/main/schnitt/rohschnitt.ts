// Herkunft: MoinStudio src/main/schnitt/rohschnitt.ts (MIT), auf die KI-Schicht, mehrere Sprachen und den Stil je Richtung umgestellt.
import { bibAutomatisch } from './bibliothek'
import { lauteMomente } from './highlights'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { stilFuer, stilText, type SchnittStil } from './stil'
import type { JobContext } from '../jobs/queue'
import { aendereProjekt, ladeProjekt, projektOrdner } from './projekt'
import { kiSaetze, liesAbschnitte, type Abschnitt } from './transkript'

/**
 * Automatischer Rohschnitt (ROADMAP 5.2). Ergebnis ist eine Schnittliste (EDL-JSON) in schnitt.json: welche Bereiche
 * des Originals bleiben und was mit welchem Grund rausfliegt. Das Original wird nie verändert.
 *
 * 1. Feste Regeln aus den Wortzeiten: lange Pausen kürzen – aber nur, wo auch das Spiel leise ist (stille Action
 *    bleibt drin), einzelne „ähm“/„äh“ raus, abgebrochener Satz vor seiner Wiederholung raus.
 * 2. Die KI (falls gewählt) liest das Transkript und markiert Versprecher, Leerlauf und Wiederholungen, die Regeln
 *    nicht finden. Ohne KI bleibt es bei den technischen Schritten.
 * Werte (Pausenlänge, Luft vor und nach Sätzen) kommen aus dem Stil der Richtung (ROADMAP 5.3).
 */

export type Grund = 'pause' | 'aehm' | 'wiederholung' | 'versprecher' | 'leerlauf' | 'manuell'
export interface Bereich {
  start: number
  ende: number
}
export interface Entfernt extends Bereich {
  grund: Grund
  text?: string
  /** vom Creator ausgeschaltet: bleibt im Video */
  aus?: boolean
}
export interface Schnittliste {
  version: 1
  dauer: number
  behalten: Bereich[]
  entfernt: Entfernt[]
}

/** Standard-Stil (Richtung „normal“) */
export const EINSTELLUNGEN: SchnittStil = stilFuer([])

/** Füllwörter in den häufigsten Sprachen (Deutsch, Englisch, Spanisch, Französisch, Niederländisch) */
const FUELLWOERTER = /^(ähm+|äh+|öhm+|ehm+|hm+|mhm|u+m+|u+h+|e+r+m+|uhm+|hmm+|eh+|este|euh+|ehh+|uhh+)[.,!?…]*$/i

const normal = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()

/** Bereiche zusammenfassen und sortieren. */
export function vereinige<T extends Bereich>(liste: T[]): T[] {
  const s = [...liste].sort((a, b) => a.start - b.start)
  const aus: T[] = []
  for (const b of s) {
    const letzter = aus[aus.length - 1]
    if (letzter && b.start <= letzter.ende + 0.01) letzter.ende = Math.max(letzter.ende, b.ende)
    else aus.push({ ...b })
  }
  return aus
}

/** Mittlere Lautstärke (0–100) der Wellenform in [a, b]. */
function laut(wellen: { aufloesung: number; werte: number[] } | null, a: number, b: number): number {
  if (!wellen) return 0
  const i = Math.floor(a / wellen.aufloesung)
  const j = Math.max(i + 1, Math.ceil(b / wellen.aufloesung))
  const teil = wellen.werte.slice(i, j)
  return teil.length ? teil.reduce((x, y) => x + y, 0) / teil.length : 0
}

/** Feste Regeln: Pausen, Füllwörter, abgebrochene Sätze vor ihrer Wiederholung. */
export function regelSchnitt(abschnitte: Abschnitt[], dauer: number, wellen: { aufloesung: number; werte: number[] } | null = null, e: SchnittStil = EINSTELLUNGEN): Entfernt[] {
  const woerter = abschnitte.flatMap((a) => a.woerter).sort((a, b) => a.start - b.start)
  const entfernt: Entfernt[] = []
  const pausen: Bereich[] = []
  const pause = (a: number, b: number): void => {
    const start = a + e.nachlauf
    const ende = b - e.vorlauf
    if (ende - start >= e.minEntfernen) pausen.push({ start, ende })
  }
  if (woerter.length) {
    if (woerter[0]!.start > e.maxPause) pause(-e.nachlauf, woerter[0]!.start)
    for (let i = 1; i < woerter.length; i++) if (woerter[i]!.start - woerter[i - 1]!.ende > e.maxPause) pause(woerter[i - 1]!.ende, woerter[i]!.start)
    if (dauer - woerter[woerter.length - 1]!.ende > e.maxPause) pause(woerter[woerter.length - 1]!.ende, dauer + e.vorlauf)
  }
  // Action statt Pause: deutlich lauter als die übrigen Pausen (Kampf, Explosion) und nicht bloß Hintergrundmusik –
  // solche Stellen bleiben drin. Gleichmäßige Spielmusik zählt nicht als Action.
  const sprache = woerter.length ? woerter.reduce((s, w) => s + laut(wellen, w.start, w.ende), 0) / woerter.length : 0
  const pegel = pausen.map((x) => laut(wellen, x.start, x.ende))
  const median = [...pegel].sort((a, b) => a - b)[Math.floor(pegel.length / 2)] ?? 0
  pausen.forEach((x, i) => {
    const action = !!wellen && pegel[i]! > Math.max(1.6 * median, e.leiseAnteil * sprache) && pegel[i]! > 8
    if (!action) entfernt.push({ ...x, grund: 'pause' })
  })
  if (e.fuellwoerter) for (const w of woerter) if (FUELLWOERTER.test(w.wort.trim())) entfernt.push({ start: w.start - 0.03, ende: w.ende + 0.05, grund: 'aehm', text: w.wort })
  // abgebrochener Satz, den der nächste Satz wiederholt („Ich geh jetzt in die. Ich geh jetzt in die Höhle rein.“)
  // Erkannt, wenn das Ende des Satzes (mind. 3 Wörter) genau der Anfang des nächsten Satzes ist
  for (let i = 0; i + 1 < abschnitte.length; i++) {
    const a = normal(abschnitte[i]!.text).split(' ')
    const b = normal(abschnitte[i + 1]!.text).split(' ')
    const wiederholt = a.length >= 3 && b.length > 3 && [...Array(Math.min(a.length, b.length - 1) - 2).keys()].some((j) => {
      const k = Math.min(a.length, b.length - 1) - j
      return a.slice(-k).join(' ') === b.slice(0, k).join(' ')
    })
    if (wiederholt) entfernt.push({ start: abschnitte[i]!.start - 0.05, ende: abschnitte[i + 1]!.start - 0.05, grund: 'wiederholung', text: abschnitte[i]!.text })
  }
  // Neuansatz auf Wortebene, auch mitten in einem Abschnitt („First we put the flour in the, first we put the flour and
  // the salt …“, „Zuerst kommt die Jacke in die. Zuerst kommt die Regenjacke …“): dieselben mindestens 3 Wörter setzen
  // innerhalb von 5 s neu an, dazwischen höchstens 3 weitere Wörter → der erste Anlauf fliegt raus
  const n = woerter.map((w) => normal(w.wort))
  const gleich = (i: number, j: number, k: number): boolean => {
    for (let x = 0; x < k; x++) if (!n[i + x] || n[i + x] !== n[j + x]) return false
    return true
  }
  for (let i = 0; i < woerter.length; i++) {
    const treffer = [3, 4, 5, 6].flatMap((k) => [0, 1, 2, 3].map((extra) => ({ k, j: i + k + extra }))).find(({ k, j }) => j + k <= woerter.length && woerter[j]!.start - woerter[i]!.start < 5 && gleich(i, j, k))
    if (!treffer) continue
    const start = woerter[i]!.start - 0.03
    const ende = woerter[treffer.j]!.start - 0.03
    if (!entfernt.some((x) => x.grund === 'wiederholung' && x.start <= start + 0.1 && x.ende >= ende - 0.1))
      entfernt.push({ start, ende, grund: 'wiederholung', text: woerter.slice(i, treffer.j).map((w) => w.wort).join(' ') })
    i = treffer.j - 1
  }
  return entfernt.map((x) => ({ ...x, start: Math.max(0, x.start), ende: Math.min(dauer, x.ende) })).filter((x) => x.ende - x.start >= 0.05)
}

/** Aus entfernten Bereichen die Schnittliste bauen (behalten = Rest, sehr kurze Reste fallen weg). */
export function schnittliste(dauer: number, entfernt: Entfernt[]): Schnittliste {
  const weg = vereinige(entfernt.map((x) => ({ start: x.start, ende: x.ende })))
  const behalten: Bereich[] = []
  let t = 0
  for (const w of weg) {
    if (w.start - t >= 0.2) behalten.push({ start: t, ende: w.start })
    t = Math.max(t, w.ende)
  }
  if (dauer - t >= 0.2) behalten.push({ start: t, ende: dauer })
  return { version: 1, dauer, behalten, entfernt: [...entfernt].sort((a, b) => a.start - b.start) }
}

export const laenge = (behalten: Bereich[]): number => behalten.reduce((s, b) => s + (b.ende - b.start), 0)

const SchemaZ = z.object({ entfernen: z.array(z.object({ nr: z.number().int().min(0), grund: z.enum(['versprecher', 'wiederholung', 'leerlauf']) })) })

export function rohschnittPrompt(abschnitte: Abschnitt[], o: { kanal: string; plattform: string; sprache: string; stil: string }): string {
  const zeilen = abschnitte.map((a, i) => `${i} [${a.start.toFixed(1)}–${a.ende.toFixed(1)}] ${a.text}`).join('\n')
  return `Du schneidest ein Video für den Kanal ${o.kanal} (${o.plattform}, Sprache ${o.sprache}). ${o.stil}
Unten steht das Transkript, ein Satz pro Zeile mit Nummer und Zeit. Markiere NUR Sätze, die im fertigen Video stören:
- versprecher: abgebrochener oder verhaspelter Satz, der gleich danach richtig gesagt wird
- wiederholung: derselbe Inhalt wird kurz danach noch einmal gesagt (die schwächere Fassung entfernen)
- leerlauf: inhaltsleeres Gemurmel ohne Bezug zum Geschehen (z. B. „mal schauen … hm … ja“)
Nicht entfernen: Reaktionen („Oh nein!“, „Puh“), Witze, Begrüßung, Verabschiedung, Abo-Hinweise, Erklärungen und
Arbeitsschritte – die machen das Video lebendig und verständlich. Im Zweifel drin lassen. Antworte nur mit JSON nach dem Schema.

${zeilen}`
}

export interface RohschnittPayload {
  daten: string
  projekt: string
}

export async function rohschnittJob(p: RohschnittPayload, ctx: JobContext<unknown>, d: { ki: KiSchicht | null }): Promise<{ projekt: string; vorher: number; nachher: number }> {
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr?.quelle?.dauer) throw new Error(t('schnitt.fehler.nichtImportiert'))
  const ordner = projektOrdner(p.daten, p.projekt)
  const stil = stilFuer([pr.richtung], pr.einstellungen?.format ?? '16:9')
  const abschnitte = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8').catch(() => ''))
  const wellen = pr.wellenform ? (JSON.parse(await readFile(join(ordner, 'wellenform.json'), 'utf8')) as { aufloesung: number; werte: number[] }) : null
  ctx.progress(10, t('schnitt.schritt.pausen'))
  const entfernt = regelSchnitt(abschnitte, pr.quelle.dauer, wellen, stil)

  // Die KI liest das Transkript (in Blöcken, damit auch Stunden-Streams passen); ohne KI bleibt es beim Regelschnitt
  if (d.ki && (await d.ki.kandidaten()).length && abschnitte.length) {
    const block = 400
    for (let i = 0; i < abschnitte.length; i += block) {
      await ctx.yield()
      ctx.progress(20 + (i / abschnitte.length) * 70, t('schnitt.schritt.kiLiest'))
      const teil = abschnitte.slice(i, i + block)
      const a = await d.ki
        .frage({ name: 'rohschnitt', system: 'You are a careful video editor. Only mark sentences that clearly hurt the finished video.', prompt: rohschnittPrompt(teil, { kanal: pr.kanal, plattform: pr.plattform, sprache: pr.sprache, stil: stilText(stil, [pr.richtung], pr.einstellungen?.format ?? '16:9') }), schema: SchemaZ, stufe: 'schnell', maxAusgabe: 3000 }, ctx)
        .then((e) => e.daten)
        .catch(() => null)
      if (!a) continue
      for (const x of a.entfernen) {
        const s = teil[x.nr]
        if (!s || entfernt.some((e) => e.grund !== 'pause' && e.grund !== 'aehm' && Math.abs(e.start - (s.start - 0.05)) < 0.2)) continue
        entfernt.push({ start: Math.max(0, s.start - 0.05), ende: Math.min(pr.quelle.dauer, s.ende + 0.1), grund: x.grund, text: s.text })
      }
    }
  }
  const liste = schnittliste(pr.quelle.dauer, entfernt)
  await writeFile(join(ordner, 'schnitt.json'), JSON.stringify(liste, null, 1))
  await aendereProjekt(p.daten, p.projekt, () => ({ rohschnitt: true }))
  // Eigene Effekte aus der Bibliothek, die in jedes (oder jedes n-te) Video gehören
  ctx.progress(92, t('schnitt.schritt.bibVerteilen'))
  await bibVerteilen(p.daten, p.projekt, liste, abschnitte, wellen, d.ki, ctx).catch(() => null)
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { projekt: p.projekt, vorher: pr.quelle.dauer, nachher: Math.round(laenge(liste.behalten) * 10) / 10 }
}

/** Bibliotheks-Effekte ins Projekt setzen (nach dem Rohschnitt und per „neu verteilen“); gibt die gesetzten Namen zurück */
async function bibVerteilen(daten: string, id: string, liste: Schnittliste, abschnitte: Abschnitt[], wellen: { aufloesung: number; werte: number[] } | null, ki: KiSchicht | null, ctx: JobContext<unknown>): Promise<string[]> {
  const pr = await ladeProjekt(daten, id)
  if (!pr) return []
  const ordner = projektOrdner(daten, id)
  const effekteRoh = JSON.parse(await readFile(join(ordner, 'effekte.json'), 'utf8').catch(() => '[]')) as Record<string, unknown>[]
  const vorher = Array.isArray(effekteRoh) ? effekteRoh : []
  const bib = await bibAutomatisch(daten, {
    kontoId: pr.kontoId,
    richtung: pr.richtung,
    behalten: liste.behalten,
    laut: lauteMomente(wellen),
    effekte: vorher,
    entscheid: pr.bibEntscheid ?? {},
    saetze: kiSaetze(abschnitte),
    beschreibung: `Ein Video für das Konto „${pr.kanal}“ (${pr.plattform}), Richtung „${pr.richtung}“.`,
    ki: ki ? { schicht: ki, ctx } : null
  })
  if (bib.gesetzt.length || vorher.length !== bib.effekte.length) await writeFile(join(ordner, 'effekte.json'), JSON.stringify(bib.effekte, null, 1))
  await aendereProjekt(daten, id, () => ({ bibEntscheid: bib.entscheid }))
  return bib.gesetzt
}

export interface VerteilPayload {
  daten: string
  projekt: string
}

/** „Bibliotheks-Effekte neu verteilen“ (aus MoinStudio v0.51.0): automatisch gesetzte werden ersetzt, eigene bleiben */
export async function verteilJob(p: VerteilPayload, ctx: JobContext<unknown>, d: { ki: KiSchicht | null }): Promise<{ projekt: string; gesetzt: string[] }> {
  const ordner = projektOrdner(p.daten, p.projekt)
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr?.rohschnitt) throw new Error(t('schnitt.fehler.erstRohschnitt'))
  const liste = JSON.parse(await readFile(join(ordner, 'schnitt.json'), 'utf8')) as Schnittliste
  const abschnitte = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8').catch(() => ''))
  const wellen = pr.wellenform ? (JSON.parse(await readFile(join(ordner, 'wellenform.json'), 'utf8').catch(() => 'null')) as { aufloesung: number; werte: number[] } | null) : null
  ctx.progress(20, t('schnitt.schritt.bibVerteilen'))
  const gesetzt = await bibVerteilen(p.daten, p.projekt, liste, abschnitte, wellen, d.ki, ctx)
  ctx.progress(100, gesetzt.length ? t('schnitt.schritt.bibGesetzt', { namen: gesetzt.join(', ') }) : t('schnitt.schritt.bibKeine'))
  return { projekt: p.projekt, gesetzt }
}
