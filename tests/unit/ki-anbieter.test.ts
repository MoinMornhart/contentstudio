import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AnthropicApi, resetAusHeadern } from '../../src/main/ki/anbieter/anthropic-api'
import { GoogleApi, waehleGemini } from '../../src/main/ki/anbieter/google-api'
import { Ollama } from '../../src/main/ki/anbieter/ollama'
import { OpenAiKompatibel, waehleOpenAi } from '../../src/main/ki/anbieter/openai-kompatibel'
import { KostenBuch, kostenSchaetzung, PreisListe, tokenSchaetzung } from '../../src/main/ki/kosten'
import { ohneSchluessel, SchluesselSpeicher, type Tresor } from '../../src/main/ki/schluessel'
import { KiLimitFehler, type RohAnfrage } from '../../src/main/ki/typen'

const anfrage = (extra: Partial<RohAnfrage> = {}): RohAnfrage => ({ system: 'S', prompt: 'P', bilder: [], schema: { type: 'object' }, stufe: 'stark', maxAusgabe: 1000, ...extra })

type Aufruf = { url: string; init?: RequestInit; body?: Record<string, unknown> }
/** Nachgebauter Server: Antwort je URL-Teil; merkt sich alle Aufrufe */
function server(antworten: [RegExp, (a: Aufruf) => Response][]) {
  const aufrufe: Aufruf[] = []
  const holen = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url instanceof Request ? url.url : url)
    const a: Aufruf = { url: u, init, body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined }
    aufrufe.push(a)
    const treffer = antworten.find(([re]) => re.test(u))
    if (!treffer) throw new TypeError('fetch failed')
    return treffer[1](a)
  }) as typeof fetch
  return { holen, aufrufe }
}

const tresor: Tresor = {
  verfuegbar: () => true,
  verschluesseln: (s) => Buffer.from(s.split('').reverse().join('')),
  entschluesseln: (b) => b.toString().split('').reverse().join('')
}

describe('Schlüssel', () => {
  it('speichert nur verschlüsselt und nie im Klartext', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-schluessel-'))
    const s = new SchluesselSpeicher(dir, tresor)
    // Test-Wert erst zur Laufzeit zusammensetzen, damit der Secret-Scan ihn nicht für einen echten Schlüssel hält
    const falsch = ['sk', 'proj', 'GEHEIM'.repeat(3)].join('-')
    await s.setze('api-openai', falsch)
    expect(await readFile(join(dir, 'ki-schluessel.json'), 'utf8')).not.toContain('GEHEIM')
    expect(await s.hole('api-openai')).toBe(falsch)
    await s.setze('api-openai', null)
    expect(await s.hat('api-openai')).toBe(false)
  })

  it('verweigert das Speichern ohne Verschlüsselung', async () => {
    const s = new SchluesselSpeicher(await mkdtemp(join(tmpdir(), 'cs-schluessel-')), { ...tresor, verfuegbar: () => false })
    await expect(s.setze('api-anthropic', 'sk-ant-xyz')).rejects.toThrow(/Verschlüsselung/)
  })

  it('schwärzt Schlüssel in Texten für Protokolle und Fehler', () => {
    const x = 'abcdefghijklmnopqrstu'
    const text = `x-api-key: sk-ant-api03-${x}, Bearer sk-proj-${x}, ?key=AIza${x}${x}&x=1`
    const sauber = ohneSchluessel(text)
    expect(sauber).not.toMatch(/abcdefghijklmnop|AIzaSyA1234/)
  })
})

