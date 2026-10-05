// Herkunft: MoinStudio src/main/animation/sting.ts (MIT), v0.45.0 – für Minecraft-Konten mit Skin.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { blenderEnv } from '../hardware/mesa'
import type { StingVorlage } from '../schnitt/effekte'

/**
 * Skin-Sting: 1–4 s Intro mit der Minecraft-Figur des Creators, gerendert von Blender (blender/render_animation.py) und als
 * Video mit Alphakanal über den Intro-Hintergrund gelegt. Recherche: erst der stärkste Moment (Cold Open), dann ein
 * kurzer Skin-Moment – nie ein langes Branding-Intro. Vorlagen statt fester Clips: Pose, Kamera und Timing kommen aus
 * den Thumbnail-Posen und skalieren mit der Dauer.
 */

export interface StingFigur {
  skin: string
  slim?: boolean | null
}

type Schluessel = { zeit: number; pose: string; position: number[]; blick: number; mimik?: string; posen_korrektur?: Record<string, unknown> }
type Kamera = { zeit: number; position: number[]; ziel: number[]; linse: number }

/** Animation (JSON für render_animation.py) für eine Vorlage – Zeiten als Anteil der Dauer */
export function stingAnimation(vorlage: StingVorlage, figur: StingFigur, o: { dauer: number; breite: number; hoehe: number; fps: number; samples: number; geraet: string }): Record<string, unknown> {
  const d = o.dauer
  const t = (anteil: number): number => Math.round(anteil * d * 1000) / 1000
  // eng gerahmt: Kopf und Oberkörper füllen das Bild wie bei den Vorbildern
  const nah: Kamera = { zeit: t(1), position: [0.9, -3.4, 1.75], ziel: [0, 0, 1.55], linse: 32 }
  let schluessel: Schluessel[]
  let kamera: Kamera[]
  if (vorlage === 'winken') {
    schluessel = [
      { zeit: 0, pose: 'zur_kamera', position: [0.4, 0, 0], blick: 10, mimik: 'froh' },
      { zeit: t(0.35), pose: 'winken', position: [0, 0, 0], blick: 5, mimik: 'froh' },
      { zeit: t(0.65), pose: 'winken', position: [0, 0, 0], blick: 0, mimik: 'froh', posen_korrektur: { arm_r: { seitlich: 40 } } },
      { zeit: t(1), pose: 'winken', position: [0, 0, 0], blick: 0, mimik: 'froh' }
    ]
    kamera = [{ zeit: 0, position: [1.6, -5.2, 1.9], ziel: [0, 0, 1.5], linse: 30 }, nah]
  } else if (vorlage === 'schwert') {
    schluessel = [
      { zeit: 0, pose: 'ausholen', position: [0, 0, 0], blick: 25, mimik: 'wuetend' },
      { zeit: t(0.3), pose: 'hieb', position: [0.2, -0.4, 0], blick: 15, mimik: 'schreiend' },
      { zeit: t(0.55), pose: 'held', position: [0.2, -0.4, 0], blick: 10, mimik: 'froh' },
      { zeit: t(1), pose: 'held', position: [0.2, -0.4, 0], blick: 5, mimik: 'froh' }
    ]
    kamera = [{ zeit: 0, position: [1.4, -4.6, 1.6], ziel: [0, 0, 1.5], linse: 30 }, { ...nah, position: [0.8, -3.7, 1.7] }]
  } else {
    // sprung: Hechtsprung von links oben ins Bild, Landung, Heldenpose, Siegesfaust
    schluessel = [
      { zeit: 0, pose: 'hechtsprung', position: [-3.2, 0.3, 2.0], blick: 60 },
      { zeit: t(0.25), pose: 'sprungangriff', position: [-0.4, 0, 0.6], blick: 30 },
      { zeit: t(0.4), pose: 'held', position: [0, 0, 0], blick: 15, mimik: 'froh' },
      { zeit: t(0.65), pose: 'siegesfaust', position: [0, 0, 0], blick: 10, mimik: 'froh' },
      { zeit: t(1), pose: 'siegesfaust', position: [0, 0, 0], blick: 5, mimik: 'froh' }
    ]
    kamera = [{ zeit: 0, position: [1.2, -4.6, 2.0], ziel: [-0.6, 0, 1.5], linse: 28 }, nah]
  }
  return {
    breite: o.breite,
    hoehe: o.hoehe,
    fps: o.fps,
    dauer: d,
    hintergrund: 'transparent',
    samples: o.samples,
    geraet: o.geraet,
    figuren: [{ id: 'ich', skin: figur.skin, ...(figur.slim !== undefined && figur.slim !== null ? { slim: figur.slim } : {}), schluessel }],
    kamera: { schluessel: kamera },
    licht: { rand: [0.3, 0.85, 1.0] }
  }
}

export interface StingRender {
  blender: { exe: string; mesa: boolean; geraet: string }
  /** Ordner mit render_animation.py */
  blenderDir: string
  texturen: string
  ffmpeg: string
  /** Zwischenspeicher: gleicher Sting wird nur einmal gerendert */
  cache: string
}

function lauf(exe: string, args: string[], env?: NodeJS.ProcessEnv, cwd?: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const sammeln = (d: Buffer): void => {
      out = (out + d.toString()).slice(-8000)
    }
    child.stdout.on('data', sammeln)
    child.stderr.on('data', sammeln)
    child.once('error', reject)
    child.once('exit', (code) => resolve({ code, out }))
  })
}

/** Rendert den Sting (oder nimmt ihn aus dem Zwischenspeicher) und gibt das Video mit Alphakanal (.mov) zurück. */
export async function renderSting(vorlage: StingVorlage, figur: StingFigur, o: { dauer: number; breite: number; hoehe: number; fps: number; samples: number }, r: StingRender): Promise<string> {
  const animation = stingAnimation(vorlage, figur, { ...o, geraet: r.blender.geraet })
  const schluessel = createHash('sha1').update(JSON.stringify(animation)).digest('hex').slice(0, 16)
  const ziel = join(r.cache, `sting-${vorlage}-${schluessel}.mov`)
  if (existsSync(ziel)) return ziel
  const arbeit = join(r.cache, `sting-${schluessel}`)
  await mkdir(join(arbeit, 'bilder'), { recursive: true })
  await writeFile(join(arbeit, 'animation.json'), JSON.stringify(animation, null, 1))
  const b = await lauf(r.blender.exe, ['-b', '--factory-startup', '--python', join(r.blenderDir, 'render_animation.py'), '--', join(arbeit, 'animation.json'), r.texturen, join(arbeit, 'bilder')], blenderEnv(r.blender.mesa), dirname(r.blender.exe))
  if (b.code !== 0 || !b.out.includes('CS_OK')) throw new Error(`Sting konnte nicht gerendert werden: ${b.out.trim().split(/\r?\n/).slice(-2).join(' | ')}`)
  const f = await lauf(r.ffmpeg, ['-y', '-v', 'error', '-framerate', String(o.fps), '-i', join(arbeit, 'bilder', 'bild_%04d.png'), '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', `${ziel}.teil.mov`])
  if (f.code !== 0) throw new Error(`Sting-Video fehlgeschlagen: ${f.out.trim().slice(-200)}`)
  await rename(`${ziel}.teil.mov`, ziel)
  await rm(arbeit, { recursive: true, force: true })
  return ziel
}
