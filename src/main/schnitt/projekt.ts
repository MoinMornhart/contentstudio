// Herkunft: MoinStudio src/main/schnitt/projekt.ts (MIT), erweitert um Konto, Richtung, Spuren und Format.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { writeJsonAtomic } from '../data/jsonfile'
import { liesMitKonfliktkopien } from '../data/jsonfile'
import type { Plattform } from '@shared/profil'
import type { SchnittEinstellungen, SchnittSpur } from '@shared/schnitt'

/**
 * Schnitt-Projekte (ROADMAP 5.1). Ablage: <Datenordner>/schnitt/<id>/projekt.json plus Proxy, Wellenform und
 * Standbild-Leiste. Das Rohvideo bleibt, wo es liegt – im Projekt stehen nur Pfad, Größe und Prüfsumme.
 */

export interface QuellInfo {
  pfad: string
  groesse: number
  /** Schnelle Prüfsumme: SHA-256 über Größe, erste und letzte 4 MB (erkennt vertauschte oder geänderte Dateien) */
  pruefsumme: string
  dauer: number
  breite: number
  hoehe: number
  fps: number
  audio: boolean
}

export interface Projekt {
  id: string
  name: string
  /** Konto im Creator-Profil; Name, Plattform, Sprache und Richtung stammen von dort */
  kontoId: string
  kanal: string
  plattform: Plattform
  sprache: string
  /** Stil-Richtung für Tempo, Schnitthärte, Untertitel und Effekt-Dichte (ROADMAP 5.3) */
  richtung: string
  erstellt: string
  quelle: QuellInfo | null
  /** Weitere Spuren: Facecam, Gameplay, getrennter Ton (ROADMAP 5.6) */
  spuren?: SchnittSpur[]
  /** Arbeitsschritte, die schon fertig sind */
  proxy: boolean
  wellenform: boolean
  leiste: boolean
  transkript?: boolean
  transkriptModell?: string
  rohschnitt?: boolean
  /** Untertitel, Zooms und Format */
  einstellungen?: Partial<SchnittEinstellungen>
  /** Zeitpunkt der letzten geschnittenen Vorschau */
  vorschau?: number
  /** Zeitpunkt des letzten Exports (ROADMAP 6.7) */
  export?: number
  /** Stream-Highlights (ROADMAP 6.8): Anzahl gefundener Höhepunkte, Facecam-Bereich (null = keine), letzter Clip-Export */
  highlights?: number
  facecam?: [number, number, number, number] | null
  clips?: number
  /** Aufträge am Projekt (Import, Transkript …) in Reihenfolge; die Oberfläche zeigt den ersten, der noch läuft */
  auftraege?: string[]
  /** Antwort der KI auf den letzten Wunsch */
  antwort?: { wunsch: string; text: string; zeit: string }
  fehler?: string | null
  /** Effekt-Bibliothek: ist dieses Projekt für „nur in manchen Videos“ dran? (je Effekt-ID, einmal entschieden) */
  bibEntscheid?: Record<string, boolean>
  /** Vom Creator gewählter Titel (Namensvorschlag): steht im Export und auf der Planungskarte vorn */
  titelGewaehlt?: string
}

export const projektOrdner = (daten: string, id: string): string => join(daten, 'schnitt', id)

export async function ladeProjekt(daten: string, id: string): Promise<Projekt | null> {
  let p: Projekt
  try {
    p = JSON.parse(await liesMitKonfliktkopien(join(projektOrdner(daten, id), 'projekt.json'))) as Projekt
  } catch {
    return null
  }
  // Rohvideo auf diesem Gerät: Pfade eines anderen Geräts (anderer Windows-Benutzer, Cloud-Ordner) übertragen
  if (p.quelle?.pfad) p.quelle = { ...p.quelle, pfad: dateiAufDiesemGeraet(p.quelle.pfad, { ordner: projektOrdner(daten, id), groesse: p.quelle.groesse }) }
  return mitDateistand(p, projektOrdner(daten, id))
}

/**
 * Stand aus den Dateien (aus MoinStudio v0.54.0): Was schon fertig im Projektordner liegt – z. B. vom anderen Gerät oder
 * nach einem Cloud-Konflikt, bei dem projekt.json einen älteren Stand hatte –, gilt als fertig; was als fertig markiert
 * ist, aber fehlt, nicht mehr. Dateien, die Stück für Stück entstehen (Proxy, Vorschau), zählen erst, wenn sie eine
 * Minute ruhen oder schon als fertig vermerkt sind. Ändert nur die geladene Fassung, nie die Datei.
 */
export function mitDateistand(p: Projekt, ordner: string, jetzt = Date.now()): Projekt {
  const info = (n: string): { groesse: number; zeit: number } => {
    try {
      const s = statSync(join(ordner, n))
      return { groesse: s.size, zeit: Math.round(s.mtimeMs) }
    } catch {
      return { groesse: 0, zeit: 0 }
    }
  }
  const da = (n: string): boolean => info(n).groesse > 0
  const ruht = (n: string): boolean => da(n) && jetzt - info(n).zeit > 60_000
  const neu: Projekt = { ...p }
  if (ruht('proxy.mp4')) neu.proxy = true
  if (da('wellenform.json')) neu.wellenform = true
  if (da('leiste.jpg')) neu.leiste = true
  if (da('schnitt.json')) neu.rohschnitt = true
  else delete neu.rohschnitt
  if (da('transkript.jsonl') && (neu.rohschnitt || p.transkript)) neu.transkript = true
  else if (!da('transkript.jsonl')) delete neu.transkript
  if (da('vorschau.mp4') && (p.vorschau || ruht('vorschau.mp4'))) neu.vorschau = p.vorschau ?? info('vorschau.mp4').zeit
  else delete neu.vorschau
  if ((da('export.mp4') || da('export.m4a')) && da('export.json')) neu.export = p.export ?? info('export.json').zeit
  else delete neu.export
  return neu
}

