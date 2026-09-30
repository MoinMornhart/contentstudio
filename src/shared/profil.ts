/**
 * Creator-Profil (ROADMAP M2): alles, was MoinStudio für seinen Besitzer fest eingebaut hat, fragt ContentStudio hier ab.
 * Liegt als `creator-profile.json` im Datenordner, ist versioniert und wird beim Laden migriert. Jede Funktion liest ihre
 * Annahmen aus diesem Profil. Dateien (Fotos, Skins, Logos …) stehen als Pfade relativ zum Datenordner darin.
 */
import { z } from 'zod'

export const PROFIL_VERSION = 1
export const PROFIL_DATEI = 'creator-profile.json'

export const PLATTFORMEN = ['youtube', 'youtube-shorts', 'twitch', 'kick', 'tiktok', 'instagram-reels', 'facebook', 'x', 'podcast', 'website', 'andere'] as const
export type Plattform = (typeof PLATTFORMEN)[number]

/** Vorgeschlagene Inhaltsrichtungen. Jede andere, frei eingegebene Richtung ist ebenso gültig (Listen sind nie die Grenze). */
export const RICHTUNGEN = ['gaming', 'vlog', 'kochen', 'tech', 'bildung', 'beauty', 'fitness', 'musik', 'comedy', 'reactions', 'streams', 'podcast', 'kinder', 'business'] as const
export type RichtungId = (typeof RICHTUNGEN)[number]

export const FORMATE = ['lang', 'short', 'live', 'clip', 'podcast'] as const
export type Format = (typeof FORMATE)[number]

export const PROGRAMME = ['premiere', 'aftereffects', 'photoshop', 'resolve', 'capcut', 'obs', 'canva'] as const
export type Programm = (typeof PROGRAMME)[number]

export const ROLLEN = ['moderation', 'schnitt', 'thumbnails', 'planung', 'technik', 'social'] as const

/** Datei im Datenordner, relativ (z. B. „avatare/ich-1.png“) */
const Datei = z.string().min(1)

const Slot = z.object({ tag: z.number().int().min(0).max(6), zeit: z.string().regex(/^\d{2}:\d{2}$/) })

/** Wie der Creator (oder ein Freund) im Thumbnail aussieht. Mehrfachauswahl je Kanal. */
export const DarstellungSchema = z.discriminatedUnion('art', [
  z.object({ art: z.literal('foto'), fotos: z.array(Datei).default([]) }),
  z.object({
    art: z.literal('spielavatar'),
    /** „minecraft“ oder frei, z. B. „Roblox“, „Fortnite“ */
    spiel: z.string().min(1).default('minecraft'),
    /** Minecraft: Skin-Datei oder Accountname (Skin wird dann öffentlich über Mojang geladen) */
    skin: Datei.nullable().default(null),
    accountName: z.string().nullable().default(null),
    slim: z.boolean().nullable().default(null),
    /** Andere Spiele: hochgeladene Bilder oder ein Modell (GLB/VRM/FBX) */
    bilder: z.array(Datei).default([]),
    modell: Datei.nullable().default(null)
  }),
  z.object({ art: z.literal('modell3d'), datei: Datei.nullable().default(null), format: z.enum(['vrm', 'glb', 'fbx']).nullable().default(null) }),
  z.object({ art: z.literal('maskottchen'), datei: Datei.nullable().default(null) }),
  z.object({ art: z.literal('keine') })
])
export type Darstellung = z.infer<typeof DarstellungSchema>
export type DarstellungArt = Darstellung['art']

const MetaVideo = z.object({
  id: z.string(),
  titel: z.string(),
  thumbnail: z.string(),
  veroeffentlicht: z.string(),
  /** Sekunden, null wenn unbekannt */
  dauer: z.number().nullable()
})
export type MetaVideo = z.infer<typeof MetaVideo>

export const KontoSchema = z.object({
  id: z.string().min(1),
  plattform: z.enum(PLATTFORMEN),
  /** Anzeigename oder Handle, z. B. „@kochmitkim“ (leer = noch unbenannt) */
  name: z.string().default(''),
  /** Hauptsprache der Inhalte (ISO 639-1, z. B. „de“) */
  sprache: z.string().min(2).default('de'),
  /** Richtungen: Vorschläge aus RICHTUNGEN oder frei eingegeben */
  richtungen: z.array(z.string().min(1)).default([]),
  /** Nur Gaming: welche Spiele */
  spiele: z.array(z.string().min(1)).default([]),
  formate: z.array(z.enum(FORMATE)).default([]),
  /** Upload-Rhythmus: Wochentage (0 = Sonntag) und Uhrzeit; leer = unregelmäßig */
  rhythmus: z.array(Slot).default([]),
  /** Öffentlicher Link zum Kanal (optional) */
  link: z.string().nullable().default(null),
  /** Öffentliche Metadaten, nur mit Zustimmung abgerufen */
  metadaten: z
    .object({ zustimmung: z.boolean(), abgerufen: z.string().nullable(), videos: z.array(MetaVideo) })
    .nullable()
    .default(null),
  /** Darstellung im Thumbnail; leer = noch nicht gefragt (wird beim ersten Thumbnail nachgefragt) */
  darstellung: z.array(DarstellungSchema).default([]),
  /** Vorbilder: Kanäle, deren Stil gefällt (Namen oder Links) */
  vorbildKanaele: z.array(z.string().min(1)).default([]),
  /** Hochgeladene Vorbild-Thumbnails (in vorbilder/<konto-id>/, nur lokal, nie veröffentlicht) */
  vorbildBilder: z.array(Datei).default([])
})
export type Konto = z.infer<typeof KontoSchema>

