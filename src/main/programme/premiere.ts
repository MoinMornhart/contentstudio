// Herkunft: MoinStudio src/main/adobe/premiere.ts (MIT), Marker übersetzbar.
import { basename } from 'node:path'
import type { Bereich, Schnittliste } from '../schnitt/rohschnitt'
import { sauber, zeitAbbildung } from '../schnitt/render'
import type { Effekt, EffektLage } from '../schnitt/effekte'
import { effektText } from '@shared/effekt-text'
import { t } from '../i18n'

/**
 * Premiere (ROADMAP 7.1, ungetestet in Premiere): der Schnitt als FCP7-XML (xmeml Version 5). Premiere übernimmt daraus Schnitte,
 * Spuren, Sequenz-Marker und Bewegungs-Keyframes (docs/research/adobe.md §5). Die Clips zeigen auf das Original, nicht
 * auf die Vorschau. Zooms werden wie im Render (1,12-fach, 0,35 s Rampe) zu Keyframes des Effekts „Basic Motion“.
 *
 * Effekte (ROADMAP 5.4): Zoom-Effekte werden Scale- und Center-Keyframes, Texte liegen als PNG auf Spur V2,
 * Bibliotheks-Videos und -Bilder als echte Clips auf der Spur darüber, Geräusche und der Ton der Animationen auf A2
 * (aus MoinStudio v0.55.0). Jeder Effekt bekommt einen Marker mit Beschreibung. Was FCP7-XML nicht sicher abbildet
 * (Tempo, Standbild, Intro, Farbe …), steht nur als Marker da und wird in Premiere von Hand gesetzt.
 */

export interface PremiereQuelle {
  pfad: string
  dauer: number
  breite: number
  hoehe: number
  fps: number
  audio: boolean
}

export interface PremiereOptionen {
  name: string
  quelle: PremiereQuelle
  liste: Schnittliste
  /** Zeiten im geschnittenen Video */
  zooms: Bereich[]
  /** Kapitel (Zeit im geschnittenen Video) → Sequenz-Marker */
  kapitel: { zeit: number; titel: string }[]
  /** Effekte in Schnittzeit */
  effekte?: Effekt[]
  /** Text-Bilder aus der Vorschau (Schlüssel = Index in effekte) */
  textBilder?: Record<string, { datei: string; breite: number; hoehe: number }>
  /** Bibliotheks-Videos und -Bilder (Abo-Animation …) als echte Clips über den Texten */
  einblendungen?: PremiereEinblendung[]
  /** Geräusche und Ton der Einblendungen als Clips auf Spur A2 */
  toene?: PremiereTon[]
}

export interface PremiereEinblendung {
  datei: string
  /** Zeit im geschnittenen Video und Dauer in Sekunden */
  start: number
  dauer: number
  breite: number
  hoehe: number
  /** Anteil der Bildbreite (1 = ganzes Bild) und Lage wie im FFmpeg-Render */
  groesse: number
  lage: EffektLage
  standbild: boolean
}

export interface PremiereTon {
  datei: string
  start: number
  dauer: number
  /** Lautstärke-Faktor (1 = unverändert) */
  lautstaerke: number
}

/** Zoom-Bereich im geschnittenen Video; ohne faktor der automatische Zoom (1,12), x/y = Zielpunkt (0–1) */
export type PremiereZoom = Bereich & { faktor?: number; x?: number; y?: number }

export const ZOOM = { faktor: 1.12, rampe: 0.35 } as const

/** Zeitbasis wie in FCP7: 29,97 → 30 mit NTSC, 25 → 25 ohne. */
export function zeitbasis(fps: number): { timebase: number; ntsc: boolean; echt: number } {
  const rund = Math.round(fps)
  const ntsc = Math.abs(fps - (rund * 1000) / 1001) < 0.01 && Math.abs(fps - rund) > 0.01
  return { timebase: rund || 30, ntsc, echt: ntsc ? (rund * 1000) / 1001 : rund || 30 }
}

/** Datei-URL für Premiere: file://localhost/C:/Ordner/Datei%20mit%20Leerzeichen.mp4 */
export function dateiUrl(pfad: string): string {
  const teile = pfad.replace(/\\/g, '/').split('/')
  return `file://localhost/${teile.map((t, i) => (i === 0 && /^[A-Za-z]:$/.test(t) ? t : encodeURIComponent(t))).join('/')}`
}

const x = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rampe = (z: PremiereZoom): number => Math.min(ZOOM.rampe, (z.ende - z.start) / 3)
const gewicht = (z: PremiereZoom, t: number): number => Math.min(1, Math.max(0, (t - z.start) / rampe(z))) * Math.min(1, Math.max(0, (z.ende - t) / rampe(z)))
const extra = (z: PremiereZoom): number => Math.min(4, Math.max(1, z.faktor ?? ZOOM.faktor)) - 1

