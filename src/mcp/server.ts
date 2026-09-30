// Herkunft: MoinStudio src/mcp/server.ts (MIT).
/**
 * ContentStudio-MCP-Server (stdio). Wird von MCP-fähigen Desktop-Apps gestartet:
 *   ContentStudio.exe <pfad>/mcp.js   mit ELECTRON_RUN_AS_NODE=1
 * Wichtig: stdout gehört ausschließlich dem MCP-Protokoll – Logs nur auf stderr.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { createServer, log } from './tools'

async function main(): Promise<void> {
  let version = '0.0.0'
  try {
    const pkg = JSON.parse(await readFile(resolve(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }
    version = pkg.version
  } catch {
    // Version ist nur Information
  }
  const server = createServer(version)
  await server.connect(new StdioServerTransport())
  log(`ready (version ${version})`)
}

main().catch((err) => {
  log('start error:', err)
  process.exit(1)
})
