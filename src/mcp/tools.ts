// Herkunft: MoinStudio src/mcp/tools.ts (MIT), verallgemeinert: jede MCP-fähige Desktop-App (Claude Desktop, ChatGPT
// Desktop …) kann ContentStudio steuern: Thumbnail, Schnitt (video_edit) und Planung (planning).
/**
 * Werkzeuge des ContentStudio-MCP-Servers. Sie sprechen über eine Named Pipe mit der laufenden App und starten sie bei
 * Bedarf selbst. Logs nur auf stderr (stdout gehört dem MCP-Protokoll). Texte für die KI sind englisch, damit sie in
 * jeder Oberflächensprache gleich verstanden werden.
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { PipeInfo } from '@shared/rpc'
import { RpcClient } from '../main/rpc/pipe'

export const log = (...args: unknown[]): void => console.error('[contentstudio-mcp]', ...args)

export function pipeFile(): string {
  return process.env['CONTENTSTUDIO_PIPE_FILE'] ?? join(process.env['APPDATA'] ?? '', 'ContentStudio', 'pipe.json')
}

async function readPipeInfo(): Promise<PipeInfo | null> {
  try {
    return JSON.parse(await readFile(pipeFile(), 'utf8')) as PipeInfo
  } catch {
    return null
  }
}

/** Startet die App – installiert: ContentStudio.exe, Entwicklung: electron.exe <projekt>. */
function launchApp(): void {
  const env = { ...process.env }
  delete env['ELECTRON_RUN_AS_NODE']
  const packaged = __dirname.includes('app.asar')
  const args = packaged ? [] : [resolve(__dirname, '..', '..')]
  log('starting ContentStudio …')
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore', env, windowsHide: false })
  child.unref()
}

let client: RpcClient | null = null

export async function connectApp(): Promise<RpcClient> {
  if (client?.connected) return client
  const tryConnect = async (): Promise<RpcClient | null> => {
    const info = await readPipeInfo()
    if (!info) return null
    const c = new RpcClient(info)
    try {
      await c.connect(2000)
      return c
    } catch {
      return null
    }
  }
  client = await tryConnect()
  if (client) return client
  if (process.env['CONTENTSTUDIO_NO_AUTOSTART'] === '1') throw new Error('ContentStudio is not running.')
  launchApp()
  for (let i = 0; i < 60 && !client; i++) {
    await new Promise((r) => setTimeout(r, 500))
    client = await tryConnect()
  }
  if (!client) throw new Error('ContentStudio could not be started. Please open the app once manually.')
  return client
}

async function call<T = unknown>(method: string, params?: unknown): Promise<T> {
  return (await connectApp()).call<T>(method, params)
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export const text = (value: unknown): { content: Content[] } => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
})
export const fail = (err: unknown): { content: Content[]; isError: true } => ({
  content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
  isError: true
})

