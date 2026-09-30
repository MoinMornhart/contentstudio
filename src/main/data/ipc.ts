import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { stat } from 'node:fs/promises'
import { IPC, type DataDirStatus } from '@shared/app'
import { ensureDataLayout, findSyncConflicts, resolveDataDir } from './datadir'
import type { SettingsStore } from './settings'
import { t } from '../i18n'

async function exists(dir: string): Promise<boolean> {
  return (await stat(dir).catch(() => null))?.isDirectory() === true
}

export async function dataDirStatus(settings: SettingsStore): Promise<DataDirStatus> {
  const { dataDir } = await settings.load()
  if (!dataDir) return { dataDir: null, available: false, conflicts: [] }
  const available = await exists(dataDir)
  return { dataDir, available, conflicts: available ? await findSyncConflicts(dataDir) : [] }
}

export function registerDataIpc(settings: SettingsStore, getWindow: () => BrowserWindow | undefined, gewechselt: () => void = () => undefined): void {
  ipcMain.handle(IPC.dataStatus, () => dataDirStatus(settings))

  ipcMain.handle(IPC.dataChoose, async (): Promise<DataDirStatus | null> => {
    const win = getWindow()
    const options = {
      title: t('daten.dialogTitel'),
      buttonLabel: t('daten.dialogKnopf'),
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
    }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const chosen = res.filePaths[0]
    if (res.canceled || !chosen) return null
    const dataDir = await resolveDataDir(chosen)
    await ensureDataLayout(dataDir)
    await settings.update({ dataDir })
    gewechselt()
    return dataDirStatus(settings)
  })

  ipcMain.handle(IPC.dataOpen, async () => {
    const { dataDir } = await settings.load()
    if (dataDir && (await exists(dataDir))) await shell.openPath(dataDir)
  })
}
