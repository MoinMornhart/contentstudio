// Herkunft: MoinStudio src/main/schnitt/bib-ordner.ts (MIT, v0.56.0).
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import { dateiAufDiesemGeraet } from './projekt'
import { bibOrdner, dateiInBibliothek, speichereBibEffekt, STANDARD_CHROMA, type BibEffekt } from './bibliothek'
import { dauerVon, keyFarbeErkennen } from './chroma'

/**
 * Effekt-Ordner: ganze Ordner beobachten – jede neue Datei darin wird automatisch zum Effekt (Name = Dateiname, Art
 * erkannt: Greenscreen, Video mit Transparenz, normales Video, Bild, Sound), und in der App erscheint ein Fenster zum
 * Einrichten. Die beobachteten Ordner und welche Dateien schon übernommen sind, stehen in <Daten>/effekte/ordner.json –
 * alle Geräte teilen sie. Neue Effekte stehen auf „nur manuell“, damit nichts ungefragt in Videos landet.
 */

export const ENDUNGEN = {
  video: ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.gif'],
  bild: ['.png', '.jpg', '.jpeg', '.webp'],
  sound: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']
} as const

export type ErkannteArt = 'transparenz' | 'greenscreen' | 'video' | 'bild' | 'sound'

const Daten = z.object({
  ordner: z.array(z.string()).default([]),
  /** Schlüssel „Dateiname|Größe“ (gleich auf jedem Gerät) → Effekt-ID */
  bekannt: z.record(z.string(), z.string()).default({})
})
type OrdnerDaten = z.infer<typeof Daten>

const datei = (daten: string): string => join(bibOrdner(daten), 'ordner.json')

export async function ladeOrdner(daten: string): Promise<OrdnerDaten> {
  const r = await readJson(datei(daten), Daten)
  return r.ok ? r.value : { ordner: [], bekannt: {} }
}

async function speichere(daten: string, d: OrdnerDaten): Promise<void> {
  await writeJsonAtomic(datei(daten), d)
}

export async function ordnerHinzu(daten: string, pfad: string): Promise<OrdnerDaten> {
  const d = await ladeOrdner(daten)
  if (!d.ordner.some((o) => o.toLowerCase() === pfad.toLowerCase())) d.ordner.push(pfad)
  await speichere(daten, d)
  return d
}

export async function ordnerEntfernen(daten: string, pfad: string): Promise<OrdnerDaten> {
  const d = await ladeOrdner(daten)
  d.ordner = d.ordner.filter((o) => o.toLowerCase() !== pfad.toLowerCase())
  await speichere(daten, d)
  return d
}

export const schluessel = (name: string, groesse: number): string => `${name.toLowerCase()}|${groesse}`

export function rolleVon(name: string): 'video' | 'bild' | 'sound' | null {
  const e = extname(name).toLowerCase()
  for (const [rolle, liste] of Object.entries(ENDUNGEN)) if ((liste as readonly string[]).includes(e)) return rolle as 'video' | 'bild' | 'sound'
  return null
}