describe('Kosten', () => {
  it('schätzt Tokens und Kosten; unbekannter Preis bleibt unbekannt', () => {
    expect(tokenSchaetzung({ system: 'x'.repeat(350), prompt: '', schema: {}, bilder: ['a.png'] })).toBe(Math.ceil(352 / 3.5) + 1600)
    expect(kostenSchaetzung(anfrage(), null)).toBeNull()
    expect(kostenSchaetzung(anfrage(), { eingabe: 4, ausgabe: 20 })).toBeGreaterThan(0)
  })

  it('führt eine Monatssumme', async () => {
    const buch = new KostenBuch(await mkdtemp(join(tmpdir(), 'cs-kosten-')))
    const sept = new Date(2026, 8, 30)
    await buch.buche(0.012, sept)
    expect(await buch.buche(0.003, sept)).toBe(0.015)
    expect(await buch.summe(new Date(2026, 9, 1))).toBe(0)
  })

  it('liest Preise aus der öffentlichen OpenRouter-Liste und speichert sie eine Woche', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-preise-'))
    const { holen, aufrufe } = server([[/openrouter\.ai\/api\/v1\/models/, () => Response.json({ data: [{ id: 'google/gemini-9-pro', pricing: { prompt: '0.000002', completion: '0.000012' } }] })]])
    expect(await new PreisListe(dir, holen).preis('google/gemini-9-pro')).toEqual({ eingabe: 2, ausgabe: 12 })
    expect(await new PreisListe(dir, holen).preis('google/gemini-9-pro')).toEqual({ eingabe: 2, ausgabe: 12 })
    expect(aufrufe).toHaveLength(1)
  })
})

describe('OpenAI-kompatibel (OpenAI, OpenRouter, LM Studio, llama.cpp)', () => {
  it('lokal ohne laufenden Server: verständlicher Hinweis statt Fehler', async () => {
    const a = new OpenAiKompatibel({ id: 'lmstudio', art: 'lokal', name: 'LM Studio', basis: 'http://127.0.0.1:1234/v1', schluessel: async () => null, modell: async () => null, holen: server([]).holen })
    expect(await a.pruefe()).toMatchObject({ installiert: false, bereit: false, hinweis: expect.stringContaining('LM Studio') })
  })

  it('wählt das Modell, sendet json_schema und weicht bei 400 auf reinen Text aus', async () => {
    let versuch = 0
    const { holen, aufrufe } = server([
      [/\/models$/, () => Response.json({ data: [{ id: 'qwen-vl' }, { id: 'llama' }] })],
      [/chat\/completions/, () => (++versuch === 1 ? new Response('bad', { status: 400 }) : Response.json({ model: 'qwen-vl', choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }))]
    ])
    const a = new OpenAiKompatibel({ id: 'lmstudio', art: 'lokal', name: 'LM Studio', basis: 'http://x/v1', schluessel: async () => null, modell: async () => null, holen, bilder: async (m) => m.includes('vl') })
    expect((await a.pruefe()).bereit).toBe(true)
    expect(a.faehigkeiten.bilderSehen).toBe(true)
    const r = await a.frage(anfrage())
    expect(r).toEqual({ text: '{"ok":true}', modell: 'qwen-vl', nutzung: { eingabe: 7, ausgabe: 3 } })
    const chats = aufrufe.filter((x) => x.url.includes('chat'))
    expect(chats[0]!.body!['response_format']).toMatchObject({ type: 'json_schema' })
    expect(chats[1]!.body!['response_format']).toBeUndefined()
  })

  it('API: Schlüssel im Kopf, 429 wird zum Limit mit Reset-Zeit', async () => {
    const { holen, aufrufe } = server([
      [/\/models$/, () => Response.json({ data: [{ id: 'gpt-7' }] })],
      [/chat\/completions/, () => new Response('slow down', { status: 429, headers: { 'retry-after': '30' } })]
    ])
    const a = new OpenAiKompatibel({ id: 'api-openai', art: 'api', name: 'OpenAI', basis: 'https://api.openai.com/v1', schluessel: async () => 'sk-test', modell: async () => null, waehle: waehleOpenAi, holen, maxCompletionTokens: true })
    await a.pruefe()
    const fehler = await a.frage(anfrage()).catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(KiLimitFehler)
    expect((fehler as KiLimitFehler).resetAt!.getTime()).toBeGreaterThan(Date.now() + 25_000)
    expect(new Headers(aufrufe[0]!.init!.headers).get('authorization')).toBe('Bearer sk-test')
    expect(aufrufe[1]!.body!['max_completion_tokens']).toBe(1000)
  })

  it('wählt das neueste allgemeine OpenAI-Modell', () => {
    expect(waehleOpenAi(['gpt-4.1', 'gpt-5-mini', 'gpt-5.2', 'gpt-5.2-2026-01-01', 'gpt-5', 'gpt-realtime', 'o3'])).toBe('gpt-5.2')
    expect(waehleOpenAi(['o3'])).toBeNull()
  })
})

