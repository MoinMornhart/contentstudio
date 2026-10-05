import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JobContext } from '../jobs/queue'
import { lauf, OPENCV_PRUEFUNG, sicherePakete, sichereUmgebung } from '../python'
import { t } from '../i18n'

/**
 * Werkzeuge eines Thumbnail-Auftrags (steht in der Nutzlast, damit ein Auftrag nach Neustart weiterläuft): Blender laut
 * Hardware-Profil, die Python-Umgebung für Bilder (rembg, OpenCV, Pillow) mit ihren Modellen, Skripte und Vorlagen.
 */
export interface ThumbUmgebung {
  blender: { exe: string; mesa: boolean; geraet: string; samples: number } | null
  uv: string | null
  /** Python-Umgebung der Bildwerkzeuge, z. B. %LOCALAPPDATA%\ContentStudio\py\vorlage */
  pyDir: string
  /** Modelle (Freistellen, Gesichter, Auffüllen) */
  modelle: string
  /** Mitgelieferte Skripte (blender/) */
  skripte: string
  prompts: string
  /** Zwischenspeicher der Minecraft-Texturen und Mobs */
  werkzeugRoot: string
  mojangErlaubt: boolean
}

/** Gesichtsfinder YuNet (OpenCV-Modellzoo, MIT-Lizenz), 227 KB, per SHA-256 geprüft */
export const YUNET = {
  url: 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
  sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
  datei: 'face_detection_yunet_2023mar.onnx'
}
/** Auffüllen, wo eine Person entfernt wurde (Vorlagen-Modus): LaMa (Apache-2.0), 208 MB; ohne Modell füllt OpenCV weich */
export const LAMA = { url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx', datei: 'lama_fp32.onnx' }

const existiert = (p: string): Promise<boolean> => stat(p).then(
  () => true,
  () => false
)

async function lade(url: string, ziel: string, sha256?: string): Promise<boolean> {
  if (await existiert(ziel)) return true
  try {
    const r = await fetch(url)
    if (!r.ok) return false
    const daten = Buffer.from(await r.arrayBuffer())
    if (sha256 && createHash('sha256').update(daten).digest('hex') !== sha256) return false
    await mkdir(join(ziel, '..'), { recursive: true })
    await writeFile(`${ziel}.teil`, daten)
    await rename(`${ziel}.teil`, ziel)
    return true
  } catch {
    return false
  }
}

export interface PyUmgebung {
  python: string
  env: NodeJS.ProcessEnv
}

/** Richtet die Bild-Umgebung beim ersten Gebrauch ein (läuft auf der CPU, auf jedem Rechner). */
export async function sicherePython(u: ThumbUmgebung, ctx: JobContext<unknown>, o: { lama?: boolean } = {}): Promise<PyUmgebung> {
  if (!u.uv) throw new Error(t('thumb.fehlt.uv'))
  const python = await sichereUmgebung(u.uv, u.pyDir, ctx)
  await sicherePakete(u.uv, python, OPENCV_PRUEFUNG, ['rembg==2.0.*', 'onnxruntime', 'opencv-python-headless>=4.10,<5', 'pillow', 'numpy'], ctx, t('thumb.schritt.bildwerkzeuge'))
  await lade(YUNET.url, join(u.modelle, YUNET.datei), YUNET.sha256)
  if (o.lama) {
    ctx.progress(null, t('thumb.schritt.lama'))
    await lade(LAMA.url, join(u.modelle, LAMA.datei))
  }
  return {
    python,
    env: {
      ...process.env,
      U2NET_HOME: join(u.modelle, 'rembg'),
      CS_GESICHT_MODELL: join(u.modelle, YUNET.datei),
      CS_LAMA: join(u.modelle, LAMA.datei),
      PYTHONIOENCODING: 'utf-8'
    }
  }
}

/**
 * Kleine Python-Umgebung nur mit Pillow und numpy für Veredeln, Grafik-Ebene und geteilte Bilder der Minecraft-Engine
 * (aus MoinStudio v0.39.0/v0.42.0). Getrennt von den Bildwerkzeugen, damit Minecraft-Thumbnails kein rembg brauchen.
 */
export async function sichereGrafikPython(u: ThumbUmgebung, ctx: JobContext<unknown>): Promise<PyUmgebung> {
  if (!u.uv) throw new Error(t('thumb.fehlt.uv'))
  const python = await sichereUmgebung(u.uv, join(u.pyDir, '..', 'grafik'), ctx)
  await sicherePakete(u.uv, python, 'PIL, numpy', ['pillow', 'numpy'], ctx, t('thumb.schritt.grafikWerkzeuge'))
  return { python, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }
}

/** Python-Skript der Bildwerkzeuge ausführen; liefert die Ausgabe (wirft bei Fehler mit den letzten Zeilen). */
export function py(p: PyUmgebung, skript: string, args: string[], ctx: JobContext<unknown>): Promise<string> {
  return lauf(p.python, [skript, ...args], ctx, p.env)
}

export async function liesJson<T>(pfad: string, standard: T): Promise<T> {
  try {
    return JSON.parse(await readFile(pfad, 'utf8')) as T
  } catch {
    return standard
  }
}
