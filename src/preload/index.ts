// Herkunft: MoinStudio src/preload/index.ts (MIT).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, isTabId, type CsApi, type JobAction, type TabId, type ToolId, type ToolProgressEvent, type UpdateStatus } from '@shared/app'
import type { HardwareState } from '@shared/hardware'
import type { Sprache } from '@shared/i18n'
import type { QueueState } from '@shared/jobs'

/** Abonniert ein Ereignis aus dem Hauptprozess und liefert die Abmelde-Funktion. */
function ereignis<T>(kanal: string, handler: (wert: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, wert: T): void => handler(wert)
  ipcRenderer.on(kanal, listener)
  return () => ipcRenderer.removeListener(kanal, listener)
}

const api: CsApi = {
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  onSelectTab(handler: (tab: TabId) => void) {
    return ereignis<unknown>(IPC.selectTab, (tab) => {
      if (isTabId(tab)) handler(tab)
    })
  },
  getAutostart: () => ipcRenderer.invoke(IPC.autostartGet),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke(IPC.autostartSet, enabled === true),
  checkForUpdate: () => ipcRenderer.invoke(IPC.updateCheck),
  downloadUpdate: () => ipcRenderer.invoke(IPC.updateDownload),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  onUpdateStatus: (handler: (status: UpdateStatus) => void) => ereignis(IPC.updateStatus, handler),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
  sprache: () => ipcRenderer.invoke(IPC.spracheGet),
  setzeSprache: (sprache: Sprache | null) => ipcRenderer.invoke(IPC.spracheSet, sprache),
  dataStatus: () => ipcRenderer.invoke(IPC.dataStatus),
  chooseDataDir: () => ipcRenderer.invoke(IPC.dataChoose),
  openDataDir: () => ipcRenderer.invoke(IPC.dataOpen),
  toolsStatus: () => ipcRenderer.invoke(IPC.toolsStatus),
  installTool: (id: ToolId) => ipcRenderer.invoke(IPC.toolsInstall, id),
  onToolProgress: (handler: (p: ToolProgressEvent) => void) => ereignis(IPC.toolsProgress, handler),
  hardwareState: () => ipcRenderer.invoke(IPC.hwState),
  runHardwareTest: () => ipcRenderer.invoke(IPC.hwRun),
  onHardwareState: (handler: (s: HardwareState) => void) => ereignis(IPC.hwState, handler),
  probeRender: () => ipcRenderer.invoke(IPC.hwProbe),
  jobsState: () => ipcRenderer.invoke(IPC.jobsState),
  jobAction: (action: JobAction, id?: string) => ipcRenderer.invoke(IPC.jobsAction, action, id),
  onJobsState: (handler: (s: QueueState) => void) => ereignis(IPC.jobsState, handler),
  jobImage: (id: string) => ipcRenderer.invoke(IPC.jobsImage, id),
  setupState: () => ipcRenderer.invoke(IPC.setupState),
  setupComplete: (done: boolean) => ipcRenderer.invoke(IPC.setupComplete, done),
  onSetupStep(handler: (step: number) => void) {
    return ereignis<unknown>(IPC.setupStep, (step) => {
      if (typeof step === 'number') handler(step)
    })
  }
}

contextBridge.exposeInMainWorld('cs', api)
