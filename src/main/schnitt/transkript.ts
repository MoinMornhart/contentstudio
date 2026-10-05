// Herkunft: MoinStudio src/main/schnitt/transkript.ts (MIT), erweitert um Sprache und Fachbegriffe des Kontos.
import { spawn } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WhisperChoice } from '@shared/hardware'
import type { JobContext } from '../jobs/queue'
import { sicherePakete, sichereUmgebung } from '../python'
import { aendereProjekt, ladeProjekt, projektOrdner } from './projekt'
import { t } from '../i18n'

/**
 * Transkript lokal (ROADMAP 5.1) mit faster-whisper: kostenlos, ohne Cloud, auf jeder Hardware (CUDA wenn möglich,
 * sonst CPU). Abschnitte landen laufend in transkript.jsonl – nach Pause oder Neustart geht es dort weiter.
 * Beim ersten Einsatz wird die Geschwindigkeit gemessen: ist das Modell langsamer als Echtzeit, nimmt ContentStudio
 * beim nächsten Mal das nächstkleinere.
 */

export interface TranskriptPayload {
  daten: string
  projekt: string
  ffmpeg: string
  uv: string
  pyDir: string
  skript: string
  whisper: WhisperChoice
  /** Ablage der Whisper-Modelle und der Messung (lokaler Programmordner, nicht der Datenordner) */
  lokal: string
  /** Sprache des Kontos (ISO 639-1) oder „auto“ */
  sprache: string
  /** Fachbegriffe des Kanals (Spiele, Richtungen, Kanalname), damit Whisper sie richtig schreibt */
  begriffe: string
}

export interface Abschnitt {
  start: number
  ende: number
  text: string
  woerter: { start: number; ende: number; wort: string; p: number }[]
}

export interface Messung {
  modell: string
  geraet: string
  /** Rechenzeit ÷ Videolänge; < 1 = schneller als Echtzeit */
  faktor: number
}

const KLEINER: Record<string, WhisperChoice['model'] | undefined> = { 'large-v3-turbo': 'medium', medium: 'small', small: 'base' }

/** Modellwahl: Hardware-Profil, korrigiert durch die Messung beim ersten Einsatz. */
export function whisperWahl(profil: WhisperChoice, messung: Messung | null): WhisperChoice {
  if (!messung || messung.modell !== profil.model || messung.geraet !== profil.device || messung.faktor <= 1) return profil
  const kleiner = KLEINER[profil.model]
  return kleiner ? { ...profil, model: kleiner } : profil
}

export function liesAbschnitte(jsonl: string): Abschnitt[] {
  return jsonl
    .split(/\r?\n/)
    .filter((z) => z.trim())
    .map((z) => JSON.parse(z) as Abschnitt)
}

/**
 * Sätze für die KI: Whisper liefert manchmal einen einzigen Abschnitt über 40 s (Freiform-Lauf 05.10.: „Zensier das Wort
 * Brot“ traf 4 s daneben, weil die KI nur „0–41 s: …“ sah). Lange Abschnitte werden mit den Wortzeiten an Satzenden,
 * Pausen ab 0,6 s und spätestens nach 25 Wörtern geteilt; kurze bleiben, wie sie sind.
 */
