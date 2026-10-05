/**
 * Planung (ROADMAP M6): gemeinsame Typen für Haupt- und Oberflächenprozess. Grundlage ist die Planung aus MoinStudio,
 * verallgemeinert von zwei festen Kanälen auf die Konten im Creator-Profil und auf jede Plattform.
 */
import { PLATTFORM_VORGABEN } from './schnitt'
import type { Plattform } from './profil'

export const SPALTEN = ['idee', 'aufnahme', 'schnitt', 'thumbnail', 'upload', 'veroeffentlicht'] as const
export type Spalte = (typeof SPALTEN)[number]

/** Titel, Text und Kapitel für die Veröffentlichung (aus dem Export oder von Hand) */
export interface KartenTexte {
  plattform: Plattform
  titel: string
  beschreibung: string
  kapitel: string
}

/** Ein Eintrag im Cross-Posting-Plan (ROADMAP 6.4): welches Stück wann auf welchem Konto */
export interface CrossPost {
  kontoId: string
  plattform: Plattform
  art: 'lang' | 'kurz'
  /** Höhepunkt im Schnitt-Projekt (Sekunden im Original), nur bei „kurz“ */
  von: number | null
  bis: number | null
  titel: string
  termin: string
  erledigt: boolean
}

export interface Karte {
  id: string
  kontoId: string
  spalte: Spalte
  ordnung: number
  titel: string
  notizen: string
  checkliste: { text: string; erledigt: boolean }[]
  /** Upload-Termin als lokale Zeit „2026-10-03T17:00“ oder null */
  termin: string | null
  thumbnail: { auftrag: string | null; bild: string | null; gewaehlt: boolean } | null
  schnitt: string | null
  texte: KartenTexte | null
  crossposting: CrossPost[]
  erstellt: string
  rev: number
  updatedAt: string
  updatedBy: string
  felder: Record<string, string>
}

/** Karte für die Oberfläche: mit Vorschaubild über das Medien-Protokoll */
export type PlanungKarte = Karte & { bildUrl: string | null }
export type PlanungAenderung = Partial<Pick<Karte, 'kontoId' | 'spalte' | 'ordnung' | 'titel' | 'notizen' | 'checkliste' | 'termin' | 'thumbnail' | 'schnitt' | 'texte' | 'crossposting'>>

export type PlanungKiArt = 'ideen' | 'titel' | 'woche'
export interface Idee {
  titel: string
  idee: string
  warum: string
}
export interface TitelVorschlag {
  titel: string
  warum: string
}
export interface WochenPlan {
  plan: { karte: string; termin: string; grund: string }[]
  aufnehmen: { karte: string; grund: string }[]
  hinweis: string
}
export type PlanungKiErgebnis = { art: 'ideen'; ideen: Idee[] } | { art: 'titel'; titel: TitelVorschlag[] } | { art: 'woche'; woche: WochenPlan }
export interface PlanungKiStand {
  state: string
  progress: number | null
  step: string
  error: string | null
  ergebnis: PlanungKiErgebnis | null
}
export interface PlanungThumbStand {
  auftrag: { state: string; progress: number | null; step: string; error: string | null } | null
  varianten: { titel: string; pfad: string; url: string }[]
}

/**
 * Textregeln je Plattform (ROADMAP 6.3), Stand 30.09.2026 aus den Hilfeseiten der Plattformen (docs/datenquellen.md):
 * empfohlene Titellänge (sichtbar ohne Abschneiden), harte Grenze und Hashtags (wie viele, wo). Grenzen der
 * Dateien stehen in PLATTFORM_VORGABEN.
 */
export interface TextRegel {
  /** so lang, dass der Titel in Listen nicht abgeschnitten wird */
  titelZiel: number
  /** harte Grenze der Plattform (0 = kein eigener Titel, nur Text) */
  titelMax: number
  hashtags: { min: number; max: number; ort: 'titel' | 'text' | 'keine' }
}

export const TEXT_REGELN: Record<Plattform, TextRegel> = {
  youtube: { titelZiel: 60, titelMax: 100, hashtags: { min: 0, max: 3, ort: 'text' } },
  'youtube-shorts': { titelZiel: 50, titelMax: 100, hashtags: { min: 1, max: 3, ort: 'titel' } },
  tiktok: { titelZiel: 80, titelMax: 0, hashtags: { min: 3, max: 5, ort: 'text' } },
  'instagram-reels': { titelZiel: 80, titelMax: 0, hashtags: { min: 3, max: 5, ort: 'text' } },
  facebook: { titelZiel: 60, titelMax: 255, hashtags: { min: 0, max: 3, ort: 'text' } },
  x: { titelZiel: 100, titelMax: 0, hashtags: { min: 0, max: 2, ort: 'text' } },
  twitch: { titelZiel: 70, titelMax: 140, hashtags: { min: 0, max: 0, ort: 'keine' } },
  kick: { titelZiel: 70, titelMax: 140, hashtags: { min: 0, max: 0, ort: 'keine' } },
  podcast: { titelZiel: 60, titelMax: 200, hashtags: { min: 0, max: 0, ort: 'keine' } },
  website: { titelZiel: 60, titelMax: 200, hashtags: { min: 0, max: 0, ort: 'keine' } },
  andere: { titelZiel: 60, titelMax: 200, hashtags: { min: 0, max: 5, ort: 'text' } }
}

