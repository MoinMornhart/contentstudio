import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { JobContext } from '../../jobs/queue'
import { t } from '../../i18n'
import type { Preis } from '../kosten'
import { ohneSchluessel } from '../schluessel'
import { KiLimitFehler, type KiAnbieter, type KiArt, type KiFaehigkeiten, type KiStatus, type RohAnfrage, type RohAntwort } from '../typen'

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

export async function bildAlsDataUrl(pfad: string): Promise<string> {
  return `data:${MIME[extname(pfad).toLowerCase()] ?? 'image/png'};base64,${(await readFile(pfad)).toString('base64')}`
}

/** Sekunden aus „retry-after“ als Zeitpunkt */
export function retryAfter(h: Headers, jetzt = Date.now()): Date | null {
  const sek = Number(h.get('retry-after'))
  return Number.isFinite(sek) && sek > 0 ? new Date(jetzt + sek * 1000) : null
}

export interface OpenAiKonfig {
  id: string
  art: KiArt
  /** Anzeigename für Meldungen, z. B. „LM Studio“ */
  name: string
  /** Basis-URL inklusive /v1 */
  basis: string
  /** API-Schlüssel (null = lokal ohne Schlüssel) */
  schluessel: () => Promise<string | null>
  /** Gewähltes Modell (null = automatisch) */
  modell: () => Promise<string | null>
  /** Modell automatisch aus der Liste wählen */
  waehle?: (ids: string[]) => string | null
  /** Standardmodell, falls die Liste leer oder nicht abrufbar ist */
  standard?: string
  /** Preis je Modell (nur API) */
  preisFuer?: (modell: string) => Promise<Preis | null>
  /** Kann das Modell Bilder sehen? (lokal: wird nachgeschlagen) */
  bilder?: (modell: string) => Promise<boolean>
  /** Neue OpenAI-Modelle erwarten max_completion_tokens statt max_tokens */
  maxCompletionTokens?: boolean
  /** Zusätzliche Kopfzeilen (z. B. OpenRouter: Herkunft der App) */
  kopf?: Record<string, string>
  holen?: typeof fetch
}

/**
 * Anbieter mit OpenAI-kompatibler Schnittstelle (`/v1/models`, `/v1/chat/completions`): OpenAI und OpenRouter mit
 * eigenem Schlüssel, LM Studio und llama.cpp lokal. Strukturierte Ausgabe über `response_format: json_schema`; wer das
 * nicht kann, liefert trotzdem Text, den die Schicht prüft und reparieren lässt.
 */
export class OpenAiKompatibel implements KiAnbieter {
  readonly id: string
  readonly art: KiArt
  faehigkeiten: KiFaehigkeiten = { text: true, bilderSehen: true, werkzeuge: false, jsonSchema: true, lange: true }
  private gewaehlt: string | null = null

  constructor(private readonly k: OpenAiKonfig) {
    this.id = k.id
    this.art = k.art
    if (k.art === 'lokal') this.faehigkeiten = { ...this.faehigkeiten, lange: false }
  }

  private get holen(): typeof fetch {
    return this.k.holen ?? fetch
  }

