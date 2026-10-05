// Herkunft: MoinStudio src/main/schnitt/vorschau.ts (MIT), erweitert um Stil je Richtung, Hochformat und Spuren.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SchnittEinstellungen } from '@shared/schnitt'
import type { JobContext } from '../jobs/queue'
import { t } from '../i18n'
import { ffmpegMitFortschritt } from './import'
import { aendereProjekt, ladeProjekt, projektOrdner, type Projekt } from './projekt'
import { filterGraph, renderArgs, untertitelAss, zeitAbbildung, zoomsAus, type RenderOptionen } from './render'
import type { Schnittliste } from './rohschnitt'
import { liesAbschnitte } from './transkript'
import { bereiteEffekteVor, type EffektHilfe } from './effekt-vorbereitung'
import { stilFuer } from './stil'
import { liesMitKonfliktkopien } from '../data/jsonfile'
import type { ThumbUmgebung } from '../thumbnail/umgebung'
import { sichereVerfolgung } from './highlights'

/**
 * Geschnittene Vorschau (ROADMAP 5.4): der Schnitt mit Untertiteln, Zooms und Effekten aus dem 540p-Proxy – schnell genug,
 * um das Ergebnis vor dem Export anzusehen. Der Export (5.7) nutzt dieselben Bausteine mit dem Original.
 */

export const STANDARD: SchnittEinstellungen = { untertitel: 'aus', zooms: true, format: '16:9' }

export const einstellungen = (p: Projekt): SchnittEinstellungen => ({ ...STANDARD, ...(p.einstellungen ?? {}) })

export interface ZielRender {
  quelle: string
  breite: number
  hoehe: number
  fps: number
  encoder: string[]
  ausgabe: string
  untertitelDatei: string
  /** Proxy statt Original: Spuren und Verfolgung gelten trotzdem (gleiche Zeitachse) */
  proxy?: boolean
}

/** Untertitel, Zooms, Format, Spuren und Render-Optionen für ein Projekt – gemeinsam für Vorschau und Export. */
export async function renderPlan(daten: string, p: Projekt, ziel: ZielRender, hilfe?: EffektHilfe): Promise<RenderOptionen> {
  const ordner = projektOrdner(daten, p.id)
  const liste = JSON.parse(await liesMitKonfliktkopien(join(ordner, 'schnitt.json'))) as Schnittliste
  const abschnitte = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8').catch(() => ''))
  const wellen = p.wellenform ? (JSON.parse(await readFile(join(ordner, 'wellenform.json'), 'utf8')) as { aufloesung: number; werte: number[] }) : null
  const e = einstellungen(p)
  const hoch = e.format === '9:16'
  const stil = stilFuer([p.richtung], e.format)
  const eff = hilfe ? await bereiteEffekteVor(daten, ordner, liste, hilfe, { breite: ziel.breite, hoehe: ziel.hoehe, fps: ziel.fps }) : null
  let untertitel: string | null = null
  if (e.untertitel !== 'aus' && abschnitte.length) {
    await writeFile(
      join(ordner, ziel.untertitelDatei),
      untertitelAss(abschnitte, liste, { breite: ziel.breite, hoehe: ziel.hoehe, karaoke: e.untertitel === 'karaoke', woerter: e.untertitel === 'karaoke' ? Math.min(4, stil.untertitelWoerter) : stil.untertitelWoerter, unten: hoch ? 0.22 : 0.07, schrift: hilfe?.schriftName ?? null }, eff?.endzeit)
    )
    untertitel = ziel.untertitelDatei
  }
  // Spuren (ROADMAP 5.6): nur ausgerichtete; im Proxy-Render gelten dieselben Versätze
  const spur = (art: 'facecam' | 'ton'): { datei: string; versatz: number } | undefined => {
    const s = (p.spuren ?? []).find((x) => x.art === art && x.versatz !== null)
    return s ? { datei: s.pfad, versatz: s.versatz! } : undefined
  }
  const facecam = spur('facecam')
  const ton = spur('ton')
  const verfolgung = hoch ? ((JSON.parse(await readFile(join(ordner, 'verfolgung.json'), 'utf8').catch(() => 'null')) as { punkte?: { t: number; x: number }[] } | null)?.punkte ?? []) : []
  return {
    quelle: ziel.quelle,
    liste,
    zooms: e.zooms ? zoomsAus(abschnitte, liste, wellen, stil.zoomAbstand) : [],
    zoomFaktor: stil.zoomFaktor,
    untertitel,
    breite: ziel.breite,
    hoehe: ziel.hoehe,
    fps: ziel.fps,
    audio: !!p.quelle?.audio || !!ton,
    encoder: ziel.encoder,
    ausgabe: ziel.ausgabe,
    ...(hoch ? { hoch: { cam: p.facecam ?? null, verfolgung } } : {}),
    ...(facecam || ton ? { spuren: { ...(facecam ? { facecam } : {}), ...(ton ? { ton } : {}) } } : {}),
    ...(eff ? { effekte: { liste: eff.liste, textBilder: eff.textBilder, klaenge: eff.klaenge, stingVideos: eff.stingVideos }, endzeit: eff.endzeit, laengeEnde: eff.laenge } : {})
  }
}

export interface VorschauPayload {
  daten: string
  projekt: string
  ffmpeg: string
  hilfe?: EffektHilfe
  /** Bild-Umgebung für die Verfolgung im Hochformat */
  umgebung?: ThumbUmgebung
}

/** Hochformat ohne Facecam: Verfolgung einmal rechnen (ROADMAP 5.5) */
export async function verfolgungFallsNoetig(p: Projekt, ordner: string, ffmpeg: string, u: ThumbUmgebung | undefined, ctx: JobContext<unknown>): Promise<void> {
  const facecamSpur = (p.spuren ?? []).some((s) => s.art === 'facecam' && s.versatz !== null)
  if (einstellungen(p).format !== '9:16' || p.facecam || facecamSpur || !u || !p.quelle) return
  await sichereVerfolgung(u, ffmpeg, p.quelle, ordner, ctx).catch(() => [])
}

export async function vorschauJob(p: VorschauPayload, ctx: JobContext<unknown>): Promise<{ projekt: string; laenge: number }> {
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr?.proxy || !pr.rohschnitt) throw new Error(t('schnitt.fehler.erstRohschnitt'))
  const ordner = projektOrdner(p.daten, p.projekt)
  const hoch = einstellungen(pr).format === '9:16'
  await verfolgungFallsNoetig(pr, ordner, p.ffmpeg, p.umgebung, ctx)
  const o = await renderPlan(
    p.daten,
    pr,
    { quelle: 'proxy.mp4', breite: hoch ? 540 : 960, hoehe: hoch ? 960 : 540, fps: Math.min(30, Math.round(pr.quelle?.fps || 30)), encoder: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26'], ausgabe: 'vorschau.mp4', untertitelDatei: 'vorschau.ass', proxy: true },
    p.hilfe
  )
  await writeFile(join(ordner, 'vorschau-filter.txt'), filterGraph(o))
  const laenge = o.laengeEnde ?? zeitAbbildung(o.liste.behalten).laenge
  await ffmpegMitFortschritt(p.ffmpeg, renderArgs(o, 'vorschau-filter.txt'), ctx, laenge, (a) => ctx.progress(a * 99, t('schnitt.schritt.vorschau', { prozent: Math.round(a * 100) })), ordner)
  await aendereProjekt(p.daten, p.projekt, () => ({ vorschau: Date.now() }))
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { projekt: p.projekt, laenge }
}