/** Plattformen mit Kurzvideos im Hochformat (Ziele für Ausschnitte im Cross-Posting) */
export const KURZ_PLATTFORMEN: Plattform[] = (Object.keys(PLATTFORM_VORGABEN) as Plattform[]).filter((p) => PLATTFORM_VORGABEN[p].format === '9:16')

export const hashtagsIn = (text: string): string[] => text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.map((h) => h.trim()) ?? []

/** Prüft einen Titel (bzw. den ersten Satz bei Plattformen ohne Titel) gegen die Regeln der Plattform. */
export function pruefeTitel(titel: string, plattform: Plattform): { ok: boolean; zuLang: boolean; hashtags: number } {
  const r = TEXT_REGELN[plattform]
  const grenze = r.titelMax || r.titelZiel
  const zahl = hashtagsIn(titel).length
  const hashtagsErlaubt = r.hashtags.ort === 'titel' ? r.hashtags.max : 0
  const zuLang = [...titel].length > grenze
  return { ok: !!titel.trim() && !zuLang && zahl <= hashtagsErlaubt, zuLang, hashtags: zahl }
}

/** Bringt einen Titel in die Regeln: Hashtags raus (wo sie nicht in den Titel gehören), kürzen an einer Wortgrenze. */
export function titelFuer(titel: string, plattform: Plattform): string {
  const r = TEXT_REGELN[plattform]
  let t = titel.replace(/\s+/g, ' ').trim()
  if (r.hashtags.ort !== 'titel') t = t.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '').trim()
  else {
    const tags = hashtagsIn(t)
    for (const h of tags.slice(r.hashtags.max)) t = t.replace(h, '').trim()
  }
  const grenze = r.titelMax || r.titelZiel
  if ([...t].length <= grenze) return t
  const zeichen = [...t].slice(0, grenze - 1).join('')
  const schnitt = zeichen.lastIndexOf(' ')
  return `${(schnitt > grenze * 0.6 ? zeichen.slice(0, schnitt) : zeichen).replace(/[\s,;:–-]+$/, '')}…`
}

/** Hashtags am Textende auf die erlaubte Zahl bringen (doppelte raus). */
export function hashtagsFuer(text: string, plattform: Plattform): string {
  const r = TEXT_REGELN[plattform].hashtags
  const ohne = text.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+\n/g, '\n').trim()
  if (r.ort !== 'text' || r.max === 0) return ohne
  const behalten = hashtagsIn(text).filter((h, i, alle) => alle.findIndex((x) => x.toLowerCase() === h.toLowerCase()) === i).slice(0, r.max)
  return behalten.length ? `${ohne}\n\n${behalten.join(' ')}` : ohne
}

/** Kalender-Abgleich (aus MoinStudio v0.53.0): Planung ↔ Apple Kalender, Google, Outlook, iCal-Links */
export interface KalenderLink {
  id: string
  name: string
  url: string
  farbe?: string
  an: boolean
  fehler?: string
}
/** Termin aus einem anderen Kalender (nur zum Anzeigen); Zeiten lokal wie in der Planung */
export interface FremderTermin {
  id: string
  uid: string
  quelle: string
  quelleName: string
  farbe: string
  titel: string
  /** „YYYY-MM-DDTHH:MM“ oder bei ganztägigen „YYYY-MM-DD“ */
  start: string
  ende: string
  ganztag: boolean
  ort?: string
}
/** Stand für die Oberfläche – enthält nie das Passwort */
export interface KalenderStand {
  apple: { benutzer: string; verbunden: boolean; eintragen: boolean; ausgeblendet: string[]; kalender: { href: string; name: string; farbe: string; eigen: boolean }[]; fehler?: string } | null
  links: KalenderLink[]
  termine: FremderTermin[]
  /** letzter erfolgreicher Abgleich (ISO) */
  stand: string | null
  laeuft: boolean
}
/** Anderer Termin in Kurzform (für den KI-Wochenplan) */
export type AndererTermin = Pick<FremderTermin, 'titel' | 'start' | 'ende' | 'ganztag'>