export function kiSaetze(abschnitte: Abschnitt[]): { start: number; ende: number; text: string }[] {
  const aus: { start: number; ende: number; text: string }[] = []
  for (const a of abschnitte) {
    const w = a.woerter ?? []
    if (a.ende - a.start <= 8 || w.length < 2) {
      aus.push({ start: a.start, ende: a.ende, text: a.text })
      continue
    }
    let teil: typeof w = []
    const abschliessen = (): void => {
      if (!teil.length) return
      aus.push({ start: teil[0]!.start, ende: teil[teil.length - 1]!.ende, text: teil.map((x) => x.wort.trim()).join(' ') })
      teil = []
    }
    w.forEach((x, i) => {
      teil.push(x)
      const naechstes = w[i + 1]
      const satzende = /[.!?…]["“”»]?$/.test(x.wort.trim())
      const pause = naechstes ? naechstes.start - x.ende >= 0.6 : false
      if (satzende || pause || teil.length >= 25) abschliessen()
    })
    abschliessen()
  }
  return aus
}

/** CUDA-Bibliotheken (cuBLAS, cuDNN) aus den nvidia-Paketen auf den Suchpfad legen. */
async function cudaPfade(pyDir: string): Promise<string[]> {
  const basis = join(pyDir, 'Lib', 'site-packages', 'nvidia')
  const teile = await readdir(basis).catch(() => [] as string[])
  return teile.map((t) => join(basis, t, 'bin'))
}

export async function transkriptJob(p: TranskriptPayload, ctx: JobContext<unknown>): Promise<{ projekt: string; abschnitte: number }> {
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr?.quelle?.dauer) throw new Error(t('schnitt.fehler.nichtImportiert'))
  const dauer = pr.quelle.dauer
  const ordner = projektOrdner(p.daten, p.projekt)
  const messDatei = join(p.lokal, 'whisper-messung.json')
  const messung = JSON.parse(await readFile(messDatei, 'utf8').catch(() => 'null')) as Messung | null
  const wahl = whisperWahl(p.whisper, messung)

  const python = await sichereUmgebung(p.uv, p.pyDir, ctx)
  await sicherePakete(p.uv, python, 'faster_whisper', ['faster-whisper'], ctx, t('schnitt.schritt.whisperEinrichten'))
  let env: NodeJS.ProcessEnv = { ...process.env, HF_HUB_DISABLE_SYMLINKS_WARNING: '1' }
  if (wahl.device === 'cuda') {
    await sicherePakete(p.uv, python, 'nvidia.cublas, nvidia.cudnn', ['nvidia-cublas-cu12', 'nvidia-cudnn-cu12==9.*'], ctx, t('schnitt.schritt.whisperCuda')).catch(() => undefined)
    env = { ...env, PATH: [...(await cudaPfade(p.pyDir)), process.env['PATH'] ?? ''].join(';') }
  }

  ctx.progress(1, t('schnitt.schritt.transkriptStart', { modell: wahl.model, geraet: t(wahl.device === 'cuda' ? 'schnitt.geraet.gpu' : 'schnitt.geraet.cpu') }))
  const ziel = join(ordner, 'transkript.jsonl')
  const beginn = Date.now()
  let rechenzeit = 0
  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, [p.skript, pr.quelle!.pfad, ziel, wahl.model, wahl.device, wahl.compute, p.ffmpeg, String(dauer), `--modelle=${join(p.lokal, 'py', 'modelle', 'whisper')}`, `--sprache=${p.sprache || 'auto'}`, `--begriffe=${p.begriffe}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    ctx.track(child)
    let fehler = ''
    child.stdout.on('data', (d: Buffer) => {
      for (const zeile of d.toString().split(/\r?\n/)) {
        const f = /^CS_FORTSCHRITT ([\d.]+)/.exec(zeile)
        if (f) ctx.progress(Math.min(99, 2 + (Number(f[1]) / dauer) * 97), t('schnitt.schritt.transkript', { prozent: Math.round((Number(f[1]) / dauer) * 100), modell: wahl.model }))
        const e = /^CS_FERTIG ([\d.]+) ([\d.]+)/.exec(zeile)
        if (e) rechenzeit = Number(e[2])
      }
    })
    child.stderr.on('data', (d: Buffer) => (fehler = (fehler + d.toString()).slice(-4000)))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(t('schnitt.fehler.transkript', { grund: fehler.trim().split(/\r?\n/).slice(-1)[0] ?? '' })))))
  })
  // Messung beim ersten Einsatz (nur wenn das Video lang genug für eine sinnvolle Aussage ist)
  if (!messung && dauer >= 30) {
    await writeFile(messDatei, JSON.stringify({ modell: wahl.model, geraet: wahl.device, faktor: Math.round(((rechenzeit || (Date.now() - beginn) / 1000) / dauer) * 100) / 100 } satisfies Messung))
  }
  const abschnitte = liesAbschnitte(await readFile(ziel, 'utf8'))
  await aendereProjekt(p.daten, p.projekt, () => ({ transkript: true, transkriptModell: wahl.model }))
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { projekt: p.projekt, abschnitte: abschnitte.length }
}