export const FreundSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  darstellung: z.array(DarstellungSchema).default([])
})
export type Freund = z.infer<typeof FreundSchema>

export const ProfilSchema = z.object({
  version: z.literal(PROFIL_VERSION),
  erstellt: z.string(),
  geaendert: z.string(),
  person: z
    .object({
      name: z.string().default(''),
      /** Sprachen der Inhalte (ISO 639-1) */
      sprachen: z.array(z.string().min(2)).default([]),
      team: z.enum(['allein', 'team']).default('allein'),
      mitglieder: z.array(z.object({ name: z.string().default(''), rollen: z.array(z.string()).default([]) })).default([])
    })
    .default({ name: '', sprachen: [], team: 'allein', mitglieder: [] }),
  konten: z.array(KontoSchema).default([]),
  freunde: z.array(FreundSchema).default([]),
  marke: z
    .object({
      logos: z.array(Datei).default([]),
      /** Markenfarben als #rrggbb */
      farben: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).default([]),
      /** Schrift für Thumbnail-Text: Name einer mitgelieferten/Systemschrift oder eigene Datei */
      schrift: z.object({ name: z.string().min(1), datei: Datei.nullable().default(null) }).nullable().default(null),
      wasserzeichen: z.boolean().default(false)
    })
    .default({ logos: [], farben: [], schrift: null, wasserzeichen: false }),
  /** KI-Wege in Rückfall-Reihenfolge (ROADMAP M3); leer = keine KI gewählt */
  ki: z
    .object({ wege: z.array(z.object({ id: z.string().min(1), aktiv: z.boolean() })).default([]), keineKi: z.boolean().default(false) })
    .default({ wege: [], keineKi: false }),
  programme: z.array(z.enum(PROGRAMME)).default([]),
  einstellungen: z
    .object({
      /** „Orientiert sich an …“ an Varianten zeigen (Standard aus, wie MoinStudio v0.35.1) */
      vorbildHinweise: z.boolean().default(false),
      /** Fertiges Video automatisch hochladen (nur mit verbundenem Konto; Standard aus) */
      autoUpload: z.boolean().default(false)
    })
    .default({ vorbildHinweise: false, autoUpload: false }),
  /** Übersprungene Schritte des Assistenten: werden im passenden Moment nachgefragt */
  offen: z.array(z.string()).default([])
})
export type Profil = z.infer<typeof ProfilSchema>

/** Neues, leeres Profil mit Standards für alles. */
export function leeresProfil(jetzt = new Date()): Profil {
  const zeit = jetzt.toISOString()
  return ProfilSchema.parse({ version: PROFIL_VERSION, erstellt: zeit, geaendert: zeit })
}

/**
 * Migrationen: Schlüssel = Version, von der aus migriert wird. Jede Funktion hebt die Rohdaten genau eine Version an.
 * Neue Profilversion = PROFIL_VERSION erhöhen und hier eine Funktion ergänzen (mit Test).
 */
export const MIGRATIONEN: Record<number, (alt: Record<string, unknown>) => Record<string, unknown>> = {}

export class ProfilFehler extends Error {}

/**
 * Liest ein gespeichertes Profil: migriert ältere Versionen schrittweise, füllt fehlende Felder mit Standards und lehnt
 * ungültige Werte ab (statt sie still zu übernehmen). Profile einer neueren App-Version werden nicht angefasst.
 */
export function profilAus(roh: unknown): Profil {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) throw new ProfilFehler('Profil ist kein Objekt')
  let daten = roh as Record<string, unknown>
  let version = typeof daten['version'] === 'number' ? daten['version'] : 0
  if (version > PROFIL_VERSION) throw new ProfilFehler(`Profil stammt aus einer neueren ContentStudio-Version (${version})`)
  while (version < PROFIL_VERSION) {
    const schritt = MIGRATIONEN[version]
    if (!schritt) throw new ProfilFehler(`Keine Migration von Version ${version}`)
    daten = schritt(daten)
    version++
  }
  const erg = ProfilSchema.safeParse(daten)
  if (!erg.success) throw new ProfilFehler(erg.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return erg.data
}

/** Braucht dieses Profil 3D (Blender)? Spiel-Avatare und 3D-Modelle – bei Creator oder Freunden. */
export function brauchtDreiD(p: Profil): boolean {
  const alle = [...p.konten.flatMap((k) => k.darstellung), ...p.freunde.flatMap((f) => f.darstellung)]
  return alle.some((d) => d.art === 'spielavatar' || d.art === 'modell3d')
}

/** Braucht dieses Profil lokales Freistellen (Fotos von echten Personen)? */
export function brauchtFreistellen(p: Profil): boolean {
  return [...p.konten.flatMap((k) => k.darstellung), ...p.freunde.flatMap((f) => f.darstellung)].some((d) => d.art === 'foto')
}

/** Neue ID für Konten und Freunde: kurz, lesbar, eindeutig genug für eine Person */
export function neueId(praefix: string): string {
  return `${praefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