export function createServer(version: string): McpServer {
  const server = new McpServer({ name: 'contentstudio', version })

  server.registerTool(
    'status',
    { title: 'ContentStudio status', description: 'Shows version, data folder, hardware configuration (Blender, render engine, encoder, ONNX) and running tasks of ContentStudio.' },
    async () => {
      try {
        return text(await call('status'))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool('jobs_list', { title: 'List tasks', description: 'Lists all tasks (render, editing, analysis, AI) with state and progress.' }, async () => {
    try {
      return text(await call('jobs.list'))
    } catch (err) {
      return fail(err)
    }
  })

  server.registerTool(
    'job_get',
    { title: 'Get task', description: 'State, progress and result of one task.', inputSchema: z.object({ id: z.string().describe('Task ID') }) },
    async ({ id }) => {
      try {
        return text(await call('jobs.get', { id }))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'job_control',
    { title: 'Control task', description: 'Pauses, resumes or cancels a task.', inputSchema: z.object({ id: z.string(), action: z.enum(['pause', 'resume', 'cancel']) }) },
    async ({ id, action }) => {
      try {
        return text(await call('jobs.action', { id, action }))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool('channels_list', { title: 'List channels', description: 'Lists the channels of the creator profile (id, name, platform, directions). Use the id for thumbnail_create.' }, async () => {
    try {
      return text(await call('channels.list'))
    } catch (err) {
      return fail(err)
    }
  })

  server.registerTool(
    'thumbnail_create',
    {
      title: 'Create thumbnail',
      description:
        'Starts a thumbnail job in ContentStudio: the app plans variants after the channel’s style guide, renders them (3D scene, 3D model or photo compositing, depending on the creator’s appearance), checks them and returns the task ID. Poll job_get, then look at each variant with job_image (index).',
      inputSchema: z.object({
        channelId: z.string().describe('Channel id from channels_list'),
        description: z.string().describe('What the thumbnail should show, in the creator’s words'),
        variants: z.number().int().min(1).max(4).optional().describe('Number of variants (default 3)')
      })
    },
    async ({ channelId, description, variants }) => {
      try {
        const id = await call<string>('thumbnail.start', { kontoId: channelId, beschreibung: description, anzahl: variants ?? 3 })
        return text({ jobId: id, hint: 'Use job_get for progress; when done, job_image with index 0, 1, … shows the variants.' })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'job_image',
    {
      title: 'View result image',
      description: 'Returns the result image of a finished task (downscaled) to look at and assess it. Thumbnail tasks have several variants: pass index.',
      inputSchema: z.object({ id: z.string(), index: z.number().int().min(0).optional().describe('Variant of a thumbnail task (default 0)') })
    },
    async ({ id, index }) => {
      try {
        const img = await call<{ data: string; mimeType: string; width: number; height: number; path: string }>('jobs.image', { id, index })
        return {
          content: [
            { type: 'image', data: img.data, mimeType: img.mimeType },
            { type: 'text', text: `${img.width}×${img.height}, original: ${img.path}` }
          ]
        }
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'render_probe',
    { title: 'Render test image', description: 'Renders a test scene with Blender (checks that rendering works on this device). Returns the task ID.' },
    async () => {
      try {
        const id = await call<string>('probe.render')
        return text({ jobId: id, hint: 'Use job_get for progress, then job_image for the picture.' })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'video_edit',
    {
      title: 'Edit videos',
      description:
        'Video editing in ContentStudio (raw video in, finished video out). Actions: projekte (all editing projects), importieren (pfad, konto – starts import, transcript and rough cut on its own), schnitt (projekt – rough cut with transcript and removed parts), aendern (projekt, wunsch – cuts and effects in plain words, e.g. "make an exciting intro", "slow motion at the funniest moment", "fade to black at the end"; the preview renders afterwards), effekte (projekt – all effects with number and time), effekt_aendern (projekt, index, aus: true/false or loeschen: true), vorschau, export (export for the platform of the project, with title, text, chapters and checks), export_info, highlights (find highlights in long videos and streams), highlights_liste, clips (projekt, auswahl: [{index, art: clip|short}]), umbenennen (projekt, name, titel: true = also use it as the video title in export and planning), bibliothek (own effects of the creator, usable by name in aendern). Tasks run in the background – poll job_get.',
      inputSchema: z.object({
        aktion: z.enum(['projekte', 'importieren', 'schnitt', 'aendern', 'effekte', 'effekt_aendern', 'vorschau', 'export', 'export_info', 'highlights', 'highlights_liste', 'clips', 'umbenennen', 'bibliothek']),
        projekt: z.string().optional().describe('Project id (from projekte)'),
        pfad: z.string().optional().describe('Raw video path (only importieren)'),
        konto: z.string().optional().describe('Channel id from channels_list (only importieren; default: first channel)'),
        wunsch: z.string().optional().describe('Change in plain words (only aendern)'),
        name: z.string().optional().describe('New name (only umbenennen)'),
        titel: z.boolean().optional().describe('Also use the name as video title (only umbenennen)'),
        index: z.number().int().optional().describe('Effect number from effekte (only effekt_aendern)'),
        aus: z.boolean().optional().describe('Switch the effect off (true) or on (false) (only effekt_aendern)'),
        loeschen: z.boolean().optional().describe('Delete the effect (only effekt_aendern)'),
        auswahl: z.array(z.object({ index: z.number().int(), art: z.enum(['clip', 'short']) })).optional().describe('only clips')
      })
    },
    async (args) => {
      try {
        return text(await call('schnitt', args))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'planning',
    {
      title: 'Plan videos',
      description:
        'Content planning in ContentStudio: one board per channel (stages idee, aufnahme, schnitt, thumbnail, upload, veroeffentlicht) and a calendar. Actions: liste (konto?, spalte?), kalender (von?, bis? – dates, free upload slots from the channel rhythm, cards without date), anlegen (konto, titel, notizen?, spalte?, termin?), aendern (karte, titel?, notizen?, termin? "2026-10-03T17:00" or null, checkliste?, konto?, spalte?), verschieben (karte, spalte, index?, konto?), loeschen (karte), rhythmus, rhythmus_setzen (rhythmus: {"<channel id>": [{"tag": 0-6 (0 = Sunday), "zeit": "18:00"}]}), ideen (konto, wunsch? – AI task), titel (karte – AI task), wochenplan (AI task), crossposting (karte – plan which short goes where and when; needs a date), ergebnis (auftrag – result of an AI task). Channel ids come from channels_list.',
      inputSchema: z.object({
        aktion: z.enum(['liste', 'kalender', 'anlegen', 'aendern', 'verschieben', 'loeschen', 'rhythmus', 'rhythmus_setzen', 'ideen', 'titel', 'wochenplan', 'crossposting', 'ergebnis']),
        konto: z.string().optional(),
        spalte: z.string().optional(),
        karte: z.string().optional().describe('Card id'),
        titel: z.string().optional(),
        notizen: z.string().optional(),
        termin: z.string().nullable().optional(),
        checkliste: z.array(z.object({ text: z.string(), erledigt: z.boolean() })).optional(),
        index: z.number().int().optional(),
        von: z.string().optional(),
        bis: z.string().optional(),
        wunsch: z.string().optional(),
        auftrag: z.string().optional(),
        rhythmus: z.record(z.string(), z.array(z.object({ tag: z.number().int(), zeit: z.string() }))).optional()
      })
    },
    async (args) => {
      try {
        return text(await call('planung', args))
      } catch (err) {
        return fail(err)
      }
    }
  )

  return server
}
