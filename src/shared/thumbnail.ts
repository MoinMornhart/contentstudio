/**
 * Thumbnail (ROADMAP M4): Vorbilder und Stilbuch je Kanal, Aufträge, Varianten. Gemeinsame Typen für Haupt- und
 * Oberflächenprozess. Vorbilder und Stilbuch liegen im Datenordner unter `vorbilder/<konto-id>/`.
 */
import { z } from 'zod'
import type { JobState } from './jobs'

// --- Vorbilder -----------------------------------------------------------------------------------------------

export const LokaleAnalyseSchema = z.object({
  breite: z.number(),
  hoehe: z.number(),
  helligkeit: z.number(),
  kontrast: z.number(),
  saettigung: z.number(),
  farben: z.array(z.object({ farbe: z.string(), anteil: z.number() })),
  detail: z.number(),
  schwerpunkt: z.tuple([z.number(), z.number()]),
  ueberstrahlt: z.number(),
  abgesoffen: z.number()
})

/** Was die Bild-KI in einem Vorbild erkennt (ROADMAP 4.1). Freie Texte, damit jede Richtung passt. */
export const KiAnalyseSchema = z.object({
  typ: z.string().describe('Kurzer Bildtyp, z. B. „Nahaufnahme mit Thema“, „Reaction“, „Vorher/Nachher“, „Produkt groß“'),
  zeigt: z.string().describe('Was zu sehen ist, ein Satz'),
  bildaufbau: z.string().describe('Aufteilung des Bildes: wo Person, Thema, Text und Leere liegen'),
  figur: z.object({
    anzahl: z.number().int().min(0),
    position: z.enum(['links', 'mitte', 'rechts', 'keine']),
    /** Kopfhöhe als Anteil der Bildhöhe (0 = keine Person) */
    kopfAnteil: z.number().min(0).max(1),
    pose: z.string(),
    blick: z.string(),
    ausdruck: z.string()
  }),
  kamera: z.string().describe('Nah/halbnah/total, Perspektive, Brennweite, Unschärfe'),
  farben: z.string(),
  licht: z.string(),
  text: z.object({ vorhanden: z.boolean(), woerter: z.number().int().min(0), stil: z.string(), position: z.string() }),
  objekte: z.string().describe('Wichtige Objekte und ihre Größe im Bild'),
  stimmung: z.string(),
  rezept: z.string().describe('Wie man den Stil auf ein neues Thema überträgt, 1–2 Sätze, ohne Texte, Logos oder Figuren zu kopieren')
})
export type KiAnalyse = z.infer<typeof KiAnalyseSchema>
export type LokaleAnalyseDaten = z.infer<typeof LokaleAnalyseSchema>

export const VORBILD_QUELLEN = ['datei', 'ablegen', 'zwischenablage', 'link', 'beispiel'] as const

export const VorbildSchema = z.object({
  id: z.string().min(1),
  /** Bild im Datenordner (relativ); null bei Beispiel-Vorbildern ohne Bild */
  datei: z.string().nullable(),
  quelle: z.enum(VORBILD_QUELLEN),
  /** Video-Link, aus dem das öffentliche Thumbnail stammt */
  link: z.string().nullable().default(null),
  titel: z.string().nullable().default(null),
  kanal: z.string().nullable().default(null),
  hinzugefuegt: z.string(),
  aktiv: z.boolean().default(true),
  /** 1 (wenig) bis 5 (sehr wichtig); Standard 3 */
  gewicht: z.number().int().min(1).max(5).default(3),
  lokal: LokaleAnalyseSchema.nullable().default(null),
  ki: KiAnalyseSchema.nullable().default(null)
})
export type Vorbild = z.infer<typeof VorbildSchema>

export const VorbilderDateiSchema = z.object({ version: z.literal(1).default(1), vorbilder: z.array(VorbildSchema).default([]) })

// --- Stilbuch ------------------------------------------------------------------------------------------------

export const REGEL_KATEGORIEN = ['aufbau', 'figur', 'kamera', 'farbe', 'licht', 'text', 'objekte', 'sonstiges'] as const

export const RegelSchema = z.object({
  kategorie: z.enum(REGEL_KATEGORIEN),
  text: z.string().min(1),
  /** IDs der Vorbilder, die die Regel belegen */
  belege: z.array(z.string()).default([]),
  /** Summe der Gewichte der Belege (höher = wichtiger) */
  staerke: z.number().default(0)
})
export type Regel = z.infer<typeof RegelSchema>

export const StilbuchSchema = z.object({
  version: z.literal(1).default(1),
  erstellt: z.string(),
  /** ki = mit Bild-KI zusammengefasst, lokal = nur Messwerte, beispiel = mitgeliefertes Beispiel-Stilbuch */
  quelle: z.enum(['ki', 'lokal', 'beispiel']),
  /** Mitgeliefertes Beispiel, auf dem das Stilbuch aufbaut (z. B. „minecraft“) */
  beispiel: z.string().nullable().default(null),
  regeln: z.array(RegelSchema).default([]),
  /** Gewichtete Mittelwerte der lokalen Analyse */
  werte: z
    .object({ helligkeit: z.number(), kontrast: z.number(), saettigung: z.number(), farben: z.array(z.string()) })
    .nullable()
    .default(null),
  /** IDs der Vorbilder, aus denen es entstand */
  aus: z.array(z.string()).default([])
})
export type Stilbuch = z.infer<typeof StilbuchSchema>

