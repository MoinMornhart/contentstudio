import { execFile } from 'node:child_process'
import { mkdir, readdir, rename, rm, stat, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import { downloadFile, fetchText } from './download'
import { findChecksum, type ToolId, type ToolSpec } from './specs'
import { t } from '../i18n'

const run = promisify(execFile)

export type ToolPhase = 'check' | 'download' | 'verify' | 'extract' | 'done' | 'error'

export interface ToolProgress {
  id: ToolId
  version: string
  phase: ToolPhase
  /** 0–100 während des Downloads, sonst null */
  percent: number | null
  message?: string
}

const InstalledSchema = z.record(
  z.string(),
  z.object({ version: z.string(), path: z.string(), exe: z.string(), installedAt: z.string() })
)
export type InstalledTools = z.infer<typeof InstalledSchema>

/** Windows bringt seit Windows 10 1803 ein bsdtar mit, das auch ZIP-Dateien entpackt. */
function systemTar(): string {
  return join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
}

export async function extractZip(zip: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true })
  await run(systemTar(), ['-xf', zip, '-C', target], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null
}

/**
 * Viele ZIPs enthalten genau einen Oberordner (z. B. „blender-5.2.2-windows-x64/“).
 * Dessen Inhalt wird eine Ebene nach oben gezogen, damit der Pfad kurz bleibt.
 */
export async function flattenSingleFolder(dir: string): Promise<void> {
  const entries = await readdir(dir)
  if (entries.length !== 1) return
  const inner = join(dir, entries[0]!)
  if (!(await stat(inner)).isDirectory()) return
  for (const name of await readdir(inner)) await rename(join(inner, name), join(dir, name))
  await rm(inner, { recursive: true, force: true })
}

export class ToolManager {
  constructor(private readonly root: string) {}

  private get stateFile(): string {
    return join(this.root, 'tools.json')
  }

  async installed(): Promise<InstalledTools> {
    const res = await readJson(this.stateFile, InstalledSchema)
    return res.ok ? res.value : {}
  }

  /** Schlüssel pro Werkzeug und Version, damit z. B. zwei Blender-Versionen nebeneinander liegen können. */
  static key(spec: Pick<ToolSpec, 'id' | 'version'>): string {
    return `${spec.id}@${spec.version}`
  }

  /** Pfad zur Programmdatei, wenn das Werkzeug installiert und vorhanden ist. */
  async exePath(spec: ToolSpec): Promise<string | null> {
    const entry = (await this.installed())[ToolManager.key(spec)]
    if (!entry) return null
    const exe = join(entry.path, entry.exe)
    return (await exists(exe)) ? exe : null
  }

  async freeBytes(): Promise<number> {
    await mkdir(this.root, { recursive: true })
    const s = await statfs(this.root)
    return s.bavail * s.bsize
  }

  async install(spec: ToolSpec, onProgress: (p: ToolProgress) => void = () => {}, signal?: AbortSignal): Promise<string> {
    const report = (phase: ToolPhase, percent: number | null = null, message?: string): void =>
      onProgress({ id: spec.id, version: spec.version, phase, percent, message })

    try {
      report('check')
      const already = await this.exePath(spec)
      if (already) {
        report('done', 100)
        return already
      }

      const needed = spec.sizeBytes + spec.installedBytes + 200_000_000
      const free = await this.freeBytes()
      if (free < needed) {
        throw new Error(t('werkzeuge.fehler.platz', { name: spec.label, noetig: gb(needed), frei: gb(free) }))
      }

      const sha256 = findChecksum(await fetchText(spec.checksumUrl, signal), spec.file)
      if (!sha256) throw new Error(t('werkzeuge.fehler.pruefsumme', { datei: spec.file, url: spec.checksumUrl }))

      const zip = join(this.root, 'downloads', spec.file)
      await downloadFile(spec.url, zip, {
        sha256,
        signal,
        onProgress: ({ received, total }) =>
          report('download', total ? Math.round((received / total) * 100) : null)
      })
      report('verify', 100)

      const target = join(this.root, spec.dir)
      const staging = `${target}.entpacken`
      await rm(staging, { recursive: true, force: true })
      report('extract')
      await extractZip(zip, staging)
      await flattenSingleFolder(staging)
      if (!(await exists(join(staging, spec.exe)))) {
        throw new Error(t('werkzeuge.fehler.exeFehlt', { exe: spec.exe, datei: spec.file }))
      }
      await rm(target, { recursive: true, force: true })
      await rename(staging, target)
      await rm(zip, { force: true })

      const state = await this.installed()
      state[ToolManager.key(spec)] = {
        version: spec.version,
        path: target,
        exe: spec.exe,
        installedAt: new Date().toISOString()
      }
      await writeJsonAtomic(this.stateFile, state)
      report('done', 100)
      return join(target, spec.exe)
    } catch (err) {
      report('error', null, err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  async uninstall(spec: ToolSpec): Promise<void> {
    const state = await this.installed()
    const entry = state[ToolManager.key(spec)]
    if (entry) await rm(entry.path, { recursive: true, force: true })
    delete state[ToolManager.key(spec)]
    await writeJsonAtomic(this.stateFile, state)
  }
}

function gb(bytes: number): string {
  return (bytes / 1e9).toFixed(1)
}
