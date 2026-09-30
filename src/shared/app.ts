// Herkunft: ContentStudio src/shared/app.ts (MIT), verallgemeinert für ContentStudio.
import type { HardwareState } from './hardware'
import type { QueueState } from './jobs'
import type { Schluessel, Sprache } from './i18n'

/** Reiter der Hauptoberfläche. Reihenfolge = Reihenfolge in der Navigation. */
export const TABS = [
  { id: 'thumbnail', label: 'tab.thumbnail', icon: '🎨' },
  { id: 'schnitt', label: 'tab.schnitt', icon: '✂️' },
  { id: 'planung', label: 'tab.planung', icon: '🗂️' },
  { id: 'einstellungen', label: 'tab.einstellungen', icon: '⚙️' }
] as const satisfies readonly { id: string; label: Schluessel; icon: string }[]

export type TabId = (typeof TABS)[number]['id']

export function isTabId(value: unknown): value is TabId {
  return typeof value === 'string' && TABS.some((t) => t.id === value)
}

/** IPC-Kanalnamen zwischen Main und Renderer an einer Stelle. */
export const IPC = {
  appInfo: 'app:info',
  selectTab: 'ui:select-tab',
  autostartGet: 'autostart:get',
  autostartSet: 'autostart:set',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateStatus: 'update:status',
  openLogs: 'app:open-logs',
  spracheGet: 'sprache:get',
  spracheSet: 'sprache:set',
  dataStatus: 'data:status',
  dataChoose: 'data:choose',
  dataOpen: 'data:open',
  toolsStatus: 'tools:status',
  toolsInstall: 'tools:install',
  toolsProgress: 'tools:progress',
  /** invoke: aktuellen Zustand holen · event: Zustandsänderung */
  hwState: 'hw:state',
  hwRun: 'hw:run',
  hwProbe: 'hw:probe',
  jobsState: 'jobs:state',
  jobsAction: 'jobs:action',
  jobsImage: 'jobs:image',
  setupState: 'setup:state',
  setupComplete: 'setup:complete',
  setupStep: 'ui:setup-step'
} as const

export type JobAction = 'pause' | 'resume' | 'cancel' | 'pauseAll' | 'resumeAll'

export type ToolId = 'blender' | 'ffmpeg' | 'uv'

export interface ToolStatus {
  id: ToolId
  label: string
  version: string
  installed: boolean
  path: string | null
  sizeBytes: number
}

export interface ToolProgressEvent {
  id: ToolId
  version: string
  phase: 'check' | 'download' | 'verify' | 'extract' | 'done' | 'error'
  percent: number | null
  message?: string
}

export interface DataDirStatus {
  /** Gewählter Datenordner oder null, wenn noch keiner eingerichtet ist */
  dataDir: string | null
  /** false, wenn der Ordner fehlt (z. B. Sync-Dienst noch nicht fertig oder Laufwerk getrennt) */
  available: boolean
  /** Konfliktkopien von OneDrive, iCloud, Dropbox oder Google Drive (relativ zum Datenordner) */
  conflicts: { original: string; copy: string }[]
}

/** Zustand der Update-Funktion (GitHub-Releases über electron-updater). */
export type UpdateStatus =
  | { state: 'dev' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none'; version: string }
  | { state: 'available'; version: string; notes: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface AutostartState {
  /** false in der Entwicklungsumgebung: dort würde sonst electron.exe eingetragen. */
  available: boolean
  enabled: boolean
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  arch: string
  electron: string
  chrome: string
  node: string
}

/** Sprache der Oberfläche: gewählt (null = wie Windows) und wirksam */
export interface SpracheStand {
  gewaehlt: Sprache | null
  wirksam: Sprache
  system: Sprache
}

/** Die über die Preload-Brücke erreichbare API (`window.cs`). */
export interface CsApi {
  appInfo(): Promise<AppInfo>
  onSelectTab(handler: (tab: TabId) => void): () => void
  getAutostart(): Promise<AutostartState>
  setAutostart(enabled: boolean): Promise<AutostartState>
  checkForUpdate(): Promise<UpdateStatus>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateStatus(handler: (status: UpdateStatus) => void): () => void
  openLogs(): Promise<void>
  sprache(): Promise<SpracheStand>
  /** null = wieder wie Windows */
  setzeSprache(sprache: Sprache | null): Promise<SpracheStand>
  dataStatus(): Promise<DataDirStatus>
  /** Öffnet den Ordner-Dialog; null, wenn abgebrochen */
  chooseDataDir(): Promise<DataDirStatus | null>
  openDataDir(): Promise<void>
  toolsStatus(): Promise<ToolStatus[]>
  installTool(id: ToolId): Promise<ToolStatus[]>
  onToolProgress(handler: (p: ToolProgressEvent) => void): () => void
  hardwareState(): Promise<HardwareState>
  runHardwareTest(): Promise<HardwareState>
  onHardwareState(handler: (s: HardwareState) => void): () => void
  /** Startet die Aufgabe „Probebild“ mit der Vorschau-Einstellung; liefert die Aufgaben-ID */
  probeRender(): Promise<string>
  jobsState(): Promise<QueueState>
  jobAction(action: JobAction, id?: string): Promise<QueueState>
  onJobsState(handler: (s: QueueState) => void): () => void
  /** Ergebnisbild einer Aufgabe als Data-URL (oder null) */
  jobImage(id: string): Promise<string | null>
  /** true = Einrichtungsassistent wurde abgeschlossen */
  setupState(): Promise<boolean>
  setupComplete(done: boolean): Promise<boolean>
  onSetupStep(handler: (step: number) => void): () => void
}
