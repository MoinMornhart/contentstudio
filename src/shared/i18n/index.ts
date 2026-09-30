import { de, type Schluessel } from './de'
import { en } from './en'

export type { Schluessel } from './de'

/** Sprachen der Oberfläche. Neue Sprache = neues Wörterbuch mit denselben Schlüsseln wie de.ts. */
export const SPRACHEN = ['de', 'en'] as const
export type Sprache = (typeof SPRACHEN)[number]

export const WOERTERBUECHER: Record<Sprache, Record<Schluessel, string>> = { de, en }

export type Werte = Record<string, string | number>

export function istSprache(wert: unknown): wert is Sprache {
  return typeof wert === 'string' && (SPRACHEN as readonly string[]).includes(wert)
}

/** Übersetzt einen Schlüssel und setzt Platzhalter wie {name} ein. Fehlt ein Wert, bleibt der Platzhalter stehen. */
export function uebersetze(sprache: Sprache, schluessel: Schluessel, werte?: Werte): string {
  const text = WOERTERBUECHER[sprache][schluessel] ?? de[schluessel] ?? schluessel
  if (!werte) return text
  return text.replace(/\{(\w+)\}/g, (ganz, name: string) => (name in werte ? String(werte[name]) : ganz))
}

/** Sprache aus der Systemsprache (z. B. „de-AT“ → de); alles andere wird Englisch. */
export function spracheAusSystem(locale: string | null | undefined): Sprache {
  const basis = (locale ?? '').toLowerCase().split(/[-_]/)[0] ?? ''
  return istSprache(basis) ? basis : 'en'
}

/** Gebietsschema für Datum und Zahlen */
export function gebietsschema(sprache: Sprache): string {
  return sprache === 'de' ? 'de-DE' : 'en-GB'
}
