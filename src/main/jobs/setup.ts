// Herkunft: MoinStudio src/main/jobs/setup.ts (MIT). Thumbnail, Schnitt und Planung kommen mit ihren Meilensteinen dazu.
import { ipcMain, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '@shared/app'
import { benchScriptPath, type HardwareController } from '../hardware/controller'
import { ProfileStore } from '../hardware/profile'
import type { ToolManager } from '../tools/manager'
import { BLENDER_FALLBACK, BLENDER_PRIMARY } from '../tools/specs'
import { probeRenderJob, type ProbeRenderPayload } from './blender'
import { registerJobsIpc } from './ipc'
import { JobQueue } from './queue'
import { t } from '../i18n'

/** Legt die Warteschlange an, registriert die Aufgabenarten des Fundaments und die IPC-Kanäle. */
export function setupJobs(
  root: string,
  tools: ToolManager,
  hardware: HardwareController,
  getWindow: () => BrowserWindow | undefined
): { queue: JobQueue; enqueueProbe: () => Promise<string> } {
  const queue = new JobQueue(join(root, 'jobs'))
  queue.register('probe-render', probeRenderJob)
  registerJobsIpc(queue, getWindow)

  const enqueueProbe = async (): Promise<string> => {
    const profile = await hardware.profiles.load()
    if (!profile) throw new Error(t('jobs.probe.zuerstHardware'))
    const config = ProfileStore.effective(profile)
    const spec = [BLENDER_PRIMARY, BLENDER_FALLBACK].find((s) => s.version === config.blenderVersion)
    const exe = spec ? await tools.exePath(spec) : null
    if (!exe) throw new Error(t('jobs.probe.keinBlender'))
    const payload: ProbeRenderPayload = {
      exe,
      mesa: config.blenderMesa,
      script: benchScriptPath(),
      setting: config.preview,
      outDir: join(root, 'renders', 'probe')
    }
    return queue.enqueue('probe-render', t('jobs.probe.titel'), payload)
  }
  ipcMain.handle(IPC.hwProbe, () => enqueueProbe())

  ipcMain.handle(IPC.jobsImage, async (_e, id: unknown) => {
    const result = queue.result<{ image?: string }>(String(id))
    if (!result?.image) return null
    try {
      return `data:image/png;base64,${(await readFile(result.image)).toString('base64')}`
    } catch {
      return null
    }
  })
  return { queue, enqueueProbe }
}
