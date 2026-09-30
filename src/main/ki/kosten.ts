import { join } from 'node:path'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import type { RohAnfrage } from './typen'

/** Preis in US-Dollar je 1 Million Tokens */
export interface Preis {
  eingabe: number
  ausgabe: number
}

/**
 * Anthropic-Listenpreise (Stand 2026-09-25, offizielle Referenz). Für OpenAI, Google und OpenRouter kommen die Preise aus
 * der öffentlichen Modellliste von OpenRouter (`/api/v1/models`, ohne Schlüssel), wöchentlich zwischengespeichert – so
 * veralten keine fest eingetragenen Zahlen. Unbekannter Preis = null (die App sagt dann „Kosten unbekannt“).
 */
export const ANTHROPIC_PREISE: Record<string, Preis> = {
  'claude-fable-5-1': { eingabe: 10, ausgabe: 50 },
  'claude-opus-5-5': { eingabe: 4, ausgabe: 20 },
  'claude-opus-5': { eingabe: 5, ausgabe: 25 },
  'claude-sonnet-5-5': { eingabe: 2, ausgabe: 10 },
  'claude-sonnet-5': { eingabe: 2, ausgabe: 10 },
  'claude-haiku-4-5': { eingabe: 1, ausgabe: 5 }
}

/** Grobe Tokenzahl: ca. 3,5 Zeichen je Token, je Bild ca. 1 600 Tokens (bis ~1,15 Megapixel) */
export function tokenSchaetzung(a: Pick<RohAnfrage, 'system' | 'prompt' | 'schema' | 'bilder'>): number {
  const zeichen = a.system.length + a.prompt.length + JSON.stringify(a.schema).length
  return Math.ceil(zeichen / 3.5) + a.bilder.length * 1600
}

/** Geschätzte Kosten: volle Eingabe plus die Hälfte der erlaubten Ausgabe (die meisten Antworten sind kürzer) */
export function kostenSchaetzung(a: RohAnfrage, preis: Preis | null): number | null {
  if (!preis) return null
  const ein = tokenSchaetzung(a)
  const aus = Math.ceil(a.maxAusgabe * 0.5)
  return Math.round(((ein * preis.eingabe + aus * preis.ausgabe) / 1e6) * 10000) / 10000
}

/** Tatsächliche Kosten aus der gemeldeten Nutzung */
export function kostenAusNutzung(nutzung: { eingabe: number; ausgabe: number }, preis: Preis | null): number | null {
  if (!preis) return null
  return Math.round(((nutzung.eingabe * preis.eingabe + nutzung.ausgabe * preis.ausgabe) / 1e6) * 10000) / 10000
}

const PreisCache = z.object({ abgerufen: z.string(), preise: z.record(z.string(), z.object({ eingabe: z.number(), ausgabe: z.number() })) })

/** Preise aus der öffentlichen OpenRouter-Modellliste (IDs wie „openai/gpt-…“, „google/gemini-…“) */
export class PreisListe {
  private preise: Record<string, Preis> | null = null
  constructor(
    private readonly ordner: string,
    private readonly holen: typeof fetch = fetch
  ) {}

  async preis(openRouterId: string): Promise<Preis | null> {
    if (!this.preise) this.preise = await this.laden()
    return this.preise[openRouterId] ?? null
  }

  private async laden(): Promise<Record<string, Preis>> {
    const datei = join(this.ordner, 'ki-preise.json')
    const cache = await readJson(datei, PreisCache)
    if (cache.ok && Date.now() - new Date(cache.value.abgerufen).getTime() < 7 * 86400_000) return cache.value.preise
    try {
      const r = await this.holen('https://openrouter.ai/api/v1/models')
      if (!r.ok) throw new Error(String(r.status))
      const daten = (await r.json()) as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] }
      const preise: Record<string, Preis> = {}
      for (const m of daten.data ?? []) {
        const ein = Number(m.pricing?.prompt)
        const aus = Number(m.pricing?.completion)
        if (Number.isFinite(ein) && Number.isFinite(aus) && ein >= 0 && aus >= 0) preise[m.id] = { eingabe: ein * 1e6, ausgabe: aus * 1e6 }
      }
      await writeJsonAtomic(datei, { abgerufen: new Date().toISOString(), preise })
      return preise
    } catch {
      // Ohne Netz: alter Stand, sonst unbekannt
      return cache.ok ? cache.value.preise : {}
    }
  }
}

const Buch = z.object({ monate: z.record(z.string(), z.number()) })

/** Monatssumme der API-Kosten (nur Schätzwerte der App, keine Abrechnung des Anbieters) */
export class KostenBuch {
  constructor(private readonly ordner: string) {}

  private get pfad(): string {
    return join(this.ordner, 'ki-kosten.json')
  }

  static monat(d = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  async buche(usd: number, jetzt = new Date()): Promise<number> {
    const r = await readJson(this.pfad, Buch)
    const monate = r.ok ? r.value.monate : {}
    const m = KostenBuch.monat(jetzt)
    monate[m] = Math.round(((monate[m] ?? 0) + usd) * 10000) / 10000
    await writeJsonAtomic(this.pfad, { monate })
    return monate[m]!
  }

  async summe(jetzt = new Date()): Promise<number> {
    const r = await readJson(this.pfad, Buch)
    return r.ok ? (r.value.monate[KostenBuch.monat(jetzt)] ?? 0) : 0
  }
}
