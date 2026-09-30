import { basename } from 'node:path'
import { effektText } from '@shared/effekt-text'
import { t } from '../i18n'
import type { Effekt } from '../schnitt/effekte'
import { sauber, zeitAbbildung } from '../schnitt/render'
import type { Bereich } from '../schnitt/rohschnitt'
import { dateiUrl, zeitbasis, type PremiereOptionen } from './premiere'

/**
 * DaVinci Resolve (ROADMAP 7.2, ungetestet in Resolve): der Schnitt als FCPXML 1.10 (Datei → Importieren → Zeitleiste)
 * und als EDL (CMX 3600) für ältere Versionen und andere Programme. Die Clips zeigen auf das Original. Kapitel und
 * Effekte werden Marker; Zooms, Texte und alles andere setzt man in Resolve von Hand (die Vorschau zeigt, wie es aussieht).
 */

const x = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Rationale Zeit für FCPXML: Frames × Bilddauer, z. B. „1001/30000s“ je Frame bei 29,97 */
export function fcpZeit(frames: number, fps: number): string {
  const zb = zeitbasis(fps)
  if (frames === 0) return '0s'
  return zb.ntsc ? `${frames * 1001}/${zb.timebase * 1000}s` : `${frames}/${zb.timebase}s`
}

/** Datei-URL für FCPXML: file:///C:/Ordner/Datei%20mit%20Leerzeichen.mp4 */
export const fcpUrl = (pfad: string): string => dateiUrl(pfad).replace('file://localhost/', 'file:///')

interface Stueck {
  inF: number
  outF: number
  start: number
  a: number
  b: number
}

/** Behaltene Stücke als Frames: Quelle (in/out) und Lage in der Zeitleiste ohne Rundungslücken */
export function stuecke(behalten: Bereich[], fps: number): Stueck[] {
  const f = (s: number): number => Math.round(s * zeitbasis(fps).echt)
  let pos = 0
  return behalten.map((b, i) => {
    const inF = f(b.start)
    const outF = Math.max(inF + 1, f(b.ende))
    const start = pos
    pos += outF - inF
    const a = zeitAbbildung(behalten.slice(0, i)).laenge
    return { inF, outF, start, a, b: a + (b.ende - b.start) }
  })
}

const effektStart = (e: Effekt): number => ('von' in e ? e.von : 'bei' in e ? e.bei : 0)

export function resolveFcpxml(o: PremiereOptionen): string {
  const fps = o.quelle.fps
  const zb = zeitbasis(fps)
  const f = (s: number): number => Math.round(s * zb.echt)
  const teile = stuecke(o.liste.behalten, fps)
  const gesamt = teile.length ? teile[teile.length - 1]!.start + (teile[teile.length - 1]!.outF - teile[teile.length - 1]!.inF) : 0
  const name = basename(o.quelle.pfad)
  // Marker: Kapitel und Effekte, jeweils am Clip, in den ihre Zeit fällt (FCPXML-Marker liegen in Quellzeit des Clips)
  const marker: { zeit: number; wert: string; notiz: string }[] = [
    ...o.kapitel.map((k) => ({ zeit: k.zeit, wert: sauber(k.titel), notiz: t('programme.marker.kapitel') })),
    ...(o.effekte ?? []).map((e) => ({ zeit: effektStart(e), wert: sauber(t('programme.marker.effekt', { text: effektText(e, t) })), notiz: t('programme.marker.vonHand') }))
  ]
  const clips = teile
    .map((s) => {
      const hier = marker.filter((m) => m.zeit >= s.a && (m.zeit < s.b || (s === teile[teile.length - 1] && m.zeit <= s.b)))
      const markerXml = hier.map((m) => `\n            <marker start="${fcpZeit(s.inF + f(m.zeit - s.a), fps)}" duration="${fcpZeit(1, fps)}" value="${x(m.wert)}" note="${x(m.notiz)}"/>`).join('')
      return `\n          <asset-clip ref="r2" offset="${fcpZeit(s.start, fps)}" name="${x(name)}" start="${fcpZeit(s.inF, fps)}" duration="${fcpZeit(s.outF - s.inF, fps)}" format="r1" tcFormat="NDF"${o.quelle.audio ? ' audioRole="dialogue"' : ''}>${markerXml}${markerXml ? '\n          ' : ''}</asset-clip>`
    })
    .join('')
  const quelleFrames = f(o.quelle.dauer)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat${o.quelle.hoehe}p${Math.round(fps)}" frameDuration="${fcpZeit(1, fps)}" width="${o.quelle.breite}" height="${o.quelle.hoehe}"/>
    <asset id="r2" name="${x(name)}" start="0s" duration="${fcpZeit(quelleFrames, fps)}" hasVideo="1" format="r1"${o.quelle.audio ? ' hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"' : ''}>
      <media-rep kind="original-media" src="${x(fcpUrl(o.quelle.pfad))}"/>
    </asset>
  </resources>
  <library>
    <event name="ContentStudio">
      <project name="${x(o.name)}">
        <sequence format="r1" duration="${fcpZeit(gesamt, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>${clips}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`
}

/** Timecode HH:MM:SS:FF (nicht drop-frame) */
export function timecode(frames: number, timebase: number): string {
  const z = (n: number): string => String(n).padStart(2, '0')
  const ff = frames % timebase
  const s = Math.floor(frames / timebase)
  return `${z(Math.floor(s / 3600))}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}:${z(ff)}`
}

/** EDL (CMX 3600): ein Ereignis je behaltenem Stück, Bild und Ton, Kapitel als Kommentare */
export function resolveEdl(o: PremiereOptionen): string {
  const zb = zeitbasis(o.quelle.fps)
  const name = basename(o.quelle.pfad)
  const zeilen = [`TITLE: ${sauber(o.name).slice(0, 60)}`, 'FCM: NON-DROP FRAME', '']
  stuecke(o.liste.behalten, o.quelle.fps).forEach((s, i) => {
    const nr = String(i + 1).padStart(3, '0')
    zeilen.push(`${nr}  AX       ${o.quelle.audio ? 'AA/V ' : 'V    '} C        ${timecode(s.inF, zb.timebase)} ${timecode(s.outF, zb.timebase)} ${timecode(s.start, zb.timebase)} ${timecode(s.start + s.outF - s.inF, zb.timebase)}`)
    zeilen.push(`* FROM CLIP NAME: ${name}`)
    for (const k of o.kapitel.filter((k) => k.zeit >= s.a && k.zeit < s.b)) zeilen.push(`* ${t('programme.marker.kapitel').toUpperCase()}: ${sauber(k.titel)} (${timecode(s.start + Math.round((k.zeit - s.a) * zb.echt), zb.timebase)})`)
    zeilen.push('')
  })
  return zeilen.join('\r\n')
}
