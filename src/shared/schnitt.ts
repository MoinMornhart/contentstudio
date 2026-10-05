/**
 * Schnitt (ROADMAP M5): gemeinsame Typen für Haupt- und Oberflächenprozess. Grundlage ist der Schnitt aus MoinStudio,
 * verallgemeinert auf jeden Kanal, jede Sprache, jede Richtung und jede Plattform.
 */
import type { Plattform } from './profil'

/** Transkript-Abschnitt mit Wortzeiten */
export interface SchnittAbschnitt {
  start: number
  ende: number
  text: string
  woerter: { start: number; ende: number; wort: string; p: number }[]
}

export type SchnittGrund = 'pause' | 'aehm' | 'wiederholung' | 'versprecher' | 'leerlauf' | 'manuell'

/** Schnittliste: was vom Original bleibt und was mit welchem Grund rausfliegt */
export interface SchnittListe {
  version: 1
  dauer: number
  behalten: { start: number; ende: number }[]
  entfernt: { start: number; ende: number; grund: SchnittGrund; text?: string; aus?: boolean }[]
}

/** Effekt, wie in effekte.json gespeichert (Originalzeit) */
export interface SchnittEffekt {
  art: string
  aus?: boolean
  von?: number
  bis?: number
  bei?: number
  [feld: string]: unknown
}

/** Höhepunkt aus einem langen Video oder Stream */
export interface SchnittHighlight {
  start: number
  ende: number
  titel: string
  grund: string
  wert: number
}

/** Zusätzliche Spur (ROADMAP 5.6): Facecam, Gameplay oder getrennter Ton, per Ton automatisch ausgerichtet */
export type SpurArt = 'facecam' | 'gameplay' | 'ton'
export interface SchnittSpur {
  pfad: string
  art: SpurArt
  /** Sekunden, um die die Spur später beginnt als die Hauptspur (negativ = früher) */
  versatz: number | null
  /** Sicherheit der Ausrichtung 0–1 (Korrelation); null = noch nicht ausgerichtet */
  sicherheit: number | null
  dauer: number
}

export type UntertitelArt = 'aus' | 'an' | 'karaoke'
export type SchnittFormat = '16:9' | '9:16'

export interface SchnittEinstellungen {
  untertitel: UntertitelArt
  zooms: boolean
  /** Hochformat für Shorts, Reels, TikTok (ROADMAP 5.5); Ausschnitt folgt Gesicht oder Aktion */
  format: SchnittFormat
  /** Zuschauen (aus MoinStudio v0.54.0): an = Live-Bild beim Rendern, nach dem Rohschnitt automatisch die Vorschau;
   *  aus = alles im Hintergrund bis zum fertigen Export, dann eine Benachrichtigung */
  zuschauen: boolean
}

/** Export-Ergebnis */
export interface SchnittExport {
  url: string
  plattform: string
  laenge: number
  titel: string[]
  beschreibung: string
  kapitel: { zeit: number; titel: string }[]
  kapitelText: string
  pruefung: { punkt: string; ok: boolean; wert: string }[]
}

/** Schnitt-Projekt für die Oberfläche */
export interface SchnittProjekt {
  id: string
  name: string
  kontoId: string
  kanal: string
  plattform: Plattform
  /** Stil-Richtung (aus dem Konto oder gewählt) */
  richtung: string
  erstellt: string
  quelle: { pfad: string; dauer: number; breite: number; hoehe: number; fps: number; groesse: number; audio: boolean } | null
  spuren: SchnittSpur[]
  proxyUrl: string | null
  leisteUrl: string | null
  wellenform: boolean
  transkript: boolean
  rohschnitt: boolean
  einstellungen: SchnittEinstellungen
  exportiert: boolean
  antwort: { wunsch: string; text: string; zeit: string } | null
  highlights: number | null
  clipsStand: number | null
  vorschauUrl: string | null
  /** Zuschauen: Live-Bild des laufenden Renders (cs-media://…?v=…), solange gerendert wird */
  liveUrl: string | null
  auftrag: { state: string; progress: number | null; step: string; error: string | null; art: string } | null
}

/**
 * Vorgaben je Plattform für den Export (ROADMAP 5.7). Stand: September 2026, aus den Hilfeseiten der Plattformen
 * (docs/datenquellen.md). Grenzen, die eine Plattform ändert, stehen nur hier.
 */
export interface PlattformVorgabe {
  format: SchnittFormat | 'audio'
  /** höchste Videolänge in Sekunden (null = praktisch unbegrenzt) */
  maxDauer: number | null
  titelMax: number
  beschreibungMax: number
  /** Kapitel in der Beschreibung (YouTube) bzw. im Audio (Podcast) */
  kapitel: boolean
  /** Titel und Beschreibung sind bei dieser Plattform ein gemeinsamer Text */
  nurText: boolean
}

export const PLATTFORM_VORGABEN: Record<Plattform, PlattformVorgabe> = {
  youtube: { format: '16:9', maxDauer: 12 * 3600, titelMax: 100, beschreibungMax: 5000, kapitel: true, nurText: false },
  'youtube-shorts': { format: '9:16', maxDauer: 180, titelMax: 100, beschreibungMax: 5000, kapitel: false, nurText: false },
  tiktok: { format: '9:16', maxDauer: 600, titelMax: 0, beschreibungMax: 4000, kapitel: false, nurText: true },
  'instagram-reels': { format: '9:16', maxDauer: 180, titelMax: 0, beschreibungMax: 2200, kapitel: false, nurText: true },
  facebook: { format: '16:9', maxDauer: 4 * 3600, titelMax: 255, beschreibungMax: 5000, kapitel: false, nurText: false },
  x: { format: '16:9', maxDauer: 140, titelMax: 0, beschreibungMax: 280, kapitel: false, nurText: true },
  twitch: { format: '16:9', maxDauer: 48 * 3600, titelMax: 140, beschreibungMax: 5000, kapitel: false, nurText: false },
  kick: { format: '16:9', maxDauer: 48 * 3600, titelMax: 140, beschreibungMax: 5000, kapitel: false, nurText: false },
  podcast: { format: 'audio', maxDauer: null, titelMax: 200, beschreibungMax: 4000, kapitel: true, nurText: false },
  website: { format: '16:9', maxDauer: null, titelMax: 200, beschreibungMax: 5000, kapitel: true, nurText: false },
  andere: { format: '16:9', maxDauer: null, titelMax: 200, beschreibungMax: 5000, kapitel: false, nurText: false }
}
