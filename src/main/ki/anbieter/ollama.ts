import { readFile } from 'node:fs/promises'
import type { JobContext } from '../../jobs/queue'
import { t } from '../../i18n'
import type { KiAnbieter, KiFaehigkeiten, KiStatus, RohAnfrage, RohAntwort } from '../typen'

/**
 * Ollama lokal (http://127.0.0.1:11434): eigene Schnittstelle mit strukturierter Ausgabe (`format` = JSON-Schema) und
 * Bildern als base64. Ob das Modell Bilder sehen kann, meldet `/api/show` unter „capabilities“.
 */
export class Ollama implements KiAnbieter {
  readonly id = 'ollama'
  readonly art = 'lokal' as const
  faehigkeiten: KiFaehigkeiten = { text: true, bilderSehen: true, werkzeuge: false, jsonSchema: true, lange: false }
  private gewaehlt: string | null = null

  constructor(
    private readonly modell: () => Promise<string | null>,
    private readonly basis = 'http://127.0.0.1:11434',
    private readonly holen: typeof fetch = fetch
  ) {}

  async pruefe(): Promise<KiStatus> {
    let modelle: string[]
    try {
      const r = await this.holen(`${this.basis}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (!r.ok) throw new Error(String(r.status))
      modelle = ((await r.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? []
    } catch {
      return { installiert: false, bereit: false, hinweis: t('ki.lokalAus', { name: 'Ollama', url: this.basis }) }
    }
    this.gewaehlt = (await this.modell()) ?? modelle[0] ?? null
    if (!this.gewaehlt) return { installiert: true, bereit: false, hinweis: t('ki.keinModell', { name: 'Ollama' }), modelle }
    try {
      const r = await this.holen(`${this.basis}/api/show`, { method: 'POST', body: JSON.stringify({ model: this.gewaehlt }), signal: AbortSignal.timeout(3000) })
      const cap = ((await r.json()) as { capabilities?: string[] }).capabilities ?? []
      this.faehigkeiten = { ...this.faehigkeiten, bilderSehen: cap.includes('vision') }
    } catch {
      this.faehigkeiten = { ...this.faehigkeiten, bilderSehen: false }
    }
    return { installiert: true, bereit: true, hinweis: null, modelle }
  }

  async frage(a: RohAnfrage, ctx?: JobContext<unknown>): Promise<RohAntwort> {
    const model = this.gewaehlt ?? (await this.modell())
    if (!model) throw new Error(t('ki.keinModell', { name: 'Ollama' }))
    const images = await Promise.all(a.bilder.map(async (p) => (await readFile(p)).toString('base64')))
    const r = await this.holen(`${this.basis}/api/chat`, {
      method: 'POST',
      signal: ctx?.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: a.schema,
        options: { num_predict: a.maxAusgabe },
        messages: [
          { role: 'system', content: a.system },
          { role: 'user', content: a.prompt, ...(images.length ? { images } : {}) }
        ]
      })
    })
    if (!r.ok) throw new Error(`${t('ki.antwortFehler', { name: 'Ollama', status: r.status })} ${(await r.text()).slice(0, 300)}`)
    const d = (await r.json()) as { model?: string; message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }
    return { text: d.message?.content ?? '', modell: d.model ?? model, nutzung: { eingabe: d.prompt_eval_count ?? 0, ausgabe: d.eval_count ?? 0 } }
  }
}