/** Zoomfaktor zur Zeit t im geschnittenen Video (gleiche Formel wie der FFmpeg-Render) */
export function zoomBei(zooms: PremiereZoom[], t: number): number {
  return 1 + zooms.reduce((s, z) => s + extra(z) * gewicht(z, t), 0)
}

/**
 * Bildmitte zur Zeit t als Verschiebung in Bildbreiten/-höhen (0/0 = Mitte, wie „center“ in FCP7): Beim Zoom auf einen
 * Punkt wandert das Bild so, wie der Render-Ausschnitt dorthin wandert. [EINSCHÄTZUNG: Einheit bis zum Premiere-Test]
 */
export function mitteBei(zooms: PremiereZoom[], t: number): { x: number; y: number } {
  const r = (k: 'x' | 'y'): number => Math.round(zooms.reduce((s, z) => s - extra(z) * gewicht(z, t) * ((z[k] ?? 0.5) - 0.5), 0) * 10000) / 10000 || 0
  return { x: r('x'), y: r('y') }
}

/** Keyframes (Zeit im Schnitt, Skalierung in Prozent) für einen Clip von a bis b; leer, wenn kein Zoom hineinfällt. */
export function zoomKeyframes(zooms: PremiereZoom[], a: number, b: number): { t: number; wert: number; mitte: { x: number; y: number } }[] {
  const rein = zooms.filter((z) => z.ende > a && z.start < b)
  if (!rein.length) return []
  const punkte = new Set<number>([a, b])
  for (const z of rein) for (const t of [z.start, z.start + rampe(z), z.ende - rampe(z), z.ende]) if (t > a && t < b) punkte.add(Math.round(t * 1000) / 1000)
  return [...punkte].sort((p, q) => p - q).map((t) => ({ t, wert: Math.round(zoomBei(zooms, t) * 1000) / 10, mitte: mitteBei(zooms, t) }))
}

const bewegung = (scale: string, center: string): string =>
  `<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter authoringApp="PremierePro"><parameterid>scale</parameterid><name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax>${scale}</parameter>${center ? `<parameter authoringApp="PremierePro"><parameterid>center</parameterid><name>Center</name>${center}</parameter>` : ''}</effect></filter>`
const punkt = (m: { x: number; y: number }): string => `<horiz>${m.x}</horiz><vert>${m.y}</vert>`

/** Marker-Text für einen Effekt; Hinweis, wenn er in Premiere von Hand gesetzt werden muss */
export function effektMarker(e: Effekt, mitMedien = false): { name: string; hinweis: string } {
  const automatisch = e.art === 'zoom' || e.art === 'text' || (mitMedien && (e.art === 'video' || e.art === 'bild' || e.art === 'geraeusch'))
  return { name: sauber(t('programme.marker.effekt', { text: effektText(e, t) })), hinweis: t(automatisch ? 'programme.marker.automatisch' : 'programme.marker.vonHand') }
}

/** Anfangszeit eines Effekts im geschnittenen Video (Intro: 0) */
const effektZeit = (e: Effekt): number => ('von' in e ? e.von : 'bei' in e ? e.bei : 0)

function rate(zb: ReturnType<typeof zeitbasis>): string {
  return `<rate><timebase>${zb.timebase}</timebase><ntsc>${zb.ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`
}

