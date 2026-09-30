import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { JobContext } from '../../jobs/queue'
import { t } from '../../i18n'
import type { Preis } from '../kosten'
import { ohneSchluessel } from '../schluessel'
import { retryAfter } from './openai-kompatibel'
import { KiLimitFehler, type KiAnbieter, type KiStatus, type RohAnfrage, type RohAntwort } from '../typen'

const BASIS = 'https://generativelanguage.googleapis.com/v1beta'
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/** Neuestes Gemini-Pro-Modell aus der Liste (stabile Versionen vor Vorschauen), sonst neuestes Flash */
export function waehleGemini(namen: string[]): string | null {
  const ids = namen.map((n) => n.replace(/^models\//, '')).filter((n) => /^gemini-\d/.test(n) && !/(embedding|tts|image|live|audio|lite)/.test(n))
  const rang = (n: string): number[] => {
    const v = /^gemini-(\d+)(?:\.(\d+))?/.exec(n)?.slice(1).map((x) => Number(x ?? 0)) ?? [0, 0]
    return [n.includes('-pro') ? 1 : 0, v[0] ?? 0, v[1] ?? 0, /preview|exp/.test(n) ? 0 : 1]
  }
  return ids.sort((a, b) => {
    const ra = rang(a)
    const rb = rang(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i]! - ra[i]!
    return a.length - b.length
  })[0] ?? null
}

/** Gemini über den eigenen API-Schlüssel des Nutzers (Google AI Studio). Schlüssel im Kopf, nie in der URL. */
export class GoogleApi implements KiAnbieter {
  readonly id = 'api-google'
  readonly art = 'api' as const
  readonly faehigkeiten = { text: true, bilderSehen: true, werkzeuge: false, jsonSchema: true, lange: true }
  private gewaehlt: string | null = null

  constructor(
    private readonly schluessel: () => Promise<string | null>,
    private readonly modell: () => Promise<string | null>,
    private readonly preisFuer: (modell: string) => Promise<Preis | null>,
    private readonly holen: typeof fetch = fetch
  ) {}

  async pruefe(): Promise<KiStatus> {
    const key = await this.schluessel()
    if (!key) return { installiert: false, bereit: false, hinweis: t('ki.schluesselFehlt') }
    try {
      const r = await this.holen(`${BASIS}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(6000) })
      if (r.status === 400 || r.status === 401 || r.status === 403) return { installiert: true, bereit: false, hinweis: t('ki.schluesselFalsch') }
      const namen = ((await r.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? []
      this.gewaehlt = (await this.modell()) ?? waehleGemini(namen)
      return this.gewaehlt ? { installiert: true, bereit: true, hinweis: null, modelle: namen.map((n) => n.replace(/^models\//, '')) } : { installiert: true, bereit: false, hinweis: t('ki.keinModell', { name: 'Gemini' }) }
    } catch {
      return { installiert: true, bereit: false, hinweis: t('ki.antwortFehler', { name: 'Gemini', status: '–' }) }
    }
  }

  async preis(): Promise<Preis | null> {
    const m = this.gewaehlt ?? (await this.modell())
    return m ? this.preisFuer(`google/${m}`) : null
  }

  async frage(a: RohAnfrage, ctx?: JobContext<unknown>): Promise<RohAntwort> {
    const key = await this.schluessel()
    const model = this.gewaehlt ?? (await this.modell())
    if (!key) throw new Error(t('ki.schluesselFehlt'))
    if (!model) throw new Error(t('ki.keinModell', { name: 'Gemini' }))
    const bilder = await Promise.all(a.bilder.map(async (p) => ({ inline_data: { mime_type: MIME[extname(p).toLowerCase()] ?? 'image/png', data: (await readFile(p)).toString('base64') } })))
    const senden = (mitSchema: boolean): Promise<Response> =>
      this.holen(`${BASIS}/models/${model}:generateContent`, {
        method: 'POST',
        signal: ctx?.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: a.system }] },
          contents: [{ role: 'user', parts: [...bilder, { text: a.prompt }] }],
          generationConfig: { maxOutputTokens: a.maxAusgabe, responseMimeType: 'application/json', ...(mitSchema ? { responseJsonSchema: a.schema } : {}) }
        })
      })
    let r = await senden(true)
    if (r.status === 400) r = await senden(false)
    if (r.status === 429) throw new KiLimitFehler(this.id, retryAfter(r.headers), t('ki.limit', { anbieter: 'Gemini' }))
    if (r.status === 401 || r.status === 403) throw new Error(t('ki.schluesselFalsch'))
    if (!r.ok) throw new Error(ohneSchluessel(`${t('ki.antwortFehler', { name: 'Gemini', status: r.status })} ${(await r.text()).slice(0, 300)}`))
    const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; modelVersion?: string }
    const c = d.candidates?.[0]
    if (!c || c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') throw new Error(t('ki.abgelehnt'))
    return {
      text: (c.content?.parts ?? []).map((p) => p.text ?? '').join(''),
      modell: d.modelVersion ?? model,
      nutzung: d.usageMetadata ? { eingabe: d.usageMetadata.promptTokenCount ?? 0, ausgabe: d.usageMetadata.candidatesTokenCount ?? 0 } : null
    }
  }
}
