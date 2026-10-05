// Herkunft: MoinStudio src/main/schnitt/export.ts (MIT), verallgemeinert auf alle Plattformen des Creator-Profils.
import { spawn } from 'node:child_process'
import { open, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { PLATTFORM_VORGABEN, type PlattformVorgabe } from '@shared/schnitt'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { sprachName } from '../thumbnail/job'
import { ffmpegMitFortschritt } from './import'
import { aendereProjekt, ladeProjekt, projektOrdner } from './projekt'
import { auswahlAusdruck, filterGraph, renderArgs, zeitAbbildung } from './render'
import { liesAbschnitte } from './transkript'
import { einstellungen, renderPlan, verfolgungFallsNoetig } from './vorschau'
import type { ThumbUmgebung } from '../thumbnail/umgebung'
import type { EffektHilfe } from './effekt-vorbereitung'
import { stilFuer, stilText } from './stil'

/**
 * Export je Plattform (ROADMAP 5.7): volle Qualität aus dem Original, technisch nach YouTubes Upload-Empfehlung, die
 * auch die anderen Plattformen gut verarbeiten (H.264 High, 2 B-Frames, Closed GOP, 4:2:0, BT.709, AAC 48 kHz, Fast
 * Start, Bitrate nach Auflösung). Format (16:9, 9:16, nur Ton), Längen- und Textgrenzen aus den Plattform-Vorgaben.
 * Encoder aus dem Hardware-Profil (NVENC/AMF/QSV), sonst libx264. Titel, Text und Kapitel von der KI, falls gewählt.
 */

/** Zielgröße: Auflösung der Aufnahme (gerade Zahlen, höchstens 4K), Bildrate wie aufgenommen (höchstens 60). */
export function zielFormat(breite: number, hoehe: number, fps: number): { breite: number; hoehe: number; fps: number } {
  const f = Math.min(1, 3840 / Math.max(breite, 1), 2160 / Math.max(hoehe, 1))
  const gerade = (x: number): number => Math.max(2, Math.round((x * f) / 2) * 2)
  return { breite: gerade(breite || 1920), hoehe: gerade(hoehe || 1080), fps: Math.min(60, Math.round(fps) || 30) }
}

/** YouTube-Bitrate (SDR) in Mbit/s nach Auflösung und Bildrate. */
export function youtubeBitrate(hoehe: number, fps: number): number {
  const hfr = fps > 30
  if (hoehe >= 2160) return hfr ? 60 : 40
  if (hoehe >= 1440) return hfr ? 24 : 16
  if (hoehe >= 1080) return hfr ? 12 : 8
  if (hoehe >= 720) return hfr ? 7.5 : 5
  return hfr ? 4 : 2.5
}

/** Encoder-Argumente nach YouTube-Vorgabe; Hardware-Encoder mit gleichen Eckwerten. */
export function encoderArgs(encoder: string, hoehe: number, fps: number): string[] {
  const mbit = youtubeBitrate(hoehe, fps)
  const rate = ['-b:v', `${mbit}M`, '-maxrate', `${Math.round(mbit * 1.5)}M`, '-bufsize', `${mbit * 2}M`]
  const gop = ['-g', String(Math.max(1, Math.round(fps / 2))), '-bf', '2']
  const farbe = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-pix_fmt', 'yuv420p']
  const je: Record<string, string[]> = {
    h264_nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p5', '-profile:v', 'high', '-rc', 'vbr'],
    h264_amf: ['-c:v', 'h264_amf', '-quality', 'quality', '-profile:v', 'high', '-rc', 'vbr_peak'],
    h264_qsv: ['-c:v', 'h264_qsv', '-preset', 'slow', '-profile:v', 'high'],
    libx264: ['-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-flags', '+cgop']
  }
  return [...(je[encoder] ?? je['libx264']!), ...rate, ...gop, ...farbe]
}

export interface Kapitel {
  zeit: number
  titel: string
}

/** YouTube-Kapitel: beginnt bei 0:00, aufsteigend, mindestens 3, jedes mindestens 10 s. */
export function pruefeKapitel(k: Kapitel[], laenge: number): string[] {
  const fehler: string[] = []
  if (k.length < 3) fehler.push('weniger als 3 Kapitel')
  if (k[0]?.zeit !== 0) fehler.push('erstes Kapitel beginnt nicht bei 0:00')
  for (let i = 0; i < k.length; i++) {
    const bis = k[i + 1]?.zeit ?? laenge
    if (i > 0 && k[i]!.zeit <= k[i - 1]!.zeit) fehler.push(`Kapitel ${i + 1} nicht aufsteigend`)
    if (bis - k[i]!.zeit < 10) fehler.push(`Kapitel „${k[i]!.titel}“ kürzer als 10 s`)
  }
  return fehler
}

/** Kapitel reparieren: bei 0 beginnen, zu kurze zusammenlegen. */
export function repariereKapitel(k: Kapitel[], laenge: number): Kapitel[] {
  const s = [...k].filter((x) => x.zeit >= 0 && x.zeit < laenge).sort((a, b) => a.zeit - b.zeit)
  if (!s.length) return []
  s[0] = { ...s[0]!, zeit: 0 }
  const aus: Kapitel[] = []
  for (const x of s) if (!aus.length || x.zeit - aus[aus.length - 1]!.zeit >= 10) aus.push(x)
  while (aus.length > 1 && laenge - aus[aus.length - 1]!.zeit < 10) aus.pop()
  return aus.length >= 3 ? aus : []
}

export const kapitelText = (k: Kapitel[]): string =>
  k
    .map((x) => {
      const h = Math.floor(x.zeit / 3600)
      const m = Math.floor((x.zeit % 3600) / 60)
      const s = Math.floor(x.zeit % 60)
      return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')} ${x.titel}`
    })
    .join('\n')

export interface Pruefung {
  punkt: string
  ok: boolean
  wert: string
}

/** ffprobe-JSON + Fast-Start-Befund → Prüfliste nach YouTube-Empfehlung. */
export function technikPruefung(probe: { streams?: Record<string, unknown>[]; format?: Record<string, unknown> }, faststart: boolean, nurTon = false): Pruefung[] {
  const v = probe.streams?.find((s) => s['codec_type'] === 'video') ?? {}
  const a = probe.streams?.find((s) => s['codec_type'] === 'audio')
  const p: Pruefung[] = nurTon
    ? []
    : [
        { punkt: t('schnitt.pruef.h264'), ok: v['codec_name'] === 'h264', wert: String(v['codec_name'] ?? '–') },
        { punkt: t('schnitt.pruef.profil'), ok: String(v['profile'] ?? '').toLowerCase().startsWith('high'), wert: String(v['profile'] ?? '–') },
        { punkt: t('schnitt.pruef.farbformat'), ok: v['pix_fmt'] === 'yuv420p', wert: String(v['pix_fmt'] ?? '–') },
        { punkt: t('schnitt.pruef.farbraum'), ok: v['color_primaries'] === 'bt709' || v['color_space'] === 'bt709', wert: String(v['color_primaries'] ?? v['color_space'] ?? '–') }
      ]
  p.push({ punkt: t('schnitt.pruef.faststart'), ok: faststart, wert: t(faststart ? 'schnitt.ja' : 'schnitt.nein') })
  if (a) {
    p.push({ punkt: t('schnitt.pruef.aac'), ok: a['codec_name'] === 'aac', wert: String(a['codec_name']) })
    p.push({ punkt: t('schnitt.pruef.48k'), ok: String(a['sample_rate']) === '48000', wert: `${String(a['sample_rate'])} Hz` })
  }
  return p
}

/** MP4-Atome am Dateianfang lesen: liegt „moov“ vor „mdat“? */
export async function istFaststart(datei: string): Promise<boolean> {
  const fh = await open(datei, 'r')
  try {
    let pos = 0
    const kopf = Buffer.alloc(16)
    for (let i = 0; i < 20; i++) {
      const { bytesRead } = await fh.read(kopf, 0, 16, pos)
      if (bytesRead < 8) return false
      let groesse = kopf.readUInt32BE(0)
      const typ = kopf.toString('latin1', 4, 8)
      if (typ === 'moov') return true
      if (typ === 'mdat') return false
      if (groesse === 1) groesse = Number(kopf.readBigUInt64BE(8))
      if (groesse < 8) return false
      pos += groesse
    }
    return false
  } finally {
    await fh.close()
  }
}

/** Hochformat-Ziel (Shorts, Reels, TikTok): 1080 × 1920, Bildrate wie aufgenommen (höchstens 60) */
export function zielHoch(fps: number): { breite: number; hoehe: number; fps: number } {
  return { breite: 1080, hoehe: 1920, fps: Math.min(60, Math.round(fps) || 30) }
}

/** Prüfpunkte der Plattform zusätzlich zu den technischen (ROADMAP 5.7) */
export function plattformPruefung(v: PlattformVorgabe, o: { laenge: number; breite: number; hoehe: number; titel: string[]; beschreibung: string; kapitel: Kapitel[] }): Pruefung[] {
  const p: Pruefung[] = []
  if (v.maxDauer !== null) p.push({ punkt: t('schnitt.pruef.laenge', { max: kurzeZeit(v.maxDauer) }), ok: o.laenge <= v.maxDauer + 0.5, wert: kurzeZeit(o.laenge) })
  if (v.format !== 'audio') {
    const hoch = o.hoehe > o.breite
    p.push({ punkt: t('schnitt.pruef.format', { format: v.format }), ok: v.format === '9:16' ? hoch : !hoch, wert: `${o.breite}×${o.hoehe}` })
  }
  if (v.titelMax > 0) {
    const laengster = Math.max(0, ...o.titel.map((x) => x.length))
    p.push({ punkt: t('schnitt.pruef.titel', { max: v.titelMax }), ok: laengster > 0 && laengster <= v.titelMax, wert: String(laengster) })
  }
  p.push({ punkt: t('schnitt.pruef.text', { max: v.beschreibungMax }), ok: o.beschreibung.length <= v.beschreibungMax, wert: String(o.beschreibung.length) })
  if (o.kapitel.length) p.push({ punkt: t('schnitt.pruef.kapitel'), ok: pruefeKapitel(o.kapitel, o.laenge).length === 0, wert: String(o.kapitel.length) })
  return p
}

const kurzeZeit = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Kapitel als FFmetadata (für Podcast-Audio und MP4) */
export function kapitelMetadaten(k: Kapitel[], laenge: number): string {
  return `;FFMETADATA1\n${k
    .map((x, i) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(x.zeit * 1000)}\nEND=${Math.round((k[i + 1]?.zeit ?? laenge) * 1000)}\ntitle=${x.titel.replace(/[=;#\\\n]/g, ' ')}`)
    .join('\n')}\n`
}

const TexteZ = z.object({
  titel: z.array(z.string()).min(1).max(3),
  beschreibung: z.string(),
  kapitel: z.array(z.object({ zeit: z.number(), titel: z.string() }))
})

export function textPrompt(o: { kanal: string; plattform: string; sprache: string; vorgabe: PlattformVorgabe; laenge: number; zeilen: string[]; stil: string }): string {
  const v = o.vorgabe
  return `Der Creator veröffentlicht dieses Video auf ${o.plattform} (Kanal ${o.kanal}, Sprache ${o.sprache}). ${o.stil}
