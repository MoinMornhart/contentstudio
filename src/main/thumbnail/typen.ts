import type { Sprache } from '@shared/i18n'
import type { Engine, Pruefung, ThumbStart } from '@shared/thumbnail'
import type { StilKontext } from './kontext'
import type { ThumbUmgebung } from './umgebung'

/** Eine Person oder Figur im Bild, mit allem, was die Engines brauchen (absolute Pfade) */
export interface FigurDaten {
  id: string
  name: string
  rolle: 'ich' | 'freund'
  /** Minecraft: Skin-Datei und Armform */
  skin: string | null
  slim: boolean | null
  /** Fotos (Foto-Engine) oder Bilder eines Spiel-Avatars/Maskottchens (werden ebenso freigestellt) */
  fotos: string[]
  /** true = echte Fotos von Menschen (Freistellen mit dem Personen-Modell) */
  mensch: boolean
  /** 3D-Modell (GLB/glTF/VRM/FBX) */
  modell: string | null
}

export interface ThumbPayload {
  start: ThumbStart
  engine: Engine
  kanal: { id: string; name: string; plattform: string; richtungen: string[]; sprache: string }
  figuren: FigurDaten[]
  stil: StilKontext
  marke: { schrift: string | null; logo: string | null; farben: string[] }
  /** Eigenes Hintergrundbild oder Standbild (absolut) */
  hintergrund: string | null
  umgebung: ThumbUmgebung
  ausgabe: string
  /** Sprache der Oberfläche beim Start (für Titel, Begründung, Befunde) */
  sprache: Sprache
}

export interface VarianteErgebnis {
  titel: string
  warum: string
  vorbild: string
  bild: string | null
  roh: string | null
  /** Beschreibung, aus der das Bild entstand (Szene oder Spezifikation) – Grundlage für Änderungswünsche */
  spec: string | null
  ebenen: string | null
  /** Messbericht (Boxen von Gesichtern, Figuren, Objekten) */
  bericht: string | null
  /** Texte im Bild (für den Neusatz in anderen Formaten) */
  texte: { text: string; farbe?: string }[]
  /** Minecraft: Ordner der Spieldatei für die Pixelschrift */
  schriftAssets: string | null
  engine: Engine
  pruefung: Pruefung
  fehler: string | null
}

export interface ThumbErgebnisDaten {
  varianten: VarianteErgebnis[]
}