export function premiereXml(o: PremiereOptionen): string {
  const zb = zeitbasis(o.quelle.fps)
  const f = (s: number): number => Math.round(s * zb.echt)
  const quelleFrames = f(o.quelle.dauer)
  const { laenge } = zeitAbbildung(o.liste.behalten)
  const effekte = o.effekte ?? []
  const zooms: PremiereZoom[] = [...o.zooms, ...effekte.flatMap((e) => (e.art === 'zoom' ? [{ start: e.von, ende: e.bis, faktor: e.faktor, x: e.x, y: e.y }] : []))]
  const dateiName = basename(o.quelle.pfad)
  const dateiVoll = `<file id="file-1"><name>${x(dateiName)}</name><pathurl>${x(dateiUrl(o.quelle.pfad))}</pathurl>${rate(zb)}<duration>${quelleFrames}</duration><media><video><samplecharacteristics>${rate(zb)}<width>${o.quelle.breite}</width><height>${o.quelle.hoehe}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>${o.quelle.audio ? '<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>' : ''}</media></file>`

  // Stücke auf der Zeitleiste: Start im Schnitt aus aufsummierten Frames, damit keine Lücken durch Rundung entstehen
  let pos = 0
  const stuecke = o.liste.behalten.map((b, i) => {
    const inF = f(b.start)
    const outF = Math.max(inF + 1, f(b.ende))
    const start = pos
    pos += outF - inF
    const schnittStart = zeitAbbildung(o.liste.behalten.slice(0, i)).laenge
    return { i: i + 1, inF, outF, start, ende: pos, a: schnittStart, b: schnittStart + (b.ende - b.start) }
  })

  const video = stuecke
    .map((s) => {
      const kf = zoomKeyframes(zooms, s.a, s.b)
      // Keyframe-Zeiten in Frames der Quelle (relativ zum Medienanfang, wie in/out); Center nur beim Zoom auf einen Punkt
      const wann = (t: number): number => s.inF + f(t - s.a)
      const mitte = kf.some((k) => k.mitte.x !== 0 || k.mitte.y !== 0)
      const filter = kf.length
        ? bewegung(
            `<value>100</value>${kf.map((k) => `<keyframe><when>${wann(k.t)}</when><value>${k.wert}</value></keyframe>`).join('')}`,
            mitte ? `<value>${punkt({ x: 0, y: 0 })}</value>${kf.map((k) => `<keyframe><when>${wann(k.t)}</when><value>${punkt(k.mitte)}</value></keyframe>`).join('')}` : ''
          )
        : ''
      const links = o.quelle.audio ? `<link><linkclipref>clipitem-v${s.i}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${s.i}</clipindex></link><link><linkclipref>clipitem-a${s.i}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${s.i}</clipindex></link>` : ''
      return `<clipitem id="clipitem-v${s.i}"><name>${x(dateiName)}</name><enabled>TRUE</enabled><duration>${quelleFrames}</duration>${rate(zb)}<start>${s.start}</start><end>${s.ende}</end><in>${s.inF}</in><out>${s.outF}</out>${s.i === 1 ? dateiVoll : '<file id="file-1"/>'}${filter}${links}</clipitem>`
    })
    .join('')
  const audio = o.quelle.audio
    ? `<audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format><track>${stuecke
        .map(
          (s) =>
            `<clipitem id="clipitem-a${s.i}"><name>${x(dateiName)}</name><enabled>TRUE</enabled><duration>${quelleFrames}</duration>${rate(zb)}<start>${s.start}</start><end>${s.ende}</end><in>${s.inF}</in><out>${s.outF}</out><file id="file-1"/><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack><link><linkclipref>clipitem-v${s.i}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${s.i}</clipindex></link><link><linkclipref>clipitem-a${s.i}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${s.i}</clipindex></link></clipitem>`
        )
        .join('')}</track></audio>`
    : ''
  // Texte als Standbild-Clips auf V2, Größe und Lage wie im Render (Text: Anteil der Bildhöhe je Zeile)
  const texte = effekte.flatMap((e, i) => {
    const tb = o.textBilder?.[String(i)]
    if (e.art !== 'text' || !tb) return []
    const start = f(e.von)
    const ende = Math.max(start + 1, f(e.bis))
    const zeilen = Math.max(1, e.text.split('\n').length)
    const breite = Math.min(o.quelle.breite, o.quelle.hoehe * Math.min(0.4, Math.max(0.07, e.groesse ?? 0.12)) * (tb.breite / Math.max(1, tb.hoehe / zeilen)))
    const skala = Math.round((breite / tb.breite) * 1000) / 10
    const h = (tb.hoehe * skala) / 100 / o.quelle.hoehe
    const lage = e.lage ?? 'oben'
    const y = lage === 'oben' ? 0.08 + h / 2 - 0.5 : lage === 'unten' ? 0.78 - h / 2 - 0.5 : 0
    const n = ende - start
    const bild = `<file id="file-t${i}"><name>${x(basename(tb.datei))}</name><pathurl>${x(dateiUrl(tb.datei))}</pathurl>${rate(zb)}<duration>${n}</duration><media><video><samplecharacteristics><width>${tb.breite}</width><height>${tb.hoehe}</height></samplecharacteristics></video></media></file>`
    return [`<clipitem id="clipitem-t${i}"><name>${x(sauber(e.text))}</name><enabled>TRUE</enabled><duration>${n}</duration>${rate(zb)}<start>${start}</start><end>${ende}</end><in>0</in><out>${n}</out>${bild}${bewegung(`<value>${skala}</value>`, `<value>${punkt({ x: 0, y: Math.round(y * 10000) / 10000 })}</value>`)}</clipitem>`]
  })
  const textSpur = texte.length ? `<track>${texte.join('')}</track>` : ''
  // Einblendungen: Größe als Anteil der Bildbreite, Lage wie im Render (volle Größe = ganzes Bild, Mitte)
  const einblendungen = (o.einblendungen ?? []).map((e, j) => {
    const start = f(e.start)
    const n = Math.max(1, f(e.dauer))
    const g = Math.min(1, Math.max(0.05, e.groesse))
    const skala = Math.round(((o.quelle.breite * g) / Math.max(1, e.breite)) * 1000) / 10
    const h = (e.hoehe * skala) / 100 / o.quelle.hoehe
    const voll = g >= 1 || e.lage === 'voll'
    const mx = voll ? 0 : e.lage.includes('links') ? 0.04 + g / 2 - 0.5 : e.lage.includes('rechts') ? 0.96 - g / 2 - 0.5 : 0
    const my = voll ? 0 : e.lage.includes('oben') ? 0.06 + h / 2 - 0.5 : e.lage === 'mitte' || e.lage === 'links' || e.lage === 'rechts' ? 0 : 0.94 - h / 2 - 0.5
    const datei = `<file id="file-e${j}"><name>${x(basename(e.datei))}</name><pathurl>${x(dateiUrl(e.datei))}</pathurl>${rate(zb)}<duration>${n}</duration><media><video><samplecharacteristics><width>${e.breite}</width><height>${e.hoehe}</height></samplecharacteristics></video></media></file>`
    return `<clipitem id="clipitem-e${j}"><name>${x(sauber(basename(e.datei)))}</name><enabled>TRUE</enabled><duration>${n}</duration>${rate(zb)}<start>${start}</start><end>${start + n}</end><in>0</in><out>${n}</out>${datei}${bewegung(`<value>${skala}</value>`, `<value>${punkt({ x: Math.round(mx * 10000) / 10000, y: Math.round(my * 10000) / 10000 })}</value>`)}</clipitem>`
  })
  const einblendSpur = einblendungen.length ? `<track>${einblendungen.join('')}</track>` : ''
  // Töne auf A2 (Geräusche, Ton der Abo-Animation)
  const toene = (o.toene ?? []).map((s, j) => {
    const start = f(s.start)
    const n = Math.max(1, f(s.dauer))
    const pegel = s.lautstaerke !== 1 ? `<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name><valuemin>0</valuemin><valuemax>3.98109</valuemax><value>${Math.min(3.98, Math.max(0, s.lautstaerke))}</value></parameter></effect></filter>` : ''
    return `<clipitem id="clipitem-g${j}"><name>${x(sauber(basename(s.datei)))}</name><enabled>TRUE</enabled><duration>${n}</duration>${rate(zb)}<start>${start}</start><end>${start + n}</end><in>0</in><out>${n}</out><file id="file-g${j}"><name>${x(basename(s.datei))}</name><pathurl>${x(dateiUrl(s.datei))}</pathurl>${rate(zb)}<duration>${n}</duration><media><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio></media></file><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>${pegel}</clipitem>`
  })
  const tonSpur = toene.length ? `<track>${toene.join('')}</track>` : ''
  const mitMedien = einblendungen.length + toene.length > 0
  const effektMarkerXml = effekte
    .filter((e) => effektZeit(e) >= 0 && effektZeit(e) <= laenge)
    .sort((a, b) => effektZeit(a) - effektZeit(b))
    .map((e) => {
      const m = effektMarker(e, mitMedien)
      const bis = 'bis' in e ? f(e.bis) : -1
      return `<marker><name>${x(m.name)}</name><comment>${x(m.hinweis)}</comment><in>${f(effektZeit(e))}</in><out>${bis}</out></marker>`
    })
    .join('')
  const marker = o.kapitel
    .filter((k) => k.zeit >= 0 && k.zeit <= laenge)
    .map((k) => `<marker><name>${x(sauber(k.titel))}</name><comment>${x(t('programme.marker.kapitel'))}</comment><in>${f(k.zeit)}</in><out>-1</out></marker>`)
    .join('')
  const format = `<format><samplecharacteristics>${rate(zb)}<width>${o.quelle.breite}</width><height>${o.quelle.hoehe}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5"><sequence id="sequence-1"><name>${x(o.name)}</name><duration>${pos}</duration>${rate(zb)}<timecode>${rate(zb)}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media><video>${format}<track>${video}</track>${textSpur}${einblendSpur}</video>${audio ? audio.replace('</track></audio>', `</track>${tonSpur}</audio>`) : tonSpur ? `<audio><numOutputChannels>2</numOutputChannels>${tonSpur}</audio>` : ''}</media>${marker}${effektMarkerXml}</sequence></xmeml>
`
}

const srtZeit = (s: number): string => {
  const ms = Math.round(s * 1000)
  const z = (n: number, l = 2): string => String(n).padStart(l, '0')
  return `${z(Math.floor(ms / 3_600_000))}:${z(Math.floor(ms / 60_000) % 60)}:${z(Math.floor(ms / 1000) % 60)},${z(ms % 1000, 3)}`
}

/** Untertitel als SRT (Zeiten im geschnittenen Video), in Premiere als Untertitelspur importierbar */
export function srt(zeilen: { start: number; ende: number; text: string }[]): string {
  return zeilen.map((z, i) => `${i + 1}\n${srtZeit(z.start)} --> ${srtZeit(z.ende)}\n${z.text}\n`).join('\n')
}