/** Mitgeliefertes Beispiel-Stilbuch einer Richtung (nur Regeln und öffentliche Titel, keine Bilder) */
export interface BeispielStilbuch {
  id: string
  name: string
  /** Wann es passt: Richtungen, Spiele oder Spiel-Avatare */
  passtZu: string[]
  hinweis: string
  regeln: { kategorie: Regel['kategorie']; text: string }[]
  vorbilder: { id: string; kanal: string; titel: string; video: string; zeigt: string; rezept: string }[]
}

// --- Aufträge ------------------------------------------------------------------------------------------------

/** Wie das Bild entsteht: 3D-Minecraft-Welt, 3D-Modell des Nutzers, Foto-Compositing oder reine Grafik */
export const ENGINES = ['minecraft', 'modell3d', 'foto', 'grafik'] as const
export type Engine = (typeof ENGINES)[number]

/** Art des Auftrags */
export const THUMB_ARTEN = ['frei', 'reaktion', 'vorlage', 'video'] as const
export type ThumbArt = (typeof THUMB_ARTEN)[number]

/** Was von einem Auftrags-Vorbild übernommen wird (ROADMAP 4.2) */
export const UEBERNEHMEN = ['farben', 'aufbau', 'licht', 'pose', 'kamera', 'textstil'] as const
export type Uebernehmen = (typeof UEBERNEHMEN)[number]

export const AuftragsVorbildSchema = z.object({
  /** Bild im Datenordner (relativ) */
  datei: z.string().min(1),
  uebernehmen: z.array(z.enum(UEBERNEHMEN)).min(1),
  hinweis: z.string().default('')
})
export type AuftragsVorbild = z.infer<typeof AuftragsVorbildSchema>

export const FORMATE_EXPORT = ['16:9', '9:16', '1:1'] as const
export type ExportFormat = (typeof FORMATE_EXPORT)[number]

export const ThumbStartSchema = z.object({
  art: z.enum(THUMB_ARTEN).default('frei'),
  kontoId: z.string().min(1),
  beschreibung: z.string().default(''),
  /** IDs der Freunde aus dem Profil */
  freunde: z.array(z.string()).default([]),
  anzahl: z.number().int().min(1).max(4).default(3),
  /** Ohne Angabe wählt die App die Engine aus der Darstellung des Kontos */
  engine: z.enum(ENGINES).nullable().default(null),
  auftragsVorbilder: z.array(AuftragsVorbildSchema).max(3).default([]),
  /** Reaction: Original-Bild; Vorlage: vorhandenes Thumbnail; Video: Videodatei (absolute Pfade aus dem Dateidialog) */
  quelle: z.string().nullable().default(null),
  /** Eigenes Hintergrundbild oder Standbild aus dem Video (absolut oder relativ zum Datenordner) */
  hintergrund: z.string().nullable().default(null),
  /** Reaction: Gefühl und Wort (optional) */
  gefuehl: z.string().nullable().default(null),
  wort: z.string().nullable().default(null)
})
export type ThumbStart = z.infer<typeof ThumbStartSchema>

/** Ergebnis der Selbstprüfung einer Variante (ROADMAP 4.8) */
export interface Pruefung {
  /** Technische Befunde (immer) */
  technisch: string[]
  /** Befunde der Bild-KI; null = keine Bild-KI verfügbar (die App sagt das) */
  ki: string[] | null
  /** Wie oft vor dem Zeigen korrigiert wurde */
  korrekturen: number
}

export interface VarianteInfo {
  titel: string
  warum: string
  /** Vorbild, an dem sich die Variante orientiert (Anzeige nur mit Einstellung „Vorbild-Hinweise“) */
  vorbild: { id: string; titel: string | null; kanal: string | null; link: string | null } | null
  bild: string | null
  pruefung: Pruefung
  fehler: string | null
}

export interface ThumbAuftragInfo {
  id: string
  art: ThumbArt | 'aenderung'
  titel: string
  state: JobState
  progress: number | null
  step: string | null
  error: string | null
  createdAt: string
}

export interface VideoIdee {
  beschreibung: string
  warum: string
  zeitpunkt: string | null
  freunde: string[]
}

export interface VideoErgebnis {
  inhalt: string
  momente: { zeit: number; grund: string; bild: string | null }[]
  ideen: VideoIdee[]
  /** false = keine Bild-KI: nur lokal gefundene Momente, keine Ideen */
  mitKi: boolean
}

/** Plattform-Formate für den Export */
export const EXPORT_GROESSEN: Record<ExportFormat, { breite: number; hoehe: number }> = {
  '16:9': { breite: 1280, hoehe: 720 },
  '9:16': { breite: 1080, hoehe: 1920 },
  '1:1': { breite: 1080, hoehe: 1080 }
}
