import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { JobContext } from '../../jobs/queue'
import { t } from '../../i18n'
import { ANTHROPIC_PREISE, type Preis } from '../kosten'
import { ohneSchluessel, type SchluesselSpeicher } from '../schluessel'
import { KiLimitFehler, type KiAnbieter, type KiStatus, type RohAnfrage, type RohAntwort } from '../typen'

/** Standardmodell; der Nutzer kann in den Einstellungen ein anderes wählen (günstiger ist seine Entscheidung) */
export const ANTHROPIC_STANDARD = 'claude-opus-5-5'

const MEDIEN: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

/** Reset-Zeit aus „retry-after“ (Sekunden) oder dem Anthropic-Header „anthropic-ratelimit-*-reset“ (ISO) */
export function resetAusHeadern(h: Headers | undefined, jetzt = Date.now()): Date | null {
  if (!h) return null
  const sek = Number(h.get('retry-after'))
  if (Number.isFinite(sek) && sek > 0) return new Date(jetzt + sek * 1000)
  for (const name of ['anthropic-ratelimit-requests-reset', 'anthropic-ratelimit-tokens-reset', 'anthropic-ratelimit-input-tokens-reset']) {
    const v = h.get(name)
    if (v && !Number.isNaN(Date.parse(v))) return new Date(v)
  }
  return null
}

/**
 * Claude über den eigenen API-Schlüssel des Nutzers (offizielles SDK). Strukturierte Ausgabe über `output_config.format`,
 * Aufwand nach Stufe, serverseitiger Rückfall auf ein anderes Modell, wenn ein Sicherheitsfilter ablehnt.
 */
export class AnthropicApi implements KiAnbieter {
  readonly id = 'api-anthropic'
  readonly art = 'api' as const
  readonly faehigkeiten = { text: true, bilderSehen: true, werkzeuge: true, jsonSchema: true, lange: true }

  constructor(
    private readonly schluessel: SchluesselSpeicher,
    private readonly modell: () => Promise<string | null>,
    /** Nur für Tests: eigener fetch */
    private readonly holen?: typeof fetch
  ) {}

  async pruefe(): Promise<KiStatus> {
    const da = await this.schluessel.hat(this.id)
    return { installiert: da, bereit: da, hinweis: da ? null : t('ki.schluesselFehlt'), modelle: [(await this.modell()) ?? ANTHROPIC_STANDARD] }
  }

  async preis(): Promise<Preis | null> {
    return ANTHROPIC_PREISE[(await this.modell()) ?? ANTHROPIC_STANDARD] ?? null
  }

  async frage(a: RohAnfrage, ctx?: JobContext<unknown>): Promise<RohAntwort> {
    const apiKey = await this.schluessel.hole(this.id)
    if (!apiKey) throw new Error(t('ki.schluesselFehlt'))
    const client = new Anthropic({ apiKey, maxRetries: 2, ...(this.holen ? { fetch: this.holen } : {}) })
    const model = (await this.modell()) ?? ANTHROPIC_STANDARD
    const bilder = await Promise.all(
      a.bilder.map(async (p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: MEDIEN[extname(p).toLowerCase()] ?? 'image/png', data: (await readFile(p)).toString('base64') } }))
    )
    const anfrage = (mitSchema: boolean) =>
      client.beta.messages.create(
        {
          model,
          max_tokens: Math.max(a.maxAusgabe, 16000),
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: a.system,
          messages: [{ role: 'user', content: [...bilder, { type: 'text', text: a.prompt }] }],
          output_config: { effort: a.stufe === 'schnell' ? 'low' : 'high', ...(mitSchema ? { format: { type: 'json_schema', schema: a.schema } } : {}) }
        },
        { signal: ctx?.signal }
      )
    let antwort
    try {
      try {
        antwort = await anfrage(true)
      } catch (err) {
        // Nicht jedes Schema ist für strukturierte Ausgaben erlaubt: dann ohne Format, die Schicht prüft und repariert
        if (err instanceof Anthropic.BadRequestError && /schema|output_config|format/i.test(err.message)) antwort = await anfrage(false)
        else throw err
      }
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new KiLimitFehler(this.id, resetAusHeadern(err.headers), t('ki.limit', { anbieter: 'Anthropic API' }))
      if (err instanceof Anthropic.AuthenticationError) throw new Error(t('ki.schluesselFalsch'), { cause: err })
      if (err instanceof Anthropic.APIError) throw new Error(ohneSchluessel(`Anthropic ${err.status}: ${err.message}`), { cause: err })
      throw err
    }
    if (antwort.stop_reason === 'refusal') throw new Error(t('ki.abgelehnt'))
    const text = antwort.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return { text, modell: antwort.model, nutzung: { eingabe: antwort.usage.input_tokens, ausgabe: antwort.usage.output_tokens } }
  }
}
