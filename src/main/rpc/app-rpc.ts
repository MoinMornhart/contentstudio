// Herkunft: MoinStudio src/main/rpc/app-rpc.ts (MIT). Schnitt und Planung kommen mit ihren Meilensteinen dazu.
import { app, nativeImage } from 'electron'
import { rmSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { pipeName } from '@shared/rpc'
import { writeJsonAtomic } from '../data/jsonfile'
import type { SettingsStore } from '../data/settings'
import type { HardwareController } from '../hardware/controller'
import { ProfileStore } from '../hardware/profile'
import type { JobQueue } from '../jobs/queue'
import { RpcServer } from './pipe'

export function pipeInfoFile(): string {
  return join(app.getPath('userData'), 'pipe.json')
}

/** Verkleinert ein Bild für KI-Clients (max. Kantenlänge, JPEG) – manche Desktop-Apps erlauben nur ~1 MB pro Ergebnis. */
export function imageForAi(path: string, maxEdge = 1280): { data: string; mimeType: string; width: number; height: number } | null {
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const out = scale < 1 ? img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }) : img
  const size = out.getSize()
  return { data: out.toJPEG(82).toString('base64'), mimeType: 'image/jpeg', width: size.width, height: size.height }
}

export interface AppRpcDeps {
  settings: SettingsStore
  hardware: HardwareController
  jobs: JobQueue
  enqueueProbe: () => Promise<string>
  /** Thumbnail-Auftrag starten (ROADMAP M4) */
  starteThumbnail: (start: unknown) => Promise<string>
  /** Kanäle des Creator-Profils (für die Auswahl im KI-Client) */
  konten: () => Promise<{ id: string; name: string; plattform: string; richtungen: string[] }[]>
}

/** Startet den Pipe-Server der App und registriert die Methoden für MCP-Server und Fernsteuerung. */
export async function startAppRpc(deps: AppRpcDeps): Promise<RpcServer> {
  const rpc = new RpcServer(pipeName(userInfo().username))

  rpc.handle('status', async () => {
    const settings = await deps.settings.load()
    const profile = await deps.hardware.profiles.load()
    const config = profile ? ProfileStore.effective(profile) : null
    const queue = deps.jobs.state()
    return {
      version: app.getVersion(),
      dataDir: settings.dataDir,
      hardware: config
        ? {
            blender: config.blenderVersion,
            preview: `${config.preview.engine} ${config.preview.width}×${config.preview.height}`,
            final: `${config.final.engine} (${config.final.device}) ${config.final.width}×${config.final.height}`,
            encoder: config.encoder,
            onnx: config.onnx
          }
        : 'hardware test not run yet',
      queue: { paused: queue.paused, active: queue.jobs.filter((j) => !['done', 'failed', 'cancelled'].includes(j.state)).length }
    }
  })
  rpc.handle('jobs.list', () => deps.jobs.state())
  rpc.handle('jobs.get', (p) => {
    const id = String((p as { id?: unknown })?.id ?? '')
    const info = deps.jobs.get(id)
    if (!info) throw new Error(`Job ${id} not found`)
    return { ...info, result: deps.jobs.result(id) ?? null }
  })
  rpc.handle('jobs.action', async (p) => {
    const { action, id } = (p ?? {}) as { action?: string; id?: string }
    if (action === 'pause') await deps.jobs.pause(String(id))
    else if (action === 'resume') await deps.jobs.resume(String(id))
    else if (action === 'cancel') await deps.jobs.cancel(String(id))
    else throw new Error(`Unknown action: ${String(action)}`)
    return deps.jobs.get(String(id)) ?? null
  })
  rpc.handle('jobs.image', (p) => {
    const { id: roh, index } = (p ?? {}) as { id?: unknown; index?: unknown }
    const id = String(roh ?? '')
    const result = deps.jobs.result<{ image?: string; varianten?: { bild: string | null }[] }>(id)
    // Thumbnail-Aufträge liefern mehrere Varianten, andere Aufgaben ein einzelnes Bild
    const pfad = result?.varianten ? (result.varianten[Number(index ?? 0)]?.bild ?? null) : (result?.image ?? null)
    if (!pfad) throw new Error(`Job ${id} has no image (yet)`)
    const img = imageForAi(pfad)
    if (!img) throw new Error('Image could not be read')
    return { ...img, path: pfad }
  })
  rpc.handle('probe.render', () => deps.enqueueProbe())
  rpc.handle('channels.list', () => deps.konten())
  rpc.handle('thumbnail.start', (p) => deps.starteThumbnail(p))

  await rpc.listen()
  await writeJsonAtomic(pipeInfoFile(), rpc.info(app.getVersion()))
  app.once('will-quit', () => {
    rpc.close()
    rmSync(pipeInfoFile(), { force: true }) // synchron: beim Beenden bleibt keine Zeit für async
  })
  return rpc
}
