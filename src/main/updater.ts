import { app, ipcMain, type BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { IPC, type UpdateStatus } from '@shared/app'

/** Macht aus den Release-Notizen (HTML, Text oder Liste) kurzen Klartext für die Anzeige. */
export function releaseNotesText(notes: UpdateInfo['releaseNotes']): string {
  const raw = Array.isArray(notes) ? notes.map((n) => n.note ?? '').join('\n') : (notes ?? '')
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000)
}

/**
 * Update-Funktion über GitHub-Releases. Nichts passiert automatisch außer der Prüfung beim Start:
 * Herunterladen und Installieren löst der Nutzer per Knopf aus.
 */
export function setupUpdater(getWindow: () => BrowserWindow | undefined): void {
  let status: UpdateStatus = app.isPackaged ? { state: 'idle' } : { state: 'dev' }
  const publish = (next: UpdateStatus): UpdateStatus => {
    status = next
    getWindow()?.webContents.send(IPC.updateStatus, status)
    return status
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-not-available', (info) => publish({ state: 'none', version: info.version }))
  autoUpdater.on('update-available', (info) =>
    publish({ state: 'available', version: info.version, notes: releaseNotesText(info.releaseNotes) })
  )
  autoUpdater.on('download-progress', (p) => {
    const version = 'version' in status ? status.version : ''
    publish({ state: 'downloading', version, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => publish({ state: 'error', message: err?.message ?? String(err) }))

  ipcMain.handle(IPC.updateCheck, async (): Promise<UpdateStatus> => {
    if (!app.isPackaged) return publish({ state: 'dev' })
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      publish({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return status
  })
  ipcMain.handle(IPC.updateDownload, async () => {
    if (status.state === 'available') await autoUpdater.downloadUpdate()
  })
  ipcMain.handle(IPC.updateInstall, () => {
    if (status.state === 'ready') autoUpdater.quitAndInstall(false, true)
  })

  // Einmal kurz nach dem Start prüfen, ohne den Start zu verzögern.
  if (app.isPackaged) {
    setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 8000)
  }
}

/** Schreibt eine Zeile nach %APPDATA%\ContentStudio\logs\update.log (für Kommandozeile und Fehlersuche). */
function logUpdate(line: string): void {
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'update.log'), `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    // Logging darf nie den Update-Vorgang stören.
  }
}

/**
 * `--cs-update=check|install` ohne Oberfläche: prüft (und installiert) die neueste Version
 * und schreibt das Ergebnis ins Update-Log. Exit-Code 0 = aktuell/erfolgreich gestartet, 1 = Fehler.
 */
export async function runUpdateCli(mode: 'check' | 'install'): Promise<number> {
  autoUpdater.autoDownload = false
  autoUpdater.allowPrerelease = false
  logUpdate(`cli ${mode}: installierte Version ${app.getVersion()}`)
  try {
    const result = await autoUpdater.checkForUpdates()
    const latest = result?.updateInfo.version
    const newer = result?.isUpdateAvailable === true
    logUpdate(`neueste Version ${latest ?? 'unbekannt'}, Update verfügbar: ${newer}`)
    if (mode === 'install' && newer) {
      await autoUpdater.downloadUpdate()
      logUpdate(`heruntergeladen, installiere ${latest}`)
      autoUpdater.quitAndInstall(true, false)
    }
    return 0
  } catch (err) {
    logUpdate(`Fehler: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
