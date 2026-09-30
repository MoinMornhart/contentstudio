/** Export in fremde Programme (ROADMAP M7): gemeinsame Typen für Haupt- und Oberflächenprozess */

export type ProgrammId = 'premiere' | 'aftereffects' | 'resolve' | 'capcut' | 'photoshop'
export const PROGRAMME: ProgrammId[] = ['premiere', 'aftereffects', 'resolve', 'capcut', 'photoshop']

export interface ProgrammInfo {
  id: ProgrammId
  name: string
  version: string | null
  beta: boolean
  pfad: string
}

export interface ProgrammeStand {
  programme: ProgrammInfo[]
  gesucht: string
  /** letzte Selbsttests je Programm */
  tests: Partial<Record<ProgrammId, { status: 'ok' | 'fehler' | 'übersprungen' | 'checkliste'; details: string; zeit: string; datei: string | null }>>
}

/** Ziel beim Weitergeben eines Schnitt-Projekts */
export type SchnittZiel = 'premiere' | 'aftereffects' | 'resolve' | 'capcut'
