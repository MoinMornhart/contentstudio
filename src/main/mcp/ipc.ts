// Herkunft: MoinStudio src/main/mcp/ipc.ts (MIT), erweitert um ChatGPT Desktop.
import { ipcMain } from 'electron'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '@shared/app'
import type { McpZiel } from '@shared/ki'
import { desktopConfigPaths, installIntoDesktopConfig, SERVER_NAME, type McpServerEntry } from './config'

/** So starten Desktop-Apps den MCP-Server: die App-EXE im Node-Modus mit dem gebündelten mcp.js. */
export function mcpEntry(): McpServerEntry {
  return { command: process.execPath, args: [join(__dirname, 'mcp.js')], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

async function gibtEs(p: string): Promise<boolean> {
  return (await stat(p).catch(() => null)) !== null
}

async function pakete(env: NodeJS.ProcessEnv): Promise<string[]> {
  return readdir(join(env['LOCALAPPDATA'] ?? '', 'Packages')).catch(() => [])
}

/** Claude Desktop: klassischer Installer oder Store-/MSIX-Paket */
export async function claudeDesktopInstalliert(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (await gibtEs(join(env['LOCALAPPDATA'] ?? '', 'AnthropicClaude'))) return true
  return (await pakete(env)).some((n) => /^Claude_/i.test(n))
}

/** ChatGPT Desktop: Store-Paket von OpenAI oder Installer im Benutzerordner */
export async function chatgptDesktopInstalliert(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (await gibtEs(join(env['LOCALAPPDATA'] ?? '', 'Programs', 'ChatGPT'))) return true
  return (await pakete(env)).some((n) => /^OpenAI\.ChatGPT/i.test(n))
}

async function claudeVerbunden(): Promise<boolean> {
  const entry = mcpEntry()
  for (const path of await desktopConfigPaths()) {
    try {
      const e = (JSON.parse(await readFile(path, 'utf8')) as { mcpServers?: Record<string, McpServerEntry> }).mcpServers?.[SERVER_NAME]
      if (e && e.command === entry.command && e.args?.[0] === entry.args[0]) return true
    } catch {
      // Datei fehlt oder ist leer
    }
  }
  return false
}

export async function mcpZiele(): Promise<McpZiel[]> {
  return [
    { id: 'claude-desktop', name: 'Claude Desktop', installiert: await claudeDesktopInstalliert(), verbunden: await claudeVerbunden(), automatisch: true },
    // ChatGPT Desktop: Die Person trägt den lokalen Server selbst unter Einstellungen → MCP servers ein (docs/ki-anbieter.md)
    { id: 'chatgpt-desktop', name: 'ChatGPT Desktop', installiert: await chatgptDesktopInstalliert(), verbunden: false, automatisch: false }
  ]
}

export function registerMcpIpc(): void {
  ipcMain.handle(IPC.mcpZiele, () => mcpZiele())
  ipcMain.handle(IPC.mcpVerbinden, async (_e, id: unknown) => {
    // Nur Claude Desktop wird automatisch eingetragen: bestehende Einträge bleiben, vorher gibt es eine Sicherung
    if (id === 'claude-desktop') await installIntoDesktopConfig(mcpEntry())
    return mcpZiele()
  })
  ipcMain.handle(IPC.mcpEintrag, () => mcpEntry())
}
