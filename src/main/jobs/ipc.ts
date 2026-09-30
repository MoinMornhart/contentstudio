import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/app'
import type { JobQueue } from './queue'

export function registerJobsIpc(queue: JobQueue, getWindow: () => BrowserWindow | undefined): void {
  queue.on('change', (state) => getWindow()?.webContents.send(IPC.jobsState, state))
  ipcMain.handle(IPC.jobsState, () => queue.state())
  ipcMain.handle(IPC.jobsAction, async (_e, action: unknown, id: unknown) => {
    const jobId = typeof id === 'string' ? id : ''
    switch (action) {
      case 'pause':
        await queue.pause(jobId)
        break
      case 'resume':
        await queue.resume(jobId)
        break
      case 'cancel':
        await queue.cancel(jobId)
        break
      case 'pauseAll':
        await queue.pauseAll()
        break
      case 'resumeAll':
        await queue.resumeAll()
        break
      default:
        throw new Error(`Unbekannte Aktion: ${String(action)}`)
    }
    return queue.state()
  })
}
