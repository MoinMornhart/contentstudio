// Herkunft: MoinStudio src/main/index.ts (MIT), auf das Fundament von ContentStudio zugeschnitten.
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC, type AppInfo, type AutostartState } from '@shared/app'
import { istSprache } from '@shared/i18n'
import { parseScreenshotArg, runScreenshotMode, SETUP_FLAG } from './screenshot'
import { runUpdateCli, setupUpdater } from './updater'
import { SettingsStore } from './data/settings'
import { registerDataIpc } from './data/ipc'
import { ToolManager } from './tools/manager'
import { localRoot, registerToolsIpc, runToolsCli, werkzeugRoot } from './tools/ipc'
import { BLENDER_FALLBACK, BLENDER_PRIMARY } from './tools/specs'
import { HardwareController } from './hardware/controller'
import { setupJobs } from './jobs/setup'
import { startAppRpc } from './rpc/app-rpc'
import { erzwingeSprache, registerSetupIpc, spracheStand } from './setup/ipc'
import { setzeHauptSprache } from './i18n'
import { ProfilStore } from './profil/store'
import { registerProfilIpc } from './profil/ipc'
import { brauchtDreiD } from '@shared/profil'
import { kiZentrale } from './ki/zentrale'
import { registerMcpIpc } from './mcp/ipc'
import { registerThumbnailIpc } from './thumbnail/ipc'
import { registerLogoIpc } from './logo/ipc'
import { registerSchnittIpc } from './schnitt/ipc'
import { medienBedienen, medienSchemaAnmelden } from './schnitt/medien'
import { registerPlanungIpc } from './planung/ipc'
import { registerProgrammeIpc } from './programme/ipc'
import { installiereCloudGeduld } from './data/cloud-geduld'