Transkript des fertigen Schnitts, jede Zeile mit Sekunde im Video:
${o.zeilen.join('\n')}

Schreibe in der Sprache ${o.sprache}:
- titel: ${v.nurText ? '1 kurzer Aufhänger (wird der erste Satz des Textes)' : `3 Vorschläge, knackig und ehrlich (kein Clickbait, der lügt), höchstens ${v.titelMax} Zeichen`}
- beschreibung: ${v.nurText ? `der Text zum Video, höchstens ${v.beschreibungMax} Zeichen, locker, mit 3–5 passenden Hashtags am Ende` : `2–4 Sätze, locker, ohne Hashtag-Wand, höchstens ${v.beschreibungMax} Zeichen`}
- kapitel: ${v.kapitel && o.laenge >= 60 ? 'Kapitel {zeit (Sekunden), titel}, erstes bei 0, mindestens 3, jedes mindestens 10 s lang, kurze Titel' : 'leere Liste'}
Antworte nur mit JSON nach dem Schema.`
}

export interface ExportPayload {
  daten: string
  projekt: string
  ffmpeg: string
  ffprobe: string
  encoder: string
  hilfe?: EffektHilfe
  umgebung?: ThumbUmgebung
}

export interface ExportErgebnis {
  datei: string
  plattform: string
  laenge: number
  titel: string[]
  beschreibung: string
  kapitel: Kapitel[]
  pruefung: Pruefung[]
}

function ausgabe(exe: string, args: string[], ctx: JobContext<unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    ctx.track(child)
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`ffprobe ${code}`))))
  })
}

export async function exportJob(p: ExportPayload, ctx: JobContext<unknown>, d: { ki: KiSchicht | null }): Promise<ExportErgebnis> {
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr?.quelle || !pr.rohschnitt) throw new Error(t('schnitt.fehler.erstRohschnitt'))
  const ordner = projektOrdner(p.daten, p.projekt)
  const vorgabe = PLATTFORM_VORGABEN[pr.plattform]
  const audio = vorgabe.format === 'audio'
  const hoch = !audio && einstellungen(pr).format === '9:16'
  const ziel = hoch ? zielHoch(pr.quelle.fps) : zielFormat(pr.quelle.breite, pr.quelle.hoehe, pr.quelle.fps)
  if (hoch) await verfolgungFallsNoetig(pr, ordner, p.ffmpeg, p.umgebung, ctx)
  const plan = await renderPlan(p.daten, pr, { quelle: pr.quelle.pfad, ...ziel, encoder: encoderArgs(p.encoder, ziel.hoehe, ziel.fps), ausgabe: 'export.mp4', untertitelDatei: 'export.ass' }, p.hilfe)
  const abb = zeitAbbildung(plan.liste.behalten)
  // Mit Effekten (Zeitlupe, Standbild) verschieben sich alle Zeiten: Kapitel gelten für das fertige Video
  const imSchnitt = (x: number): number | null => {
    const s = abb.imSchnitt(x)
    return s === null ? null : (plan.endzeit ?? ((y: number) => y))(s)
  }
  const laenge = plan.laengeEnde ?? abb.laenge

  // Titel, Text und Kapitel nach den Regeln der Plattform (Zeiten im fertigen Video)
  let text = { titel: [pr.name], beschreibung: '', kapitel: [] as Kapitel[] }
  const abschnitte = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8').catch(() => ''))
  if (d.ki && (await d.ki.kandidaten()).length && abschnitte.length) {
    ctx.progress(2, t('schnitt.schritt.texte'))
    const zeilen = abschnitte
      .map((a) => ({ z: imSchnitt(a.start), text: a.text }))
      .filter((a): a is { z: number; text: string } => a.z !== null)
      .map((a) => `[${Math.round(a.z)}] ${a.text}`)
    const erg = await d.ki
      .frage({ name: 'schnitt-texte', system: 'You write titles, descriptions and chapters for a video, following the platform rules exactly.', prompt: textPrompt({ kanal: pr.kanal, plattform: t(`plattform.${pr.plattform}`), sprache: sprachName(pr.sprache), vorgabe, laenge, zeilen, stil: stilText(stilFuer([pr.richtung]), [pr.richtung], '16:9', false) }), schema: TexteZ, stufe: 'schnell', maxAusgabe: 3000 }, ctx)
      .then((e) => e.daten)
      .catch(() => null)
    if (erg) {
      const titel = (vorgabe.titelMax > 0 ? erg.titel.map((x) => x.slice(0, vorgabe.titelMax)) : erg.titel).filter(Boolean)
      text = { titel: titel.length ? titel : text.titel, beschreibung: erg.beschreibung.slice(0, vorgabe.beschreibungMax), kapitel: vorgabe.kapitel ? repariereKapitel(erg.kapitel, laenge) : [] }
    }
  }
  // Den Titel, den der Creator selbst gewählt hat, nicht durch Vorschläge der KI verdrängen (aus MoinStudio v0.38.0)
  if (pr.titelGewaehlt) text.titel = [pr.titelGewaehlt, ...text.titel.filter((x) => x !== pr.titelGewaehlt)]

  await ctx.yield()
  const endung = audio ? 'm4a' : 'mp4'
  const datei = join(ordner, `export.${endung}`)
  if (audio) {
    // Podcast: nur der geschnittene Ton, AAC, mit Kapiteln als Metadaten
    const auswahl = auswahlAusdruck(plan.liste.behalten)
    await writeFile(join(ordner, 'export-kapitel.txt'), kapitelMetadaten(text.kapitel, laenge))
    await ffmpegMitFortschritt(p.ffmpeg, ['-i', pr.quelle.pfad, '-i', 'export-kapitel.txt', '-map_metadata', '1', '-map_chapters', '1', '-vn', '-af', `aselect='${auswahl}',asetpts=N/SR/TB`, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', `export.${endung}`], ctx, laenge, (a) => ctx.progress(8 + a * 88, t('schnitt.schritt.export', { prozent: Math.round(a * 100) })), ordner)
  } else {
    await writeFile(join(ordner, 'export-filter.txt'), filterGraph(plan))
    await ffmpegMitFortschritt(p.ffmpeg, renderArgs(plan, 'export-filter.txt'), ctx, laenge, (a) => ctx.progress(8 + a * 88, t('schnitt.schritt.export', { prozent: Math.round(a * 100) })), ordner)
  }

  ctx.progress(97, t('schnitt.schritt.pruefen'))
  const probe = JSON.parse(await ausgabe(p.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', datei], ctx)) as { streams?: Record<string, unknown>[] }
  const technik = technikPruefung(probe, await istFaststart(datei), audio)
  const v = probe.streams?.find((s) => s['codec_type'] === 'video')
  const pruefung = [...technik, ...plattformPruefung(vorgabe, { laenge, breite: Number(v?.['width'] ?? 0), hoehe: Number(v?.['height'] ?? 0), titel: text.titel, beschreibung: text.beschreibung, kapitel: text.kapitel })]
  const ergebnis: ExportErgebnis = { datei, plattform: pr.plattform, laenge, ...text, pruefung }
  await writeFile(join(ordner, 'export.json'), JSON.stringify(ergebnis, null, 1))
  await aendereProjekt(p.daten, p.projekt, () => ({ export: Date.now() }))
  ctx.progress(100, t('jobs.schritt.fertig'))
  return ergebnis
}
