// Herkunft: MoinStudio src/shared/kalender.ts (MIT).
/**
 * Planung (ROADMAP 7.4): Kalender-Rechnungen ohne Zeitzonen-Fallen. Termine sind lokale Zeiten „2026-10-03T17:00“,
 * Tage heißen „2026-10-03“. Wochen beginnen am Montag.
 */

export type Wochentag = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sonntag wie bei Date.getDay()
export interface RhythmusSlot {
  tag: Wochentag
  zeit: string // „17:00“
}
export type Rhythmus = Record<string, RhythmusSlot[]>

export const WOCHENTAGE_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const
/** Anzeige-Reihenfolge Montag bis Sonntag */
export const WOCHE: Wochentag[] = [1, 2, 3, 4, 5, 6, 0]
export const STANDARD_ZEIT = '17:00'

const zwei = (n: number): string => String(n).padStart(2, '0')
export const tagVon = (d: Date): string => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
export const datumVon = (tag: string): Date => {
  const [j, m, t] = tag.split('-').map(Number)
  return new Date(j, m - 1, t)
}
export const plusTage = (tag: string, n: number): string => {
  const d = datumVon(tag)
  d.setDate(d.getDate() + n)
  return tagVon(d)
}
export const wochentag = (tag: string): Wochentag => datumVon(tag).getDay() as Wochentag

/** Montag der Woche, in der `tag` liegt */
export const wochenStart = (tag: string): string => plusTage(tag, -((wochentag(tag) + 6) % 7))

/** 6 × 7 Tage ab dem Montag vor dem Monatsersten (feste Höhe, damit der Kalender beim Blättern nicht springt) */
export function monatsRaster(jahr: number, monat: number): string[] {
  const start = wochenStart(tagVon(new Date(jahr, monat, 1)))
  return Array.from({ length: 42 }, (_, i) => plusTage(start, i))
}

export const wochenTage = (tag: string): string[] => Array.from({ length: 7 }, (_, i) => plusTage(wochenStart(tag), i))

/** Tag und Uhrzeit eines Termins */
export function teileTermin(termin: string): { tag: string; zeit: string } {
  return { tag: termin.slice(0, 10), zeit: termin.slice(11, 16) || STANDARD_ZEIT }
}

/**
 * Neuer Termin, wenn eine Karte auf einen Tag gezogen wird: vorhandene Uhrzeit bleibt, sonst die Rhythmus-Zeit des
 * Kanals an diesem Wochentag, sonst die erste Rhythmus-Zeit des Kanals, sonst 17:00.
 */
export function terminAufTag(tag: string, alt: string | null, slots: RhythmusSlot[] = []): string {
  if (alt) return `${tag}T${teileTermin(alt).zeit}`
  const passend = slots.find((s) => s.tag === wochentag(tag)) ?? slots[0]
  return `${tag}T${passend?.zeit ?? STANDARD_ZEIT}`
}

export interface Luecke {
  kanal: string
  tag: string
  zeit: string
}

/**
 * Rhythmus-Termine ohne geplantes Video: für jeden Tag in [von, bis] und jeden Kanal, der an diesem Wochentag laut
 * Rhythmus hochlädt, aber an diesem Tag keine Karte mit Termin hat. Vergangene Tage zählen nicht.
 */
export function luecken(rhythmus: Rhythmus, karten: { kanal: string; termin: string | null }[], von: string, bis: string, heute: string): Luecke[] {
  const belegt = new Set(karten.filter((k) => k.termin).map((k) => `${k.kanal}|${k.termin!.slice(0, 10)}`))
  const ergebnis: Luecke[] = []
  for (let tag = von > heute ? von : heute; tag <= bis; tag = plusTage(tag, 1)) {
    for (const [kanal, slots] of Object.entries(rhythmus)) {
      for (const s of slots) if (s.tag === wochentag(tag) && !belegt.has(`${kanal}|${tag}`)) ergebnis.push({ kanal, tag, zeit: s.zeit })
    }
  }
  return ergebnis
}

/** Prüft einen gespeicherten Rhythmus (Datei kann von Hand oder vom anderen Gerät stammen). */
export function rhythmusAus(roh: unknown): Rhythmus {
  const r: Rhythmus = {}
  if (!roh || typeof roh !== 'object') return r
  for (const [kanal, slots] of Object.entries(roh as Record<string, unknown>)) {
    if (!Array.isArray(slots)) continue
    r[kanal] = slots
      .filter((s): s is RhythmusSlot => Number.isInteger(s?.tag) && s.tag >= 0 && s.tag <= 6 && typeof s?.zeit === 'string' && /^\d{2}:\d{2}$/.test(s.zeit))
      .map((s) => ({ tag: s.tag, zeit: s.zeit }))
      .sort((a, b) => ((a.tag + 6) % 7) - ((b.tag + 6) % 7))
  }
  return r
}

/** Kurzname eines Wochentags in der Sprache der Oberfläche (0 = Sonntag), z. B. „Mo“ oder „Mon“ */
export function wochentagKurz(tag: Wochentag, locale: string): string {
  // 2026-10-04 ist ein Sonntag
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 9, 4 + tag)).replace(/\.$/, '')
}
