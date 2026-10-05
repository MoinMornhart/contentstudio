// Herkunft: MoinStudio src/main/adobe/premiere-export.ts, premiereMedien (MIT, v0.55.0).
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, rename } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { bibPfad } from '../schnitt/bibliothek'
import { chromaFilter } from '../schnitt/chroma'
import type { Effekt } from '../schnitt/effekte'
import { sichereKlaenge } from '../schnitt/klaenge'
import type { PremiereEinblendung, PremiereTon } from './premiere'

export interface MedienWerkzeuge {
  ffmpeg: string
  /** Ordner der Standard-Geräusche (%LOCALAPPDATA%\ContentStudio\klaenge) */
  klaenge: string
}

function lauf(exe: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(exe, args, { windowsHide: true, maxBuffer: 4_000_000, timeout: 600_000 }, (err, out) => (err ? reject(err) : resolve(out))))
}

/** Breite, Höhe, Dauer und Ton einer Mediendatei (ffprobe neben ffmpeg); null, wenn ffprobe fehlt oder scheitert */
async function medienInfo(ffmpeg: string, datei: string): Promise<{ breite: number; hoehe: number; dauer: number; ton: boolean } | null> {
  const probe = join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  if (!existsSync(probe)) return null
  try {
    const j = JSON.parse(await lauf(probe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', datei])) as { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } }
    const v = j.streams?.find((s) => s.codec_type === 'video')
    return { breite: v?.width ?? 1920, hoehe: v?.height ?? 1080, dauer: Number(j.format?.duration ?? 0) || 0, ton: !!j.streams?.some((s) => s.codec_type === 'audio') }
  } catch {
    return null
  }
}

/**
 * Bibliotheks-Effekte und Geräusche für Premiere: statt nur Marker echte Clips – Videos und Bilder als eigene Spur,
 * Geräusche und der Ton der Animationen auf A2. Greenscreen und WebM wandelt FFmpeg einmal in ProRes 4444 mit Alphakanal
 * (Premiere liest das sicher); Standard-Geräusche und solche Wandlungen landen in `ziel` (im Projektordner) und kommen so
 * über den Datenordner auf jedes Gerät. Ohne FFmpeg bleibt es bei den Markern.
 */
export async function premiereMedien(daten: string, ziel: string, effekte: Effekt[], w: MedienWerkzeuge | null): Promise<{ einblendungen: PremiereEinblendung[]; toene: PremiereTon[] }> {
  const einblendungen: PremiereEinblendung[] = []
  const toene: PremiereTon[] = []
  if (!w) return { einblendungen, toene }
  const finde = (d: string): string | null => (d.startsWith('bib:') ? bibPfad(daten, d) : existsSync(d) ? d : null)
  let klaenge: Record<string, string> | null = null
  for (const e of effekte) {
    if (e.art === 'video' || e.art === 'bild') {
      let datei = finde(e.datei)
      if (!datei) continue
      const info = await medienInfo(w.ffmpeg, datei)
      if (e.art === 'video' && (e.chroma || extname(datei).toLowerCase() === '.webm')) {
        // freistellen bzw. Alphakanal sichern – einmal je Datei und Einstellung
        const schluessel = createHash('sha1').update(`${datei}|${JSON.stringify(e.chroma ?? null)}`).digest('hex').slice(0, 10)
        const fertig = join(ziel, `${basename(datei, extname(datei))}-${schluessel}.mov`)
        if (!existsSync(fertig)) {
          await mkdir(ziel, { recursive: true })
          const vor = extname(datei).toLowerCase() === '.webm' ? ['-c:v', 'libvpx-vp9'] : []
          await lauf(w.ffmpeg, ['-y', '-v', 'error', ...vor, '-i', datei, '-vf', e.chroma ? chromaFilter(e.chroma) : 'format=rgba', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-c:a', 'pcm_s16le', `${fertig}.teil.mov`])
          await rename(`${fertig}.teil.mov`, fertig)
        }
        datei = fertig
      }
      const start = e.art === 'video' ? e.bei : e.von
      const dauer = e.art === 'bild' ? Math.max(0.2, e.bis - e.von) : Math.max(0.2, info?.dauer || 3)
      einblendungen.push({ datei, start, dauer, breite: info?.breite ?? 1920, hoehe: info?.hoehe ?? 1080, groesse: e.groesse ?? (e.art === 'video' ? 1 : 0.3), lage: e.lage ?? (e.art === 'video' ? 'unten' : 'rechts'), standbild: e.art === 'bild' })
      if (e.art === 'video' && e.ton && info?.ton) toene.push({ datei, start, dauer, lautstaerke: 1 })
    } else if (e.art === 'geraeusch') {
      let datei: string | null
      if (e.klang.startsWith('bib:')) datei = bibPfad(daten, e.klang)
      else {
        klaenge ??= await sichereKlaenge(w.ffmpeg, w.klaenge).catch(() => ({}) as Record<string, string>)
        const lokal = klaenge[e.klang]
        if (!lokal || !existsSync(lokal)) continue
        // Standard-Geräusche: Kopie ins Projekt, damit Premiere sie auf jedem Gerät findet
        datei = join(ziel, basename(lokal))
        if (!existsSync(datei)) {
          await mkdir(ziel, { recursive: true })
          await copyFile(lokal, datei)
        }
      }
      if (!datei) continue
      const info = await medienInfo(w.ffmpeg, datei)
      toene.push({ datei, start: e.bei, dauer: Math.max(0.1, info?.dauer || 1.5), lautstaerke: e.lautstaerke ?? 1 })
    }
  }
  return { einblendungen, toene }
}