  private async kopf(): Promise<Record<string, string>> {
    const s = await this.k.schluessel()
    return { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s}` } : {}), ...this.k.kopf }
  }

  async pruefe(): Promise<KiStatus> {
    if (this.k.art === 'api' && !(await this.k.schluessel())) return { installiert: false, bereit: false, hinweis: t('ki.schluesselFehlt') }
    let ids: string[]
    try {
      const r = await this.holen(`${this.k.basis}/models`, { headers: await this.kopf(), signal: AbortSignal.timeout(4000) })
      if (r.status === 401 || r.status === 403) return { installiert: true, bereit: false, hinweis: t('ki.schluesselFalsch') }
      if (!r.ok) return { installiert: true, bereit: false, hinweis: t('ki.antwortFehler', { name: this.k.name, status: r.status }) }
      ids = ((await r.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? []
    } catch {
      if (this.k.art === 'lokal') return { installiert: false, bereit: false, hinweis: t('ki.lokalAus', { name: this.k.name, url: this.k.basis }) }
      return { installiert: true, bereit: false, hinweis: t('ki.antwortFehler', { name: this.k.name, status: '–' }) }
    }
    const wunsch = await this.k.modell()
    this.gewaehlt = wunsch ?? this.k.waehle?.(ids) ?? ids[0] ?? this.k.standard ?? null
    if (!this.gewaehlt) return { installiert: true, bereit: false, hinweis: t('ki.keinModell', { name: this.k.name }), modelle: ids }
    if (this.k.bilder) this.faehigkeiten = { ...this.faehigkeiten, bilderSehen: await this.k.bilder(this.gewaehlt).catch(() => false) }
    return { installiert: true, bereit: true, hinweis: null, modelle: ids }
  }

  async preis(): Promise<Preis | null> {
    const m = this.gewaehlt ?? (await this.k.modell()) ?? this.k.standard
    return m && this.k.preisFuer ? this.k.preisFuer(m) : null
  }

  async frage(a: RohAnfrage, ctx?: JobContext<unknown>): Promise<RohAntwort> {
    const model = this.gewaehlt ?? (await this.k.modell()) ?? this.k.standard
    if (!model) throw new Error(t('ki.keinModell', { name: this.k.name }))
    const inhalt = [{ type: 'text', text: a.prompt }, ...(await Promise.all(a.bilder.map(async (p) => ({ type: 'image_url', image_url: { url: await bildAlsDataUrl(p) } }))))]
    const koerper = (mitSchema: boolean): string =>
      JSON.stringify({
        model,
        messages: [
          { role: 'system', content: a.system },
          { role: 'user', content: a.bilder.length ? inhalt : a.prompt }
        ],
        ...(this.k.maxCompletionTokens ? { max_completion_tokens: a.maxAusgabe } : { max_tokens: a.maxAusgabe }),
        ...(mitSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'antwort', schema: a.schema } } } : {})
      })
    const senden = async (mitSchema: boolean): Promise<Response> =>
      this.holen(`${this.k.basis}/chat/completions`, { method: 'POST', headers: await this.kopf(), body: koerper(mitSchema), signal: ctx?.signal })
    let r = await senden(true)
    // Manche Server/Modelle kennen json_schema nicht: dann ohne, die Schicht prüft und repariert
    if (r.status === 400) r = await senden(false)
    if (r.status === 429) throw new KiLimitFehler(this.id, retryAfter(r.headers), t('ki.limit', { anbieter: this.k.name }))
    if (r.status === 401 || r.status === 403) throw new Error(t('ki.schluesselFalsch'))
    if (!r.ok) throw new Error(ohneSchluessel(`${t('ki.antwortFehler', { name: this.k.name, status: r.status })} ${(await r.text()).slice(0, 300)}`))
    const d = (await r.json()) as { model?: string; choices?: { message?: { content?: string | null; refusal?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    const nachricht = d.choices?.[0]?.message
    if (nachricht?.refusal) throw new Error(t('ki.abgelehnt'))
    return {
      text: nachricht?.content ?? '',
      modell: d.model ?? model,
      nutzung: d.usage ? { eingabe: d.usage.prompt_tokens ?? 0, ausgabe: d.usage.completion_tokens ?? 0 } : null
    }
  }
}

/**
 * Neuestes allgemeines Chat-Modell aus der OpenAI-Liste (keine Audio-, Bild-, Such- oder Mini-Varianten). Liefert null,
 * wenn nichts passt; dann wählt der Nutzer in den Einstellungen.
 */
export function waehleOpenAi(ids: string[]): string | null {
  const passend = ids.filter((id) => /^gpt-\d/.test(id) && !/(mini|nano|audio|realtime|image|search|transcribe|tts|codex|instruct)/.test(id) && !/-\d{4}-\d{2}-\d{2}$/.test(id))
  const version = (id: string): number[] => (/^gpt-(\d+)(?:\.(\d+))?/.exec(id)?.slice(1) ?? []).map((x) => Number(x ?? 0))
  return passend.sort((x, y) => {
    const [a1 = 0, a2 = 0] = version(x)
    const [b1 = 0, b2 = 0] = version(y)
    return b1 - a1 || b2 - a2 || x.length - y.length
  })[0] ?? null
}
