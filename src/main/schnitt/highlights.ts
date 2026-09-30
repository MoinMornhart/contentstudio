// Herkunft: MoinStudio src/main/schnitt/highlights.ts (MIT), auf die KI-Schicht und die Bildausschnitt-Verfolgung umgestellt.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { sprachName } from '../thumbnail/job'
import { py, sicherePython, type ThumbUmgebung } from '../thumbnail/umgebung'
import type { JobContext } from '../jobs/queue'
import { encoderArgs } from './export'
import { ffmpegMitFortschritt } from './import'
import { aendereProjekt, ladeProjekt, projektOrdner } from './projekt'
import { filterGraph, renderArgs, untertitelAss, zeitAbbildung, type RenderOptionen } from './render'
import type { Bereich, Schnittliste } from './rohschnitt'
import { liesAbschnitte, type Abschnitt } from './transkript'
import { liesMitKonfliktkopien } from '../data/jsonfile'

/**
 * Highlights und Shorts (ROADMAP 5.7): Höhepunkte aus langen Videos und Streams finden (laute Spitzen + die KI liest
 * das Transkript in 10-Minuten-Blöcken) und als einzelne Clips (16:9) oder Shorts (9:16: Facecam oben, sonst folgt der
 * Ausschnitt der Handlung; Wort-für-Wort-Untertitel) exportieren. Gekürzte Pausen aus dem Rohschnitt gelten auch dort.
 */

export interface Highlight extends Bereich {
  titel: string
  grund: string
  /** 1–10, wie stark der Moment ist */
  wert: number
}

/** Laute Momente: Sekunden, in denen die Lautstärke deutlich über dem Üblichen liegt (Explosion, Schreien, Lachen). */
export function lauteMomente(wellen: { aufloesung: number; werte: number[] } | null): number[] {
  if (!wellen || !wellen.werte.length) return []
  const proSek = Math.max(1, Math.round(1 / wellen.aufloesung))
  const sek: number[] = []
  for (let i = 0; i < wellen.werte.length; i += proSek) sek.push(Math.max(...wellen.werte.slice(i, i + proSek)))
  const sortiert = [...sek].sort((a, b) => a - b)
  const median = sortiert[Math.floor(sortiert.length / 2)] ?? 0
  const schwelle = Math.max(median * 1.8, sortiert[Math.floor(sortiert.length * 0.95)] ?? 0)
  const momente: number[] = []
  sek.forEach((v, i) => {
    if (v >= schwelle && v > 20 && (!momente.length || i - momente[momente.length - 1]! > 15)) momente.push(i)
  })
  return momente
}

/** Überlappende Highlights zusammenfassen (der stärkere behält Titel), Länge 8–75 s, stärkste zuerst. */
export function ordneHighlights(h: Highlight[], dauer: number, max = 10): Highlight[] {
  const sauber = h
    .map((x) => ({ ...x, start: Math.max(0, x.start), ende: Math.min(dauer, Math.max(x.ende, x.start + 8)) }))
    .map((x) => ({ ...x, ende: Math.min(x.ende, x.start + 75) }))
    .sort((a, b) => b.wert - a.wert)
  const aus: Highlight[] = []
  for (const x of sauber) {
    const treffer = aus.find((y) => x.start < y.ende && x.ende > y.start)
    if (treffer) {
      treffer.start = Math.min(treffer.start, x.start)
      treffer.ende = Math.min(Math.max(treffer.ende, x.ende), treffer.start + 75)
    } else if (aus.length < max) aus.push({ ...x })
  }
  return aus
}

const HighlightsZ = z.object({ highlights: z.array(z.object({ start: z.number(), ende: z.number(), titel: z.string(), grund: z.string(), wert: z.number().int().min(1).max(10) })) })

export function highlightPrompt(abschnitte: Abschnitt[], laut: number[], o: { kanal: string; richtung: string; sprache: string }): string {
  return `Du schneidest Highlights aus einem langen Video oder Livestream des Kanals ${o.kanal} (Richtung ${o.richtung || 'allgemein'}). Unten das
Transkript (Sekunde im Video) und laute Momente. Finde die besten Momente für Highlight-Clips und Shorts: lustig,
spannend, überraschend, lehrreich, emotional – nicht Begrüßung, nicht Leerlauf.
Jeder Moment 15–60 s, mit etwas Anlauf vor dem Höhepunkt und kurz danach enden. Pro Moment: start, ende (Sekunden),
titel (kurz, auf ${o.sprache}, wie ein Short-Titel), grund (warum stark), wert (1–10). Lieber wenige starke als viele schwache.
Antworte nur mit JSON nach dem Schema.

Laute Momente: ${laut.length ? laut.map((s) => `${s}s`).join(', ') : 'keine'}

${abschnitte.map((a) => `[${Math.round(a.start)}–${Math.round(a.ende)}] ${a.text}`).join('\n')}`
}

