import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { JobContext } from './jobs/queue'
import { t } from './i18n'

/**
 * Gemeinsame Python-Umgebung für Bild- und Tonwerkzeuge (rembg, LaMa, faster-whisper) unter
 * %LOCALAPPDATA%\ContentStudio\py\vorlage. Pakete kommen erst beim ersten Gebrauch dazu, ohne Paket-Cache (Platz sparen).
 */

export function lauf(exe: string, args: string[], ctx: JobContext<unknown>, env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: env ?? process.env })
    ctx.track(child)
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out = (out + d.toString()).slice(-20000)))
    child.stderr.on('data', (d: Buffer) => (out = (out + d.toString()).slice(-20000)))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${exe.split(/[\\/]/).pop()} Exit ${code}: ${out.trim().split(/\r?\n/).slice(-2).join(' ')}`))))
  })
}

const existiert = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)

/** Legt die Umgebung (Python 3.12 über uv) an, falls sie fehlt, und gibt python.exe zurück. */
export async function sichereUmgebung(uv: string, pyDir: string, ctx: JobContext<unknown>): Promise<string> {
  const python = join(pyDir, 'Scripts', 'python.exe')
  if (!(await existiert(python))) {
    ctx.progress(null, t('jobs.python.einrichten'))
    await lauf(uv, ['venv', pyDir, '--python', '3.12'], ctx)
  }
  return python
}

/**
 * Bildwerkzeuge (rembg, OpenCV, Pillow, numpy) vorhanden und OpenCV in Version 4: OpenCV 5.0 warf immer wieder
 * „Unknown C++ exception“ (aus MoinStudio v0.38.0). Ist 5.x installiert, schlägt die Prüfung fehl und 4.x wird installiert.
 */
export const OPENCV_PRUEFUNG = 'rembg, cv2, PIL, numpy; assert cv2.__version__.startswith("4.")'

/** Installiert `pakete`, wenn sich `modul` nicht importieren lässt. */
export async function sicherePakete(uv: string, python: string, modul: string, pakete: string[], ctx: JobContext<unknown>, hinweis: string): Promise<void> {
  const ok = await lauf(python, ['-c', `import ${modul}`], ctx).then(
    () => true,
    () => false
  )
  if (ok) return
  ctx.progress(null, hinweis)
  await lauf(uv, ['pip', 'install', '--python', python, '--no-cache', ...pakete], ctx)
}
