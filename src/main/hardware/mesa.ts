import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { downloadFile } from '../tools/download'

const run = promisify(execFile)

/**
 * Mesa3D (mesa-dist-win, MIT) liefert Software-OpenGL. Nur auf Rechnern OHNE echte GPU wird
 * es neben blender.exe gelegt, damit EEVEE/Workbench dort überhaupt rendern. mesa-dist-win
 * veröffentlicht keine Prüfsummendatei – der SHA256 ist deshalb hier fest hinterlegt
 * (ermittelt am 2026-09-26 aus dem offiziellen GitHub-Release 26.2.1).
 */
export const MESA = {
  version: '26.2.1',
  url: 'https://github.com/pal1000/mesa-dist-win/releases/download/26.2.1/mesa3d-26.2.1-release-msvc.7z',
  file: 'mesa3d-26.2.1-release-msvc.7z',
  sha256: '78a0305844074535e73dfb6dcb5eb2a65f1d9dc445102e1f4c3c3e97dace19bf',
  dlls: ['opengl32.dll', 'libgallium_wgl.dll']
} as const

const MARKER = 'contentstudio-mesa.txt'
/** Markierung von MoinStudio: dieselben Mesa-DLLs, falls der Werkzeug-Ordner geteilt wird (CONTENTSTUDIO_TOOLS_DIR) */
const MARKER_MOINSTUDIO = 'moinstudio-mesa.txt'

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null
}

/** Lädt Mesa einmal in den Cache (nur die beiden benötigten DLLs) und gibt den Ordner zurück. */
export async function ensureMesaCache(root: string, signal?: AbortSignal): Promise<string> {
  const dir = join(root, 'mesa', MESA.version)
  if ((await Promise.all(MESA.dlls.map((d) => exists(join(dir, d))))).every(Boolean)) return dir
  const archive = join(root, 'downloads', MESA.file)
  await downloadFile(MESA.url, archive, { sha256: MESA.sha256, signal })
  const staging = `${dir}.entpacken`
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  const tar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
  await run(tar, ['-xf', archive, '-C', staging, ...MESA.dlls.map((d) => `x64/${d}`)], { windowsHide: true })
  await mkdir(dir, { recursive: true })
  for (const d of MESA.dlls) await copyFile(join(staging, 'x64', d), join(dir, d))
  await rm(staging, { recursive: true, force: true })
  await rm(archive, { force: true })
  return dir
}

/**
 * Umgebung für Blender-Prozesse. Mit Mesa muss der Software-Treiber llvmpipe erzwungen werden:
 * ohne GALLIUM_DRIVER wählt Mesa auf Windows einen anderen Treiber, und Blender bricht auf
 * Rechnern ohne GPU mit Exit-Code 87 ab (getestet 2026-09-26, Mesa 26.2.1, Blender 4.5.9/5.2.2).
 */
export function blenderEnv(mesa: boolean, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return mesa ? { ...base, GALLIUM_DRIVER: 'llvmpipe' } : base
}

export async function installMesaInto(blenderDir: string, cacheDir: string): Promise<void> {
  for (const d of MESA.dlls) await copyFile(join(cacheDir, d), join(blenderDir, d))
  await writeFile(join(blenderDir, MARKER), `Mesa ${MESA.version} from ContentStudio (only for computers without a GPU)\n`, 'utf8')
}

export async function hasMesa(blenderDir: string): Promise<boolean> {
  return (await exists(join(blenderDir, MARKER))) || (await exists(join(blenderDir, MARKER_MOINSTUDIO)))
}

/** Entfernt nur die von ContentStudio selbst abgelegten Mesa-Dateien (erkennbar an der Markierung). */
export async function removeMesaFrom(blenderDir: string): Promise<boolean> {
  if (!(await hasMesa(blenderDir))) return false
  for (const d of [...MESA.dlls, MARKER]) await rm(join(blenderDir, d), { force: true })
  return true
}
