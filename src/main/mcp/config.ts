// Herkunft: MoinStudio src/main/mcp/config.ts (MIT).
import { copyFile, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { writeJsonAtomic } from '../data/jsonfile'

export const SERVER_NAME = 'contentstudio'

export interface McpServerEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

async function isDir(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() === true
}

/**
 * Wo liest Claude Desktop seine Konfiguration? Bei der MSIX-/Store-Variante leitet Windows
 * %APPDATA%\Claude nach %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude um
 * (lokal getestet, nicht offiziell dokumentiert – docs/claude-integration.md 5.1).
 */
export async function desktopConfigPaths(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const paths: string[] = []
  const local = env['LOCALAPPDATA']
  if (local) {
    try {
      for (const name of await readdir(join(local, 'Packages'))) {
        if (/^Claude_/i.test(name)) {
          const dir = join(local, 'Packages', name, 'LocalCache', 'Roaming', 'Claude')
          if (await isDir(dir)) paths.push(join(dir, 'claude_desktop_config.json'))
        }
      }
    } catch {
      // kein Packages-Ordner
    }
  }
  const roaming = env['APPDATA']
  if (roaming && (paths.length === 0 || (await isDir(join(roaming, 'Claude'))))) {
    paths.push(join(roaming, 'Claude', 'claude_desktop_config.json'))
  }
  return paths
}

/** Fügt den ContentStudio-Eintrag hinzu bzw. ersetzt ihn; alle anderen Einstellungen bleiben unverändert. */
export function mergeDesktopConfig(existing: string | null, entry: McpServerEntry): Record<string, unknown> {
  let config: Record<string, unknown> = {}
  if (existing && existing.trim()) {
    const parsed: unknown = JSON.parse(existing.charCodeAt(0) === 0xfeff ? existing.slice(1) : existing)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed as Record<string, unknown>
    else throw new Error('claude_desktop_config.json hat ein unerwartetes Format – bitte manuell prüfen.')
  }
  const servers = config['mcpServers'] && typeof config['mcpServers'] === 'object' ? (config['mcpServers'] as Record<string, unknown>) : {}
  return { ...config, mcpServers: { ...servers, [SERVER_NAME]: entry } }
}

export interface InstallResult {
  path: string
  backup: string | null
}

/** Schreibt den Eintrag in alle gefundenen Claude-Desktop-Konfigurationen (mit Backup). */
export async function installIntoDesktopConfig(entry: McpServerEntry, env: NodeJS.ProcessEnv = process.env): Promise<InstallResult[]> {
  const results: InstallResult[] = []
  for (const path of await desktopConfigPaths(env)) {
    let existing: string | null
    try {
      existing = await readFile(path, 'utf8')
    } catch {
      existing = null
    }
    const merged = mergeDesktopConfig(existing, entry)
    let backup: string | null = null
    if (existing !== null) {
      backup = `${path}.contentstudio-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
      await copyFile(path, backup)
    }
    await writeJsonAtomic(path, merged)
    results.push({ path, backup })
  }
  return results
}