export interface HighlightPayload {
  daten: string
  projekt: string
}

export async function highlightJob(p: HighlightPayload, ctx: JobContext<unknown>, d: { ki: KiSchicht | null }): Promise<{ projekt: string; anzahl: number }> {
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr?.quelle?.dauer || !pr.transkript) throw new Error(t('schnitt.fehler.erstTranskript'))
  const ordner = projektOrdner(p.daten, p.projekt)
  const abschnitte = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8'))
  const wellen = pr.wellenform ? (JSON.parse(await readFile(join(ordner, 'wellenform.json'), 'utf8')) as { aufloesung: number; werte: number[] }) : null
  const laut = lauteMomente(wellen)
  let gefunden: Highlight[] = []
  if (d.ki && (await d.ki.kandidaten()).length) {
    const block = 600
    for (let b = 0; b < pr.quelle.dauer; b += block) {
      await ctx.yield()
      ctx.progress(5 + (b / pr.quelle.dauer) * 90, t('schnitt.schritt.highlights'))
      const teil = abschnitte.filter((a) => a.start >= b - 30 && a.start < b + block)
      if (!teil.length) continue
      const a = await d.ki
        .frage({ name: 'highlights', system: 'You find the strongest moments of a long video for clips and shorts.', prompt: highlightPrompt(teil, laut.filter((s) => s >= b && s < b + block), { kanal: pr.kanal, richtung: pr.richtung, sprache: sprachName(pr.sprache) }), schema: HighlightsZ, stufe: 'schnell', maxAusgabe: 3000 }, ctx)
        .then((e) => e.daten)
        .catch(() => null)
      gefunden.push(...(a?.highlights ?? []))
    }
  }
  // ohne KI (oder wenn sie nichts findet): laute Momente mit etwas Anlauf
  if (!gefunden.length) gefunden = laut.map((s) => ({ start: s - 12, ende: s + 8, titel: t('schnitt.moment', { zeit: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }), grund: t('schnitt.laut'), wert: 5 }))
  const highlights = ordneHighlights(gefunden, pr.quelle.dauer)
  await writeFile(join(ordner, 'highlights.json'), JSON.stringify(highlights, null, 1))
  await aendereProjekt(p.daten, p.projekt, () => ({ highlights: highlights.length }))
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { projekt: p.projekt, anzahl: highlights.length }
}

// ---------- Clips und Shorts exportieren ----------

/** Schnittliste nur für den Clip: Clip-Bereich geschnitten mit den behaltenen Stellen des Rohschnitts. */
export function clipListe(liste: Schnittliste | null, h: Bereich, dauer: number): Schnittliste {
  const behalten = (liste?.behalten ?? [{ start: 0, ende: dauer }])
    .map((b) => ({ start: Math.max(b.start, h.start), ende: Math.min(b.ende, h.ende) }))
    .filter((b) => b.ende - b.start >= 0.2)
  return { version: 1, dauer, behalten, entfernt: [] }
}

export interface ClipsPayload {
  daten: string
  projekt: string
  ffmpeg: string
  encoder: string
  /** Bild-Umgebung (Facecam-Erkennung, Verfolgung) */
  umgebung: ThumbUmgebung
  /** Indizes der Highlights; art: clip (16:9) oder short (9:16) */
  auswahl: { index: number; art: 'clip' | 'short' }[]
}

async function findeFacecam(p: ClipsPayload, pfad: string, dauer: number, ctx: JobContext<unknown>): Promise<[number, number, number, number] | null> {
  const pyU = await sicherePython(p.umgebung, ctx)
  const out = await py(pyU, join(p.umgebung.skripte, 'facecam.py'), [pfad, String(dauer), p.ffmpeg], ctx)
  const m = /CS_FACECAM ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/.exec(out)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null
}

