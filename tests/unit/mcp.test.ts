import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { RpcServer } from '../../src/main/rpc/pipe'
import { desktopConfigPaths, installIntoDesktopConfig, mergeDesktopConfig } from '../../src/main/mcp/config'
import { pipeName } from '../../src/shared/rpc'
import { createServer } from '../../src/mcp/tools'

const entry = { command: 'C:\\Apps\\ContentStudio.exe', args: ['C:\\Apps\\resources\\app.asar\\out\\main\\mcp.js'], env: { ELECTRON_RUN_AS_NODE: '1' } }

describe('MCP-Konfiguration von Claude Desktop', () => {
  it('fügt ContentStudio hinzu und behält andere Server und Einstellungen', () => {
    const existing = JSON.stringify({ globalShortcut: 'Ctrl+Space', mcpServers: { github: { command: 'gh-mcp' }, contentstudio: { command: 'alt' } } })
    const merged = mergeDesktopConfig(existing, entry) as { globalShortcut: string; mcpServers: Record<string, unknown> }
    expect(merged.globalShortcut).toBe('Ctrl+Space')
    expect(Object.keys(merged.mcpServers)).toEqual(['github', 'contentstudio'])
    expect(merged.mcpServers['contentstudio']).toEqual(entry)
    expect(mergeDesktopConfig(null, entry)).toEqual({ mcpServers: { contentstudio: entry } })
    expect(mergeDesktopConfig('\uFEFF{}', entry)).toEqual({ mcpServers: { contentstudio: entry } })
    expect(() => mergeDesktopConfig('[1,2]', entry)).toThrow()
  })

  it('findet die MSIX-Variante und schreibt mit Backup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cs-mcpcfg-'))
    try {
      const msix = join(root, 'Local', 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude')
      await mkdir(msix, { recursive: true })
      await writeFile(join(msix, 'claude_desktop_config.json'), '{"mcpServers":{"andere":{"command":"x"}}}')
      const env = { LOCALAPPDATA: join(root, 'Local'), APPDATA: join(root, 'Roaming') }
      expect(await desktopConfigPaths(env)).toEqual([join(msix, 'claude_desktop_config.json')])
      const res = await installIntoDesktopConfig(entry, env)
      expect(res).toHaveLength(1)
      expect(res[0]!.backup).toMatch(/contentstudio-backup/)
      const written = JSON.parse(await readFile(join(msix, 'claude_desktop_config.json'), 'utf8')) as { mcpServers: Record<string, unknown> }
      expect(Object.keys(written.mcpServers)).toEqual(['andere', 'contentstudio'])
      expect((await readdir(msix)).filter((f) => f.includes('backup'))).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('nimmt ohne MSIX den klassischen Pfad', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cs-mcpcfg-'))
    try {
      expect(await desktopConfigPaths({ LOCALAPPDATA: join(root, 'L'), APPDATA: join(root, 'R') })).toEqual([join(root, 'R', 'Claude', 'claude_desktop_config.json')])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('MCP-Werkzeuge (offizieller Client ↔ Server, App nachgebaut)', () => {
  const pipe = pipeName(`mcp-${randomBytes(4).toString('hex')}`)
  const app = new RpcServer(pipe)
  let dir: string
  let client: Client

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cs-mcp-'))
    app.handle('status', () => ({ version: '9.9.9', dataDir: 'D:\\OneDrive\\ContentStudio' }))
    app.handle('probe.render', () => 'job123')
    app.handle('jobs.image', () => ({ data: Buffer.from('fake').toString('base64'), mimeType: 'image/jpeg', width: 960, height: 540, path: 'C:\\x.png' }))
    await app.listen()
    await writeFile(join(dir, 'pipe.json'), JSON.stringify(app.info('9.9.9')))
    process.env['CONTENTSTUDIO_PIPE_FILE'] = join(dir, 'pipe.json')
    process.env['CONTENTSTUDIO_NO_AUTOSTART'] = '1'

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createServer('9.9.9').connect(serverTransport)
    client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(clientTransport)
  })
  afterAll(async () => {
    await client.close()
    app.close()
    delete process.env['CONTENTSTUDIO_PIPE_FILE']
    delete process.env['CONTENTSTUDIO_NO_AUTOSTART']
    await rm(dir, { recursive: true, force: true })
  })

  it('listet die Werkzeuge mit Beschreibung', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['job_control', 'job_get', 'job_image', 'jobs_list', 'render_probe', 'status'])
    expect(tools.every((t) => (t.description ?? '').length > 10)).toBe(true)
  })

  it('holt den Status über die Pipe aus der App', async () => {
    const res = await client.callTool({ name: 'status', arguments: {} })
    expect(JSON.stringify(res.content)).toContain('9.9.9')
  })

  it('liefert Bilder als Bild-Inhalt plus Pfad', async () => {
    const res = await client.callTool({ name: 'job_image', arguments: { id: 'job123' } })
    const content = res.content as { type: string; mimeType?: string; text?: string }[]
    expect(content[0]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' })
    expect(content[1]?.text).toContain('C:\\x.png')
  })

  it('meldet Fehler als Werkzeug-Fehler statt abzustürzen', async () => {
    const res = await client.callTool({ name: 'job_get', arguments: { id: 'x' } })
    expect(res.isError).toBe(true)
    expect(JSON.stringify(res.content)).toContain('Unknown method')
  })
})
