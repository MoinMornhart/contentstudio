// Herkunft: MoinStudio src/main/rpc/app-rpc.ts (MIT), mit Schnitt (video_edit) und Planung (planning) für MCP-Apps.
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
import { IPC } from '@shared/app'
import type { Profil } from '@shared/profil'
import type { SchnittEffekt } from '@shared/schnitt'
import { planungAktion, type PlanungArgs } from '../planung/aktionen'

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
  /** Schnitt (ROADMAP M5) und Planung (ROADMAP M6): dieselben Funktionen wie in der Oberfläche */
  schnitt: { starteImport: (video: string, kontoId: string) => Promise<string>; aufruf: (kanal: string, ...a: unknown[]) => Promise<unknown> }
  planung: { aufruf: (kanal: string, ...a: unknown[]) => Promise<unknown>; daten: () => Promise<string> }
  profil: { laden: () => Promise<Profil>; aendern: (fn: (p: Profil) => Profil) => Promise<Profil> }
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

  // Planung aus einer MCP-App: planning
  rpc.handle('planung', async (p) =>
    planungAktion(await deps.planung.daten(), (p ?? {}) as PlanungArgs, {
      profil: () => deps.profil.laden(),
      setzeRhythmus: async (kontoId, slots) => void (await deps.profil.aendern((x) => ({ ...x, konten: x.konten.map((k) => (k.id === kontoId ? { ...k, rhythmus: slots } : k)) }))),
      starte: async (art, o) => String(await deps.planung.aufruf(IPC.planungKi, art, o)),
      stand: (auftrag) => deps.planung.aufruf(IPC.planungKiStand, auftrag),
      crossposting: (karte) => deps.planung.aufruf(IPC.planungCrossPlan, karte)
    })
  )
  // Schnitt aus einer MCP-App: video_edit
  rpc.handle('schnitt', async (p) => {
    const { aktion, projekt, pfad, konto, wunsch, auswahl, index, aus, loeschen, name, titel } = (p ?? {}) as { aktion?: string; projekt?: string; pfad?: string; konto?: string; wunsch?: string; auswahl?: unknown; index?: number; aus?: boolean; loeschen?: boolean; name?: string; titel?: boolean }
    const a = deps.schnitt.aufruf
    const effektListe = (l: SchnittEffekt[]): { index: number; art: string; von?: number; bis?: number; bei?: number; aus: boolean; daten: SchnittEffekt }[] =>
      l.map((e, i) => ({ index: i, art: e.art, von: e.von, bis: e.bis, bei: e.bei, aus: e.aus === true, daten: e }))
    switch (aktion) {
      case 'projekte':
        return a(IPC.schnittProjekte)
      case 'importieren': {
        if (!pfad) throw new Error('pfad missing')
        const konten = await deps.konten()
        const kontoId = konto && konten.some((k) => k.id === konto) ? konto : konten[0]?.id
        if (!kontoId) throw new Error('No channel in the creator profile.')
        return { projekt: await deps.schnitt.starteImport(pfad, kontoId), hinweis: 'Import, transcript and rough cut run one after another on their own.' }
      }
      case 'schnitt': {
        const [liste, transkript] = (await Promise.all([a(IPC.schnittListe, projekt), a(IPC.schnittTranskript, projekt)])) as [{ dauer: number; behalten: { start: number; ende: number }[]; entfernt: { start: number; ende: number; grund: string; text?: string; aus?: boolean }[] } | null, { start: number; ende: number; text: string }[] | null]
        if (!liste) return { hinweis: 'No rough cut yet – wait for import and transcript.' }
        const nachher = liste.behalten.reduce((s, b) => s + b.ende - b.start, 0)
        return {
          vorher: Math.round(liste.dauer),
          nachher: Math.round(nachher),
          entfernt: liste.entfernt.filter((e) => !e.aus && e.grund !== 'pause').map((e) => ({ grund: e.grund, start: e.start, ende: e.ende, text: e.text })),
          pausenGekuerzt: liste.entfernt.filter((e) => !e.aus && e.grund === 'pause').length,
          transkript: (transkript ?? []).map((s) => ({ start: s.start, ende: s.ende, text: s.text }))
        }
      }
      case 'aendern':
        return { auftrag: await a(IPC.schnittWunsch, projekt, wunsch) }
      case 'effekte':
        return { effekte: effektListe((await a(IPC.schnittEffekte, projekt)) as SchnittEffekt[]), hinweis: 'Times in seconds of the original recording. Render the preview again after effekt_aendern.' }
      case 'effekt_aendern':
        if (typeof index !== 'number') throw new Error('index missing')
        if (loeschen !== true && typeof aus !== 'boolean') throw new Error('give aus or loeschen')
        return { effekte: effektListe((await a(IPC.schnittEffektAendern, projekt, index, loeschen === true ? null : { aus })) as SchnittEffekt[]) }
      case 'vorschau':
        return { auftrag: await a(IPC.schnittVorschau, projekt) }
      case 'export':
        return { auftrag: await a(IPC.schnittExport, projekt) }
      case 'export_info':
        return a(IPC.schnittExportInfo, projekt)
      case 'highlights':
        return { auftrag: await a(IPC.schnittHighlightsStart, projekt) }
      case 'highlights_liste':
        return a(IPC.schnittHighlights, projekt)
      case 'clips':
        return { auftrag: await a(IPC.schnittClips, projekt, auswahl) }
      case 'umbenennen':
        await a(IPC.schnittUmbenennen, projekt, name, titel === true)
        return { ok: true }
      case 'bibliothek':
        return { effekte: ((await a(IPC.schnittBib)) as { id: string; name: string; haeufigkeit: unknown }[]).map((e) => ({ id: e.id, name: e.name, haeufigkeit: e.haeufigkeit })) }
      default:
        throw new Error(`Unknown action: ${String(aktion)}`)
    }
  })

  await rpc.listen()
  await writeJsonAtomic(pipeInfoFile(), rpc.info(app.getVersion()))
  app.once('will-quit', () => {
    rpc.close()
    rmSync(pipeInfoFile(), { force: true }) // synchron: beim Beenden bleibt keine Zeit für async
  })
  return rpc
}
