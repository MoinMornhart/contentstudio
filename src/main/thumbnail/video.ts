// Herkunft: MoinStudio src/main/thumbnail/video.ts (MIT), auf die KI-Schicht umgestellt und um lokale Momente ergänzt.
import { spawn } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { VideoErgebnis } from '@shared/thumbnail'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { sprachName } from './job'

/**
 * Aus dem Video (ROADMAP 4.9): FFmpeg findet lokal starke Momente (Szenenwechsel über das ganze Video) und zieht
 * Standbilder – die taugen auch als Hintergrund für Foto-Thumbnails. Mit Bild-KI kommen Bildbögen dazu, aus denen die
 * KI Inhalt, Höhepunkte und passende Thumbnail-Ideen ableitet. Jede Idee lässt sich als Auftrag starten.
 */

export interface VideoPayload {
  video: string
  ffmpeg: string
  ausgabe: string
  kanal: { name: string; richtungen: string[]; sprache: string }
  titel: string | null
  /** Namen der Freunde aus dem Profil, damit die KI sie zuordnen kann */
  freunde: string[]
  sprache: string
}

function ffmpeg(exe: string, args: string[], ctx: JobContext<unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-hide_banner', '-y', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    ctx.track(child)
    let out = ''
    child.stderr.on('data', (d: Buffer) => (out = (out + d.toString()).slice(-400_000)))
    child.stdout.on('data', (d: Buffer) => (out = (out + d.toString()).slice(-400_000)))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`FFmpeg ${code}: ${out.trim().split(/\r?\n/).slice(-1)[0]}`))))
  })
}

