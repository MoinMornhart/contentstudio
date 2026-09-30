import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { ChecksumError } from '../../src/main/tools/download'
import { ToolManager } from '../../src/main/tools/manager'
import { BLENDER_PRIMARY, FFMPEG, UV, findChecksum, type ToolSpec } from '../../src/main/tools/specs'

describe('findChecksum', () => {
  const hash = 'a'.repeat(64)
  it('liest Blender-/BtbN-Format und Einzel-Hash-Dateien', () => {
    expect(findChecksum(`${'b'.repeat(64)}  other.zip\n${hash}  blender-5.2.2-windows-x64.zip\n`, 'blender-5.2.2-windows-x64.zip')).toBe(hash)
    expect(findChecksum(`${hash} *ffmpeg.zip`, 'ffmpeg.zip')).toBe(hash)
    expect(findChecksum(`${hash}\n`, 'uv.zip')).toBe(hash)
    expect(findChecksum(`${hash}  andere.zip`, 'uv.zip')).toBeNull()
  })
})

describe('Werkzeug-Definitionen', () => {
  it('nutzen offizielle HTTPS-Quellen und kurze Installationspfade', () => {
    for (const spec of [BLENDER_PRIMARY, FFMPEG, UV]) {
      expect(spec.url).toMatch(/^https:\/\/(download\.blender\.org|github\.com)\//)
      expect(spec.checksumUrl).toMatch(/^https:\/\//)
      expect(spec.dir.length).toBeLessThan(20)
    }
    expect(BLENDER_PRIMARY.url).toBe('https://download.blender.org/release/Blender5.2/blender-5.2.2-windows-x64.zip')
  })
})

describe('ToolManager (mit lokalem Testserver)', () => {
  let server: Server
  let base: string
  let work: string
  const files = new Map<string, Buffer>()

  beforeAll(async () => {
    work = await mkdtemp(join(tmpdir(), 'cs-tools-'))
    // Test-ZIP mit einem Oberordner wie bei Blender: tool-1.0/bin/tool.exe
    const src = join(work, 'src')
    await mkdir(join(src, 'tool-1.0', 'bin'), { recursive: true })
    await writeFile(join(src, 'tool-1.0', 'bin', 'tool.exe'), 'fake exe')
    await writeFile(join(src, 'tool-1.0', 'readme.txt'), 'hallo')
    const zip = join(work, 'tool-1.0.zip')
    execFileSync(join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-cf', zip, '-C', src, 'tool-1.0'])
    const data = await readFile(zip)
    const sha = createHash('sha256').update(data).digest('hex')
    files.set('/tool-1.0.zip', data)
    files.set('/sums.sha256', Buffer.from(`${sha}  tool-1.0.zip\n`))
    files.set('/bad.sha256', Buffer.from(`${'0'.repeat(64)}  tool-1.0.zip\n`))

    server = createServer((req, res) => {
      const body = files.get(req.url ?? '')
      if (!body) return void res.writeHead(404).end()
      res.writeHead(200, { 'Content-Length': body.length }).end(body)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    server.close()
    await rm(work, { recursive: true, force: true })
  })

  const spec = (checksum: string): ToolSpec => ({
    id: 'ffmpeg',
    label: 'Testwerkzeug',
    version: '1.0',
    url: `${base}/tool-1.0.zip`,
    file: 'tool-1.0.zip',
    checksumUrl: `${base}/${checksum}`,
    sizeBytes: 1000,
    installedBytes: 1000,
    dir: 'tool\\1.0',
    exe: 'bin\\tool.exe'
  })

  it('lädt, prüft, entpackt (ohne Oberordner) und merkt sich die Installation', async () => {
    const root = join(work, 'root-ok')
    const mgr = new ToolManager(root)
    mgr.freeBytes = async (): Promise<number> => 50e9 // unabhängig vom echten freien Speicher
    const phases: string[] = []
    const exe = await mgr.install(spec('sums.sha256'), (p) => phases.push(p.phase))
    expect(exe).toBe(join(root, 'tool', '1.0', 'bin', 'tool.exe'))
    expect(await readFile(exe, 'utf8')).toBe('fake exe')
    expect(phases[0]).toBe('check')
    expect(phases).toContain('extract')
    expect(phases.at(-1)).toBe('done')
    expect(await mgr.exePath(spec('sums.sha256'))).toBe(exe)
    expect(await readdir(join(root, 'downloads'))).toEqual([]) // ZIP wird nach dem Entpacken gelöscht
    // Zweiter Aufruf lädt nichts neu
    const again: string[] = []
    await mgr.install(spec('sums.sha256'), (p) => again.push(p.phase))
    expect(again).toEqual(['check', 'done'])
  })

  it('bricht bei falscher Prüfsumme ab und hinterlässt nichts', async () => {
    const root = join(work, 'root-bad')
    const mgr = new ToolManager(root)
    mgr.freeBytes = async (): Promise<number> => 50e9 // unabhängig vom echten freien Speicher
    await expect(mgr.install(spec('bad.sha256'))).rejects.toBeInstanceOf(ChecksumError)
    expect(await readdir(join(root, 'downloads'))).toEqual([])
    expect(await mgr.exePath(spec('bad.sha256'))).toBeNull()
  })

  it('deinstalliert sauber', async () => {
    const root = join(work, 'root-un')
    const mgr = new ToolManager(root)
    mgr.freeBytes = async (): Promise<number> => 50e9 // unabhängig vom echten freien Speicher
    await mgr.install(spec('sums.sha256'))
    await mgr.uninstall(spec('sums.sha256'))
    expect(await mgr.exePath(spec('sums.sha256'))).toBeNull()
    expect(await mgr.installed()).toEqual({})
  })
})