/** Verfolgung für das Hochformat (ROADMAP 5.5), einmal je Projekt gerechnet und gespeichert */
export async function sichereVerfolgung(u: ThumbUmgebung, ffmpeg: string, quelle: { pfad: string; breite: number; hoehe: number }, ordner: string, ctx: JobContext<unknown>): Promise<{ t: number; x: number }[]> {
  const datei = join(ordner, 'verfolgung.json')
  const alt = JSON.parse(await readFile(datei, 'utf8').catch(() => 'null')) as { punkte?: { t: number; x: number }[] } | null
  if (alt?.punkte?.length) return alt.punkte
  ctx.progress(null, t('schnitt.schritt.verfolgung'))
  const pyU = await sicherePython(u, ctx)
  await py(pyU, join(u.skripte, 'bild', 'verfolgung.py'), [quelle.pfad, ffmpeg, String(quelle.breite), String(quelle.hoehe), datei], ctx)
  return ((JSON.parse(await readFile(datei, 'utf8').catch(() => 'null')) as { punkte?: { t: number; x: number }[] } | null)?.punkte ?? [])
}

export async function clipsJob(p: ClipsPayload, ctx: JobContext<unknown>): Promise<{ projekt: string; dateien: string[] }> {
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr?.quelle) throw new Error(t('schnitt.fehler.projekt'))
  const ordner = projektOrdner(p.daten, p.projekt)
  await mkdir(join(ordner, 'clips'), { recursive: true })
  const highlights = JSON.parse(await readFile(join(ordner, 'highlights.json'), 'utf8')) as Highlight[]
  const liste = pr.rohschnitt ? (JSON.parse(await liesMitKonfliktkopien(join(ordner, 'schnitt.json'))) as Schnittliste) : null
  const abschnitte = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8').catch(() => ''))
  let cam = pr.facecam === undefined ? undefined : pr.facecam
  if (p.auswahl.some((a) => a.art === 'short') && cam === undefined) {
    ctx.progress(2, t('schnitt.schritt.facecam'))
    cam = await findeFacecam(p, pr.quelle.pfad, pr.quelle.dauer, ctx).catch(() => null)
    await aendereProjekt(p.daten, p.projekt, () => ({ facecam: cam ?? null }))
  }
  // Ohne Facecam folgt der Short-Ausschnitt der Handlung
  const verfolgung = p.auswahl.some((a) => a.art === 'short') && !cam ? await sichereVerfolgung(p.umgebung, p.ffmpeg, pr.quelle, ordner, ctx).catch(() => []) : []
  const dateien: string[] = []
  for (const [n, a] of p.auswahl.entries()) {
    await ctx.yield()
    const h = highlights[a.index]
    if (!h) continue
    const kurz = clipListe(liste, h, pr.quelle.dauer)
    const hoch = a.art === 'short'
    const breite = hoch ? 1080 : Math.min(1920, pr.quelle.breite || 1920)
    const hoehe = hoch ? 1920 : Math.round((breite * 9) / 16 / 2) * 2
    const fps = Math.min(60, Math.round(pr.quelle.fps) || 30)
    const name = `${String(a.index + 1).padStart(2, '0')}-${a.art}`
    let untertitel: string | null = null
    if (hoch && abschnitte.length) {
      untertitel = `clips/${name}.ass`
      await writeFile(join(ordner, untertitel), untertitelAss(abschnitte, kurz, { breite, hoehe, karaoke: true, woerter: 3, unten: 0.28 }))
    }
    const o: RenderOptionen = { quelle: pr.quelle.pfad, liste: kurz, zooms: [], untertitel, breite, hoehe, fps, audio: pr.quelle.audio, encoder: encoderArgs(p.encoder, hoehe, fps), ausgabe: `clips/${name}.mp4`, ...(hoch ? { hoch: { cam: cam ?? null, verfolgung } } : {}) }
    await writeFile(join(ordner, 'clips', `${name}.filter.txt`), filterGraph(o))
    const { laenge } = zeitAbbildung(kurz.behalten)
    await ffmpegMitFortschritt(p.ffmpeg, renderArgs(o, `clips/${name}.filter.txt`), ctx, laenge, (x) => ctx.progress(5 + ((n + x) / p.auswahl.length) * 94, t(hoch ? 'schnitt.schritt.short' : 'schnitt.schritt.clip', { nr: n + 1, von: p.auswahl.length, titel: h.titel })), ordner)
    dateien.push(join(ordner, o.ausgabe))
  }
  await aendereProjekt(p.daten, p.projekt, () => ({ clips: Date.now() }))
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { projekt: p.projekt, dateien }
}