/** Länge in Sekunden aus der FFmpeg-Ausgabe („Duration: 00:12:34.56“) */
export function dauerAus(text: string): number | null {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

export function zeit(sek: number): string {
  const h = Math.floor(sek / 3600)
  const m = Math.floor((sek % 3600) / 60)
  const s = String(Math.floor(sek % 60)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Szenenwechsel aus der showinfo-Ausgabe (Zeit und Stärke) */
export function szenenAus(text: string): { zeit: number; staerke: number }[] {
  const out: { zeit: number; staerke: number }[] = []
  const re = /pts_time:([\d.]+)[\s\S]*?lavfi\.scene_score=([\d.]+)/g
  for (const m of text.matchAll(re)) out.push({ zeit: Number(m[1]), staerke: Number(m[2]) })
  if (out.length) return out
  for (const m of text.matchAll(/pts_time:([\d.]+)/g)) out.push({ zeit: Number(m[1]), staerke: 0.5 })
  return out
}

/** Bis zu `n` starke Momente, gleichmäßig über das Video verteilt (je Abschnitt der stärkste Wechsel) */
export function waehleMomente(szenen: { zeit: number; staerke: number }[], dauer: number, n = 8): { zeit: number; grund: 'szene' | 'gleichmaessig' }[] {
  const out: { zeit: number; grund: 'szene' | 'gleichmaessig' }[] = []
  for (let i = 0; i < n; i++) {
    const von = (dauer * i) / n
    const bis = (dauer * (i + 1)) / n
    const kandidaten = szenen.filter((s) => s.zeit >= von && s.zeit < bis)
    if (kandidaten.length) {
      const best = kandidaten.reduce((a, b) => (b.staerke > a.staerke ? b : a))
      // kurz nach dem Wechsel: das neue Bild steht dann schon ruhig
      out.push({ zeit: Math.min(dauer - 0.1, best.zeit + 0.6), grund: 'szene' })
    } else out.push({ zeit: (von + bis) / 2, grund: 'gleichmaessig' })
  }
  return out
}

const IdeenZ = z.object({
  inhalt: z.string(),
  ideen: z.array(z.object({ beschreibung: z.string(), warum: z.string(), zeitpunkt: z.string().optional(), freunde: z.array(z.string()).optional() })).min(1).max(5)
})

export async function videoJob(p: VideoPayload, ctx: JobContext<unknown>, d: { ki: KiSchicht | null }): Promise<VideoErgebnis & { standbilder: string[] }> {
  await mkdir(p.ausgabe, { recursive: true })
  ctx.progress(5, t('thumb.video.ansehen'))
  const info = await ffmpeg(p.ffmpeg, ['-i', p.video, '-f', 'null', '-t', '0.1', '-'], ctx).catch((e: Error) => e.message)
  const dauer = dauerAus(info) ?? 600

  // Szenenwechsel: auf kleinem Bild und mit wenigen Bildern je Sekunde (schnell auf jedem Rechner)
  ctx.progress(15, t('thumb.video.szenen'))
  const szenenText = await ffmpeg(p.ffmpeg, ['-i', p.video, '-an', '-vf', "fps=2,scale=320:-2,select='gt(scene,0.3)',metadata=print,showinfo", '-f', 'null', '-'], ctx).catch(() => '')
  const momente = waehleMomente(szenenAus(szenenText), dauer)
  await ctx.yield()

  ctx.progress(45, t('thumb.video.standbilder', { anzahl: momente.length }))
  const standbilder: string[] = []
  for (const [i, m] of momente.entries()) {
    const ziel = join(p.ausgabe, `moment-${i + 1}.jpg`)
    await ffmpeg(p.ffmpeg, ['-ss', m.zeit.toFixed(2), '-i', p.video, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', ziel], ctx).catch(() => undefined)
    standbilder.push(ziel)
  }
  const vorhanden = new Set(await readdir(p.ausgabe))

  // Ideen nur mit Bild-KI (sieht Bildbögen mit Zeitstempeln)
  let inhalt = ''
  let ideen: VideoErgebnis['ideen'] = []
  const mitKi = !!d.ki && (await d.ki.verfuegbar(true))
  if (mitKi && d.ki) {
    ctx.progress(60, t('thumb.video.boegen'))
    const intervall = Math.max(1, dauer / 32)
    await ffmpeg(p.ffmpeg, ['-i', p.video, '-vf', `fps=1/${intervall.toFixed(3)},scale=480:-2,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,tile=4x2`, '-frames:v', '4', join(p.ausgabe, 'bogen-%d.jpg')], ctx).catch(async () => {
      await ffmpeg(p.ffmpeg, ['-i', p.video, '-vf', `fps=1/${intervall.toFixed(3)},scale=480:-2,tile=4x2`, '-frames:v', '4', join(p.ausgabe, 'bogen-%d.jpg')], ctx)
    })
    const boegen = (await readdir(p.ausgabe)).filter((f) => /^bogen-\d+\.jpg$/.test(f)).map((f) => join(p.ausgabe, f))
    ctx.progress(75, t('thumb.video.ideen'))
    const e = await d.ki.frage(
      {
        name: 'video-ideen',
        system: 'You watch contact sheets of a video and propose strong thumbnail ideas.',
        prompt: `Standbilder aus einem Video des Kanals ${p.kanal.name} (Richtungen: ${p.kanal.richtungen.join(', ') || '–'}), je Bogen 8 Bilder in zeitlicher Reihenfolge, Zeit oben links.${p.titel ? ` Geplanter Titel: „${p.titel}“.` : ''}${p.freunde.length ? ` Freunde, die vorkommen können: ${p.freunde.join(', ')}.` : ''}
1. inhalt: worum es geht (Ort, Personen, Höhepunkte, Stimmung).
2. ideen: 3 verschiedene Thumbnail-Ideen mit dem stärksten Moment. Jede Idee ist eine kurze Beschreibung in den Worten des Creators, warum sie passt, der Zeitpunkt (mm:ss) und welche Freunde (nur aus der Liste) dabei sein sollen.
Schreibe auf ${sprachName(p.sprache)}.`,
        bilder: boegen,
        schema: IdeenZ,
        brauchtBilder: true,
        stufe: 'stark',
        maxAusgabe: 2000
      },
      ctx
    )
    inhalt = e.daten.inhalt
    ideen = e.daten.ideen.map((x) => ({ beschreibung: x.beschreibung, warum: x.warum, zeitpunkt: x.zeitpunkt ?? null, freunde: (x.freunde ?? []).filter((f) => p.freunde.includes(f)) }))
  }
  ctx.progress(100, t('jobs.schritt.fertig'))
  return {
    inhalt,
    momente: momente.map((m, i) => ({ zeit: m.zeit, grund: m.grund === 'szene' ? t('thumb.video.grundSzene', { zeit: zeit(m.zeit) }) : t('thumb.video.grundGleich', { zeit: zeit(m.zeit) }), bild: vorhanden.has(`moment-${i + 1}.jpg`) ? join(p.ausgabe, `moment-${i + 1}.jpg`) : null })),
    ideen,
    mitKi,
    standbilder
  }
}