/** Ordner, die auf jedem Gerät unter dem eigenen Benutzer liegen (der Teil hinter „C:\Users\<Name>\“ bleibt gleich) */
const GETEILT = /^[a-z]:[\\/]users[\\/][^\\/]+[\\/](.+)$/i

/**
 * Findet eine Datei, deren Pfad auf einem anderen Gerät gespeichert wurde (aus MoinStudio v0.48.3: Video auf dem
 * Laptop unter C:\Users\<Laptop-Name>\iCloudDrive\… importiert, auf dem PC heißt der Benutzer anders). Reihenfolge:
 * 1. der Pfad selbst, 2. derselbe Teil unter dem Benutzerordner dieses Geräts (iCloud, OneDrive, Dropbox, Videos,
 * Desktop …), 3. eine Kopie im Projektordner (quelle/video.*), 4. eine gleichnamige Datei im Projektordner. Gibt es
 * nichts davon, bleibt der alte Pfad (die Fehlermeldung nennt ihn dann). Mit `groesse` muss die Dateigröße passen.
 */
export function dateiAufDiesemGeraet(pfad: string, o: { ordner?: string; groesse?: number; heim?: string } = {}): string {
  const passt = (f: string): boolean => {
    if (!existsSync(f)) return false
    if (!o.groesse) return true
    try {
      return statSync(f).size === o.groesse
    } catch {
      return false
    }
  }
  if (passt(pfad)) return pfad
  const rest = GETEILT.exec(pfad)?.[1]
  if (rest) {
    const hier = join(o.heim ?? homedir(), ...rest.split(/[\\/]/))
    if (passt(hier)) return hier
  }
  if (o.ordner) {
    const kopie = join(o.ordner, 'quelle', `video${extname(pfad).toLowerCase() || '.mp4'}`)
    if (passt(kopie)) return kopie
    const gleich = join(o.ordner, basename(pfad.replace(/\\/g, '/')))
    if (passt(gleich)) return gleich
  }
  return pfad
}

export async function speichereProjekt(daten: string, p: Projekt): Promise<void> {
  await mkdir(projektOrdner(daten, p.id), { recursive: true })
  await writeJsonAtomic(join(projektOrdner(daten, p.id), 'projekt.json'), p)
}

const sperren = new Map<string, Promise<unknown>>()

/**
 * Projekt ändern – nacheinander je Projekt und immer auf dem aktuellen Stand der Datei. Import, Transkript und die
 * Oberfläche schreiben gleichzeitig; ohne Sperre überschreibt ein alter Stand frische Daten (z. B. die Videolänge).
 */
export function aendereProjekt(daten: string, id: string, aenderung: (p: Projekt) => Partial<Projekt>): Promise<Projekt | null> {
  const vorher = sperren.get(id) ?? Promise.resolve()
  const jetzt = vorher.then(async () => {
    const p = await ladeProjekt(daten, id)
    if (!p) return null
    const neu = { ...p, ...aenderung(p) }
    await speichereProjekt(daten, neu)
    return neu
  })
  sperren.set(id, jetzt.catch(() => undefined))
  return jetzt
}

export async function ladeProjekte(daten: string): Promise<Projekt[]> {
  const namen = await readdir(join(daten, 'schnitt')).catch(() => [] as string[])
  const alle = await Promise.all(namen.map((n) => ladeProjekt(daten, n)))
  return alle.filter((p): p is Projekt => !!p).sort((a, b) => b.erstellt.localeCompare(a.erstellt))
}

export async function loescheProjekt(daten: string, id: string): Promise<void> {
  if (!/^[a-z0-9-]+$/i.test(id)) return
  await rm(projektOrdner(daten, id), { recursive: true, force: true })
}

/** Schnelle Prüfsumme großer Videos (Stunden-Streams): Größe + erste und letzte 4 MB. */
export async function schnellePruefsumme(pfad: string): Promise<{ groesse: number; pruefsumme: string }> {
  const { size } = await stat(pfad)
  const h = createHash('sha256').update(String(size))
  const stueck = 4 * 1024 * 1024
  const lies = (start: number, ende: number): Promise<void> =>
    new Promise((res, rej) => {
      createReadStream(pfad, { start, end: ende })
        .on('data', (d) => h.update(d))
        .on('end', () => res())
        .on('error', rej)
    })
  await lies(0, Math.min(size, stueck) - 1)
  if (size > stueck * 2) await lies(size - stueck, size - 1)
  return { groesse: size, pruefsumme: h.digest('hex').slice(0, 32) }
}

/** ffprobe-JSON → Videodaten */
export function quellInfoAus(probe: { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[] }): Pick<QuellInfo, 'dauer' | 'breite' | 'hoehe' | 'fps' | 'audio'> {
  const video = probe.streams?.find((s) => s.codec_type === 'video')
  const rate = (video?.avg_frame_rate && video.avg_frame_rate !== '0/0' ? video.avg_frame_rate : video?.r_frame_rate) ?? '0/1'
  const [z, n] = rate.split('/').map(Number)
  return {
    dauer: Number(probe.format?.duration ?? 0),
    breite: video?.width ?? 0,
    hoehe: video?.height ?? 0,
    fps: n ? Math.round(((z ?? 0) / n) * 100) / 100 : 0,
    audio: !!probe.streams?.some((s) => s.codec_type === 'audio')
  }
}
