import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { effektText } from '@shared/effekt-text'
import { t } from '../i18n'
import type { JobContext } from '../jobs/queue'
import type { Effekt } from '../schnitt/effekte'
import type { Bereich } from '../schnitt/rohschnitt'
import { srt } from './premiere'

/**
 * CapCut (ROADMAP 7.3): CapCut hat kein offenes Projektformat und keine Fernsteuerung. ContentStudio legt deshalb einen
 * Ordner an, den man in wenigen Schritten übernimmt: jedes behaltene Stück als eigener Clip in der richtigen
 * Reihenfolge (001.mp4, 002.mp4 …), die Untertitel als SRT (CapCut: Text → Untertitel importieren), eine Liste mit
 * Zeiten, Kapiteln und Effekten zum Nachbauen und eine kurze Anleitung.
 */

export interface CapcutEingabe {
  quelle: string
  behalten: Bereich[]
  untertitel: { start: number; ende: number; text: string }[]
  kapitel: { zeit: number; titel: string }[]
  effekte: Effekt[]
  titel: string
  ziel: string
  ffmpeg: string
}

const zwei = (n: number): string => String(n).padStart(2, '0')
const zeit = (s: number): string => `${Math.floor(s / 60)}:${zwei(Math.floor(s % 60))}`
export const clipName = (i: number): string => `${String(i + 1).padStart(3, '0')}.mp4`

/** Liste zum Nachbauen: Reihenfolge der Clips, Kapitel und Effekte in Zeit des fertigen Videos */
export function capcutListe(e: Pick<CapcutEingabe, 'behalten' | 'kapitel' | 'effekte' | 'titel' | 'quelle'>): string {
  let pos = 0
  const clips = e.behalten.map((b, i) => {
    const z = `${clipName(i)}  ${zeit(pos)}–${zeit(pos + b.ende - b.start)}  (${t('programme.capcut.original')} ${zeit(b.start)}–${zeit(b.ende)})`
    pos += b.ende - b.start
    return z
  })
  const effektZeit = (x: Effekt): number => ('von' in x ? x.von : 'bei' in x ? x.bei : 0)
  return [
    e.titel,
    `${t('programme.capcut.quelle')}: ${basename(e.quelle)}`,
    '',
    `${t('programme.capcut.clips')}:`,
    ...clips,
    ...(e.kapitel.length ? ['', `${t('programme.marker.kapitel')}:`, ...e.kapitel.map((k) => `${zeit(k.zeit)}  ${k.titel}`)] : []),
    ...(e.effekte.length ? ['', `${t('programme.capcut.effekte')}:`, ...e.effekte.map((x) => `${zeit(effektZeit(x))}  ${effektText(x, t)}`)] : []),
    ''
  ].join('\r\n')
}

const lauf = (exe: string, args: string[], ctx?: JobContext<unknown>): Promise<void> =>
  new Promise((resolve, reject) => {
    const kind = execFile(exe, args, { windowsHide: true, timeout: 30 * 60_000, maxBuffer: 4_000_000 }, (err, _o, stderr) => (err ? reject(new Error(String(stderr).trim().split(/\r?\n/).slice(-1)[0] || err.message)) : resolve()))
    ctx?.track(kind)
  })

/** Schreibt den CapCut-Ordner; Clips werden genau geschnitten (neu kodiert, damit jeder Clip mit einem Bild beginnt). */
export async function capcutOrdner(e: CapcutEingabe, ctx?: JobContext<unknown>): Promise<{ ordner: string; clips: string[] }> {
  await mkdir(join(e.ziel, 'clips'), { recursive: true })
  const clips: string[] = []
  for (const [i, b] of e.behalten.entries()) {
    ctx?.progress(Math.round((i / Math.max(1, e.behalten.length)) * 95), t('programme.capcut.schritt', { nr: i + 1, von: e.behalten.length }))
    const datei = join(e.ziel, 'clips', clipName(i))
    await lauf(e.ffmpeg, ['-y', '-v', 'error', '-ss', b.start.toFixed(3), '-to', b.ende.toFixed(3), '-i', e.quelle, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', datei], ctx)
    clips.push(datei)
    await ctx?.yield()
  }
  if (e.untertitel.length) await writeFile(join(e.ziel, 'untertitel.srt'), srt(e.untertitel))
  await writeFile(join(e.ziel, 'liste.txt'), capcutListe(e))
  await writeFile(join(e.ziel, 'anleitung.txt'), `${t('programme.capcut.anleitung')}\r\n`)
  ctx?.progress(100, t('jobs.schritt.fertig'))
  return { ordner: e.ziel, clips }
}
