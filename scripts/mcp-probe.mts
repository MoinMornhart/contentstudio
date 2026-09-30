// Ende-zu-Ende-Probe des MCP-Servers wie eine Desktop-App ihn startet: Electron im Node-Modus mit out/main/mcp.js über
// stdio, offizieller MCP-Client. Die App muss laufen (oder startet von selbst).
//   npm run build && node scripts/mcp-probe.mts
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import electronPath from 'electron'

const transport = new StdioClientTransport({
  command: electronPath as unknown as string,
  args: [resolve('out/main/mcp.js')],
  env: { ...(process.env as Record<string, string>), ELECTRON_RUN_AS_NODE: '1' }
})
const client = new Client({ name: 'mcp-probe', version: '1.0.0' })
await client.connect(transport)
const { tools } = await client.listTools()
console.log('Werkzeuge:', tools.map((t) => t.name).join(', '))
const status = await client.callTool({ name: 'status', arguments: {} })
console.log('status:', JSON.stringify(status.content).slice(0, 400))
const jobs = await client.callTool({ name: 'jobs_list', arguments: {} })
console.log('jobs_list:', JSON.stringify(jobs.content).slice(0, 200))
await client.close()