describe('Ollama', () => {
  it('liest Modelle und Bildfähigkeit, sendet Schema als format', async () => {
    const { holen, aufrufe } = server([
      [/api\/tags/, () => Response.json({ models: [{ name: 'llava:13b' }] })],
      [/api\/show/, () => Response.json({ capabilities: ['completion', 'vision'] })],
      [/api\/chat/, () => Response.json({ model: 'llava:13b', message: { content: '{"a":1}' }, prompt_eval_count: 12, eval_count: 4 })]
    ])
    const o = new Ollama(async () => null, 'http://o', holen)
    expect((await o.pruefe()).bereit).toBe(true)
    expect(o.faehigkeiten.bilderSehen).toBe(true)
    const dir = await mkdtemp(join(tmpdir(), 'cs-bild-'))
    await writeFile(join(dir, 'b.png'), Buffer.from([1, 2, 3]))
    const r = await o.frage(anfrage({ bilder: [join(dir, 'b.png')] }))
    expect(r.text).toBe('{"a":1}')
    const chat = aufrufe.find((a) => a.url.includes('api/chat'))!.body!
    expect(chat['format']).toEqual({ type: 'object' })
    expect((chat['messages'] as { images?: string[] }[])[1]!.images).toEqual(['AQID'])
  })

  it('nicht gestartet → Hinweis', async () => {
    expect(await new Ollama(async () => null, 'http://o', server([]).holen).pruefe()).toMatchObject({ installiert: false, bereit: false })
  })
})

describe('Google Gemini', () => {
  it('wählt ein stabiles Pro-Modell und schickt den Schlüssel im Kopf statt in der URL', async () => {
    expect(waehleGemini(['models/gemini-3-flash', 'models/gemini-3-pro-preview', 'models/gemini-3-pro', 'models/text-embedding-004'])).toBe('gemini-3-pro')
    const { holen, aufrufe } = server([
      [/\/models\?/, () => Response.json({ models: [{ name: 'models/gemini-3-pro' }] })],
      [/generateContent/, () => Response.json({ candidates: [{ content: { parts: [{ text: '{"x":2}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } })]
    ])
    const g = new GoogleApi(async () => 'AIzaTEST', async () => null, async () => null, holen)
    expect((await g.pruefe()).bereit).toBe(true)
    expect((await g.frage(anfrage())).text).toBe('{"x":2}')
    for (const a of aufrufe) expect(a.url).not.toContain('AIza')
    expect((aufrufe[1]!.body!['generationConfig'] as Record<string, unknown>)['responseJsonSchema']).toEqual({ type: 'object' })
  })
})

describe('Anthropic API (offizielles SDK)', () => {
  it('sendet strukturierte Ausgabe, Aufwand und serverseitigen Rückfall; liest Text und Nutzung', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-anthropic-'))
    const speicher = new SchluesselSpeicher(dir, tresor)
    await speicher.setze('api-anthropic', 'sk-ant-test')
    const { holen, aufrufe } = server([
      [
        /\/v1\/messages/,
        () =>
          Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: '{"ok":1}' }], stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 6 } })
      ]
    ])
    const a = new AnthropicApi(speicher, async () => null, holen)
    expect((await a.pruefe()).bereit).toBe(true)
    expect(await a.preis()).toEqual({ eingabe: 4, ausgabe: 20 })
    const r = await a.frage(anfrage({ stufe: 'schnell' }))
    expect(r).toEqual({ text: '{"ok":1}', modell: 'claude-opus-5-5', nutzung: { eingabe: 20, ausgabe: 6 } })
    const body = aufrufe[0]!.body!
    expect(body['model']).toBe('claude-opus-5-5')
    expect(body['fallbacks']).toBe('default')
    expect(body['output_config']).toEqual({ effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } })
    expect(new Headers(aufrufe[0]!.init!.headers).get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
  })

  it('liest Reset-Zeiten aus retry-after oder den Ratelimit-Kopfzeilen', () => {
    expect(resetAusHeadern(new Headers({ 'retry-after': '10' }), 0)!.getTime()).toBe(10_000)
    expect(resetAusHeadern(new Headers({ 'anthropic-ratelimit-tokens-reset': '2026-09-30T18:00:00Z' }))!.toISOString()).toBe('2026-09-30T18:00:00.000Z')
    expect(resetAusHeadern(new Headers())).toBeNull()
  })
})