// Tests: eigener Einstellungsordner statt %APPDATA%\ContentStudio (vor allem anderen setzen)
if (process.env['CS_USERDATA']) app.setPath('userData', process.env['CS_USERDATA'])
// Video-Player im Schnitt-Reiter: eigenes Protokoll cs-media:// (muss vor „ready“ angemeldet sein)
medienSchemaAnmelden()
// vor dem ersten Dateizugriff: Sperren von iCloud, OneDrive und Dropbox im Datenordner abwarten statt Fehler zu zeigen
installiereCloudGeduld()

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--cs-${name}=`))?.split('=').slice(1).join('=')
const screenshotDir = parseScreenshotArg(process.argv)
/** `--cs-sprache=en` erzwingt eine Sprache ohne sie zu speichern (Screenshots in beiden Sprachen) */
const spracheArg = arg('sprache')
const mainWindow = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0]
const settings = new SettingsStore(app.getPath('userData'))
const tools = new ToolManager(werkzeugRoot())
const profil = new ProfilStore(settings)
// Blender nur, wenn das Profil 3D braucht (Spiel-Avatar, 3D-Modell) oder es schon installiert ist.
const brauchtBlender = async (): Promise<boolean> =>
  (await profil.laden().then(brauchtDreiD, () => false)) || (await tools.exePath(BLENDER_PRIMARY)) !== null || (await tools.exePath(BLENDER_FALLBACK)) !== null
const hardware = new HardwareController(tools, localRoot(), mainWindow, brauchtBlender)
registerDataIpc(settings, mainWindow, () => profil.vergessen())
registerProfilIpc(profil, mainWindow)
registerMcpIpc()
export const ki = kiZentrale({ profil, userData: app.getPath('userData'), localRoot: localRoot(), fenster: mainWindow })
registerToolsIpc(tools, mainWindow)
hardware.register()
// Im Screenshot-Modus den Assistenten nur zeigen, wenn er ausdrücklich aufgenommen werden soll
registerSetupIpc(settings, !!screenshotDir && !process.argv.includes(SETUP_FLAG))
const { queue: jobs, enqueueProbe } = setupJobs(localRoot(), tools, hardware, mainWindow)
const thumbnail = registerThumbnailIpc({ queue: jobs, settings, profil, hardware, tools, ki: ki.schicht, fenster: mainWindow })
registerLogoIpc({ queue: jobs, profil, ki: ki.schicht, umgebung: thumbnail.umgebung, fenster: mainWindow })
const schnitt = registerSchnittIpc({ queue: jobs, profil, tools, hardware, ki: ki.schicht, fenster: mainWindow, starteVideo: thumbnail.starteVideo })
registerProgrammeIpc({ queue: jobs, profil, tools, fenster: mainWindow, userData: app.getPath('userData') })
const planung = registerPlanungIpc({ queue: jobs, profil, ki: ki.schicht, fenster: mainWindow, userData: app.getPath('userData'), starteThumbnail: thumbnail.starte, starteImport: schnitt.starteImport })
medienBedienen(settings)

// Fester Name für den Autostart-Eintrag (HKCU\...\Run). Ohne ihn leitet Electron den Namen
// aus der AppUserModelId ab, und Setzen und Abfragen könnten verschiedene Einträge meinen.
const LOGIN_ITEM = { name: 'ContentStudio' }
app.setAppUserModelId('io.github.moinmornhart.contentstudio')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: `ContentStudio ${app.getVersion()}`,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => {
    if (!screenshotDir) win.show()
  })

  // Externe Links im Standardbrowser öffnen, nie in der App.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

ipcMain.handle(IPC.appInfo, (): AppInfo => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node
}))

ipcMain.handle(IPC.openLogs, async () => {
  const dir = app.getPath('logs')
  await mkdir(dir, { recursive: true })
  await shell.openPath(dir)
})

function autostartState(): AutostartState {
  if (!app.isPackaged) return { available: false, enabled: false }
  const items = app.getLoginItemSettings().launchItems ?? []
  return { available: true, enabled: items.some((i) => i.name === LOGIN_ITEM.name && i.enabled) }
}

ipcMain.handle(IPC.autostartGet, () => autostartState())
ipcMain.handle(IPC.autostartSet, (_e, enabled: unknown) => {
  if (app.isPackaged) app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: enabled === true })
  return autostartState()
})

/** Sprache des Hauptprozesses aus den Einstellungen (oder dem Startargument) setzen */
async function spracheLaden(): Promise<void> {
  if (istSprache(spracheArg)) erzwingeSprache(spracheArg)
  setzeHauptSprache((await spracheStand(settings)).wirksam)
}

// Befehle ohne Oberfläche (Einrichtung, Tests)
const autostartArg = arg('autostart')
const updateArg = arg('update')
const toolsArg = arg('tools')
const ohneOberflaeche = (fn: () => Promise<number>): void => {
  void app.whenReady().then(async () => {
    try {
      await spracheLaden()
      app.exit(await fn())
    } catch (err) {
      console.error(err)
      app.exit(1)
    }
  })
}

if (toolsArg === 'install' || toolsArg === 'install-all') {
  ohneOberflaeche(() => runToolsCli(tools, toolsArg === 'install-all'))
} else if (process.argv.includes('--cs-probe')) {
  // Integrationstest Job-System: Probebild rendern, mittendrin 3 s pausieren, fortsetzen.
  ohneOberflaeche(async () => {
    await jobs.start()
    const t0 = Date.now()
    const log = (m: string): void => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`)
    const id = await enqueueProbe()
    log('job started')
    await new Promise((r) => setTimeout(r, 1500))
    await jobs.pause(id)
    log(`paused: ${jobs.get(id)?.state}`)
    await new Promise((r) => setTimeout(r, 3000))
    await jobs.resume(id)
    log(`resumed: ${jobs.get(id)?.state}`)
    const info = await jobs.waitFor(id)
    log(`end: ${info.state} ${info.error ?? ''} ${JSON.stringify(jobs.result(id) ?? {})}`)
    return info.state === 'done' ? 0 : 1
  })
} else if (process.argv.includes('--cs-hwtest')) {
  // Hardware-Test ohne Oberfläche; `--cs-hwtest-blender` erzwingt den Blender-Teil. Ergebnis in logs\hardware.log.
  ohneOberflaeche(async () => {
    const profile = await hardware.run(process.argv.includes('--cs-hwtest-blender') ? true : undefined)
    console.log(JSON.stringify(profile.config, null, 2))
    return 0
  })
} else if (updateArg === 'check' || updateArg === 'install') {
  void app.whenReady().then(async () => {
    const code = await runUpdateCli(updateArg)
    // Bei „install“ beendet quitAndInstall die App selbst; sonst hier beenden.
    if (updateArg === 'check' || code !== 0) app.exit(code)
  })
} else if (autostartArg === 'on' || autostartArg === 'off') {
  void app.whenReady().then(() => {
    if (app.isPackaged) app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: autostartArg === 'on' })
    app.exit(app.isPackaged ? 0 : 3)
  })
} else if (!app.requestSingleInstanceLock() && !screenshotDir) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    await spracheLaden()
    const win = createWindow()
    // Prüfabläufe im Aufnahme-Modus (CS_SCREENSHOT_SCHRITTE) brauchen laufende Aufträge
    if (screenshotDir && process.env['CS_SCREENSHOT_SCHRITTE']) void jobs.start()
    if (!screenshotDir) {
      void jobs.start()
      // Verbindung für MCP-Server und Fernsteuerung
      startAppRpc({ settings, hardware, jobs, enqueueProbe, starteThumbnail: thumbnail.starte, schnitt, planung, profil, konten: async () => (await profil.laden()).konten.map((k) => ({ id: k.id, name: k.name, plattform: k.plattform, richtungen: k.richtungen })) }).catch((err: unknown) => console.error('pipe server:', err))
      setupUpdater(mainWindow)
    }
    // Erster Start bzw. geändertes Gerät: Hardware-Test im Hintergrund (nur in der installierten App,
    // damit Entwicklungsläufe nicht jedes Mal Werkzeuge herunterladen).
    if (!screenshotDir && app.isPackaged) {
      win.webContents.once('did-finish-load', () => void hardware.autoRunIfNeeded())
    }
    if (screenshotDir) {
      try {
        await runScreenshotMode(win, screenshotDir)
        app.exit(0)
      } catch (err) {
        console.error('screenshot mode failed:', err)
        app.exit(1)
      }
    }
  })

  app.on('window-all-closed', () => app.quit())
}
