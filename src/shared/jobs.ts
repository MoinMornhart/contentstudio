/** Datentypen des Job-Systems – gemeinsam für Main-Prozess und Oberfläche. */

export type JobState =
  | 'queued'
  | 'running'
  | 'paused'
  /** Claude-Abo-Limit erreicht: wartet bis `resumeAt` und macht dann selbst weiter */
  | 'waiting-limit'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface JobInfo {
  id: string
  kind: string
  title: string
  state: JobState
  /** 0–100 oder null, wenn unbekannt */
  progress: number | null
  step: string
  createdAt: string
  updatedAt: string
  /** Nur bei `waiting-limit`: ISO-Zeitpunkt, ab dem es weitergeht */
  resumeAt?: string
  error?: string
}

export interface QueueState {
  /** true = alle Jobs angehalten (Knopf „Rechenlast pausieren“) */
  paused: boolean
  jobs: JobInfo[]
}
