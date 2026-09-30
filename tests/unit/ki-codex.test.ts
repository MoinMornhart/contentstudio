import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CodexCli, codexArgs, codexLimit, codexUmgebung } from '../../src/main/ki/anbieter/codex-cli'
import { KiLimitFehler } from '../../src/main/ki/typen'

const FAKE = resolve(__dirname, '../fixtures/codex.cmd')
const anfrage = { system: 'Sys', prompt: 'Gib Ideen', bilder: [], schema: { type: 'object' }, stufe: 'stark' as const, maxAusgabe: 500 }

describe('Codex-CLI (ChatGPT-Abo)', () => {
  afterEach(() => {
    delete process.env['FAKE_CODEX_LOGIN']
    delete process.env['FAKE_CODEX_LIMIT']
    delete process.env['OPENAI_API_KEY']
  })

  it('entfernt API-Schlüssel und fremde Server aus der Umgebung', () => {
    expect(codexUmgebung({ OPENAI_API_KEY: 'x', codex_api_key: 'y', OPENAI_BASE_URL: 'z', PATH: 'p' })).toEqual({ PATH: 'p' })
  })

  it('nur lesende Sandbox, keine Sitzungsdateien, nie ein Sandbox-Umgehen', () => {
    const a = codexArgs({ arbeitsordner: 'arbeit', schema: 's.json', ausgabe: 'o.txt', modell: null, bilder: ['b.png'] })
    expect(a).toEqual(expect.arrayContaining(['--sandbox', 'read-only', '--ephemeral', '--json', '--output-schema', '-i', 'b.png']))
    expect(a.join(' ')).not.toMatch(/danger|bypass|full-auto|yolo/)
  })

  it('erkennt die Anmeldung per ChatGPT, per Schlüssel oder keine', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-codex-'))
    const c = new CodexCli(dir, async () => null, async () => FAKE)
    expect(await c.pruefe()).toMatchObject({ bereit: true })
    process.env['FAKE_CODEX_LOGIN'] = 'apikey'
    expect(await c.pruefe()).toMatchObject({ bereit: false, hinweis: expect.stringContaining('ChatGPT') })
    process.env['FAKE_CODEX_LOGIN'] = 'none'
    expect(await c.pruefe()).toMatchObject({ bereit: false, hinweis: expect.stringContaining('codex login') })
  }, 30_000)

  it('liefert die Antwort aus der Ausgabedatei, ohne API-Schlüssel im Kindprozess, und räumt auf', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-codex-'))
    process.env['OPENAI_API_KEY'] = 'sk-sollte-nicht-ankommen'
    const c = new CodexCli(dir, async () => null, async () => FAKE)
    const r = await c.frage(anfrage)
    expect(r.text).toBe('{"ideen":[{"titel":"Aus Codex"}]}')
    expect(r.nutzung).toEqual({ eingabe: 30, ausgabe: 8 })
    expect(await readdir(dir)).toEqual([])
  }, 30_000)

  it('Nutzungslimit wird zum Limit-Fehler mit Reset-Zeit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-codex-'))
    process.env['FAKE_CODEX_LIMIT'] = '1'
    const f = await new CodexCli(dir, async () => null, async () => FAKE).frage(anfrage).catch((e: unknown) => e)
    expect(f).toBeInstanceOf(KiLimitFehler)
    expect((f as KiLimitFehler).resetAt!.getTime()).toBeGreaterThan(Date.now() + 2 * 3600_000)
  }, 30_000)

  it('liest Reset-Angaben aus Meldungen', () => {
    const jetzt = new Date(2026, 8, 30, 12, 0)
    expect(codexLimit('Usage limit reached. Try again in 45 minutes', jetzt)!.resetAt!.getTime()).toBe(jetzt.getTime() + 45 * 60_000)
    expect(codexLimit('You hit the rate limit, try again at 3:15 pm', jetzt)!.resetAt!.getHours()).toBe(15)
    expect(codexLimit('alles gut', jetzt)).toBeNull()
  })
})

