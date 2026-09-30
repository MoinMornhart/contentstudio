// Herkunft: MoinStudio src/mcp/tools.ts (MIT), verallgemeinert: jede MCP-fähige Desktop-App (Claude Desktop, ChatGPT
// Desktop …) kann ContentStudio steuern. Werkzeuge für Thumbnail, Schnitt und Planung kommen mit ihren Meilensteinen.
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

  server.registerTool(
    'job_image',
    { title: 'View result image', description: 'Returns the result image of a finished task (downscaled) to look at and assess it.', inputSchema: z.object({ id: z.string() }) },
    async ({ id }) => {
      try {
        const img = await call<{ data: string; mimeType: string; width: number; height: number; path: string }>('jobs.image', { id })
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

  return server
}
