/**
 * Logos (aus MoinStudio v0.38.0): Bibliothek im Datenordner, Logo-Aufträge mit Verlauf und die Logo-Wahl je Thumbnail.
 * Gemeinsame Typen für Haupt- und Oberflächenprozess.
 */
import { z } from 'zod'

export const LOGO_POSITIONEN = ['auto', 'oben_links', 'oben_rechts', 'unten_links', 'unten_rechts'] as const
export type LogoPosition = (typeof LOGO_POSITIONEN)[number]
/** Von klein nach groß – „kleiner“/„größer“ ist eine Stufe */
export const LOGO_GROESSEN = ['winzig', 'klein', 'mittel', 'gross', 'riesig'] as const
export type LogoGroesse = (typeof LOGO_GROESSEN)[number]

/**
 * Logo eines Thumbnail-Auftrags: id = Logo der Bibliothek, „standard“ = Standard-Logo des Kontos (sonst das erste der
 * Bibliothek), null = kein Logo.
 */
export const ThumbLogoWahlSchema = z.object({
  id: z.string().nullable().default('standard'),
  position: z.enum(LOGO_POSITIONEN).default('auto'),
  groesse: z.enum(LOGO_GROESSEN).default('mittel')
})
export type ThumbLogoWahl = z.infer<typeof ThumbLogoWahlSchema>

export const LOGO_QUELLEN = ['erstellt', 'hochgeladen'] as const

export interface LogoEintrag {
  id: string
  name: string
  /** PNG mit Transparenz, relativ zum Datenordner */
  datei: string
  quelle: (typeof LOGO_QUELLEN)[number]
  /** Zeitpunkt bei erstellten Logos, sonst leer */
  erstellt: string
  /** Konten, für die es das Standard-Logo ist */
  standard: string[]
}

export const LogoStartSchema = z.object({
  kontoId: z.string().min(1),
  beschreibung: z.string().trim().min(2),
  anzahl: z.number().int().min(1).max(4).default(3)
})
export type LogoStart = z.infer<typeof LogoStartSchema>

/** Export einer Bibliotheks-Datei: längste Seite in Pixeln oder YouTube-Wasserzeichen (150 × 150, quadratisch) */
export const LOGO_EXPORTE = ['512', '1024', '2048', 'wasserzeichen'] as const
export type LogoExport = (typeof LOGO_EXPORTE)[number]

export interface LogoVarianteInfo {
  titel: string
  /** Bild als data:-URL (klein genug für die Oberfläche) */
  bild: string | null
  warnungen: string[]
  fehler: string | null
  /** Wie das Logo gebaut wurde: Minecraft-Blockschrift oder Markenschrift */
  bauart: 'minecraft' | 'schrift'
}

export interface LogoAuftragInfo {
  id: string
  art: 'logo' | 'logo-aenderung'
  titel: string
  state: string
  progress: number | null
  step: string | null
  error: string | null
  createdAt: string
  /** Änderung: ursprünglicher Auftrag (der Verlauf hängt an ihm) und Wunsch */
  eltern?: string
  wunsch?: string
}