/** Aus der FFmpeg-Ausgabe: Alphakanal (yuva…/rgba/argb/bgra, WebM alpha_mode=1) und Ton */
export function streamInfo(ffmpegAusgabe: string): { alpha: boolean; ton: boolean } {
  const video = ffmpegAusgabe
    .split(/\r?\n/)
    .filter((z) => /Stream #.*Video:/.test(z))
    .join('\n')
  const alpha = /\b(yuva\w*|rgba\w*|argb|bgra|abgr|gbrap\w*|ya8|ya16\w*)\b/i.test(video) || /alpha_mode\s*:\s*1/i.test(ffmpegAusgabe)
  return { alpha, ton: /Stream #.*Audio:/.test(ffmpegAusgabe) }
}

function ffmpegInfo(ffmpeg: string, pfad: string): Promise<string> {
  return new Promise((resolve) => execFile(ffmpeg, ['-hide_banner', '-i', pfad], { windowsHide: true, timeout: 30_000 }, (_e, _o, stderr) => resolve(String(stderr))))
}

/** Erkennt die Art einer Datei: Transparenz, Greenscreen (mit Key-Farbe), normales Video, Bild oder Sound */
export async function erkenneArt(ffmpeg: string, pfad: string): Promise<{ art: ErkannteArt; ton: boolean; farbe: string | null }> {
  const rolle = rolleVon(pfad)
  if (rolle === 'sound') return { art: 'sound', ton: true, farbe: null }
  const info = streamInfo(await ffmpegInfo(ffmpeg, pfad))
  if (info.alpha) return { art: rolle === 'bild' ? 'bild' : 'transparenz', ton: info.ton, farbe: null }
  if (rolle === 'bild') return { art: 'bild', ton: false, farbe: null }
  const farbe = await keyFarbeErkennen(ffmpeg, pfad).catch(() => null)
  return farbe ? { art: 'greenscreen', ton: info.ton, farbe } : { art: 'video', ton: info.ton, farbe: null }
}

/** Datei fertig kopiert? Größe bleibt zwei Sekunden gleich (große Animationen kommen per Cloud Stück für Stück) */
async function ruhig(pfad: string, warte = 2000): Promise<number | null> {
  const a = (await stat(pfad).catch(() => null))?.size ?? 0
  await new Promise((r) => setTimeout(r, warte))
  const b = (await stat(pfad).catch(() => null))?.size ?? 0
  return a > 0 && a === b ? b : null
}

export interface NeuerEffekt {
  effekt: BibEffekt
  art: ErkannteArt
  quelle: string
}

/** Durchsucht alle beobachteten Ordner (auch Unterordner) und legt für neue Dateien Effekte an. */
export async function pruefeOrdner(daten: string, ffmpeg: string, warte = 2000): Promise<NeuerEffekt[]> {
  const d = await ladeOrdner(daten)
  const neu: NeuerEffekt[] = []
  for (const roh of d.ordner) {
    // Pfad vom anderen Gerät (anderer Windows-Benutzer) auf dieses übertragen
    const ordner = dateiAufDiesemGeraet(roh)
    if (!existsSync(ordner)) continue
    const eintraege = await readdir(ordner, { recursive: true, withFileTypes: true }).catch(() => [])
    for (const e of eintraege) {
      if (!e.isFile() || !rolleVon(e.name) || e.name.startsWith('.') || e.name.endsWith('.teil')) continue
      const pfad = join(e.parentPath ?? ordner, e.name)
      const groesse = (await stat(pfad).catch(() => null))?.size ?? 0
      if (!groesse || (await ladeOrdner(daten)).bekannt[schluessel(e.name, groesse)]) continue
      if ((await ruhig(pfad, warte)) !== groesse) continue
      const effekt = await alsEffekt(daten, ffmpeg, pfad)
      if (!effekt) continue
      const aktuell = await ladeOrdner(daten)
      aktuell.bekannt[schluessel(e.name, groesse)] = effekt.effekt.id
      await speichere(daten, aktuell)
      neu.push(effekt)
    }
  }
  return neu
}

/** Legt aus einer Datei einen Effekt an: Name = Dateiname, Art erkannt, „nur manuell“ bis der Creator ihn einrichtet */
export async function alsEffekt(daten: string, ffmpeg: string, pfad: string): Promise<NeuerEffekt | null> {
  const rolle = rolleVon(pfad)
  if (!rolle) return null
  const { art, ton, farbe } = await erkenneArt(ffmpeg, pfad)
  const id = randomUUID().slice(0, 8)
  const kopie = await dateiInBibliothek(daten, id, rolle, pfad)
  const dauer = rolle === 'bild' ? 0 : await dauerVon(ffmpeg, join(bibOrdner(daten), id, kopie)).catch(() => 0)
  const name = basename(pfad, extname(pfad)).replace(/_+/g, ' ').trim().slice(0, 60) || 'Effekt'
  const teil: Partial<BibEffekt> = {
    id,
    name,
    haeufigkeit: { modus: 'manuell' },
    ...(rolle === 'video' ? { video: { datei: kopie, greenscreen: art === 'greenscreen', ton, dauer }, lage: art === 'video' ? 'voll' : 'unten-rechts', groesse: art === 'video' ? 1 : 0.35 } : {}),
    ...(rolle === 'bild' ? { bild: { datei: kopie, dauer: 3 } } : {}),
    ...(rolle === 'sound' ? { sound: { datei: kopie, lautstaerke: 1, dauer } } : {}),
    ...(art === 'greenscreen' ? { chroma: { ...STANDARD_CHROMA, farbe: farbe ?? STANDARD_CHROMA.farbe } } : {})
  }
  const effekt = await speichereBibEffekt(daten, teil)
  return { effekt, art, quelle: pfad }
}

/**
 * Beobachtet die Ordner (fs.watch, rekursiv) und prüft zusätzlich jede Minute – Änderungen vom anderen Gerät kommen über
 * Cloud-Ordner nicht immer als Ereignis an. Gibt eine Stopp-Funktion zurück.
 */
export function beobachteOrdner(daten: () => Promise<string>, ffmpeg: () => Promise<string | null>, melde: (neu: NeuerEffekt[]) => void): () => void {
  let waechter: FSWatcher[] = []
  let laeuft = false
  let nochmal = false
  let timer: NodeJS.Timeout | undefined
  let bisher = ''
  const neuBeobachten = async (d: string): Promise<void> => {
    const liste = (await ladeOrdner(d)).ordner.map((o) => dateiAufDiesemGeraet(o)).filter((o) => existsSync(o))
    const schl = liste.join('|')
    if (schl === bisher) return
    bisher = schl
    waechter.forEach((w) => w.close())
    waechter = liste.flatMap((o) => {
      try {
        const w = watch(o, { recursive: true }, (_art, name) => {
          if (name && rolleVon(String(name))) spaeter()
        })
        w.on('error', () => undefined)
        return [w]
      } catch {
        return []
      }
    })
  }
  const pruefe = async (): Promise<void> => {
    if (laeuft) {
      nochmal = true
      return
    }
    laeuft = true
    try {
      const ff = await ffmpeg()
      const d = await daten()
      if (ff) {
        const neu = await pruefeOrdner(d, ff)
        if (neu.length) melde(neu)
      }
      await neuBeobachten(d)
    } catch (err) {
      console.error('Effekt-Ordner', err)
    } finally {
      laeuft = false
      if (nochmal) {
        nochmal = false
        void pruefe()
      }
    }
  }
  const spaeter = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => void pruefe(), 2500)
  }
  const intervall = setInterval(() => void pruefe(), 60_000)
  const erst = setTimeout(() => void pruefe(), 5000)
  return () => {
    clearInterval(intervall)
    clearTimeout(timer)
    clearTimeout(erst)
    waechter.forEach((w) => w.close())
  }
}
