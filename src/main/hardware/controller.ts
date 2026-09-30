// Herkunft: MoinStudio src/main/hardware/controller.ts (MIT). Blender wird nur getestet, wenn 3D gebraucht wird.
import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/app'
import type { DeviceProfile, HardwareState } from '@shared/hardware'
import { ProfileStore } from './profile'
import { needsHardwareTest, runHardwareTest } from './run'
import type { ToolManager } from '../tools/manager'
import { t } from '../i18n'
import { leistungsbericht } from './leistung'
import { FFMPEG } from '../tools/specs'
import { resourceDir } from '../resources'

/** Pfad zum Blender-Messskript (Entwicklung: Projektordner, installiert: resources). */
export function benchScriptPath(): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'blender') : join(app.getAppPath(), 'blender')
  return join(base, 'bench.py')
}

function logLine(line: string): void {
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'hardware.log'), `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    // Protokoll ist optional
  }
}

/** Verwaltet den Hardware-Test: Zustand, Fortschritt an die Oberfläche, automatischer Start. */
export class HardwareController {
  private state: HardwareState = { state: 'none' }
  private running: Promise<DeviceProfile> | null = null
  readonly profiles: ProfileStore

  /**
   * @param brauchtBlender  Braucht dieses Profil 3D (Spiel-Avatar, 3D-Modell, 3D-Szene)? Nur dann lädt und misst der
   *                        Test Blender.
   */
  constructor(
    private readonly tools: ToolManager,
    private readonly root: string,
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly brauchtBlender: () => Promise<boolean>
  ) {
    this.profiles = new ProfileStore(app.getPath('userData'))
  }

  private publish(next: HardwareState): void {
    this.state = next
    this.getWindow()?.webContents.send(IPC.hwState, next)
  }

  /** Ergebnis der (langsamen, PowerShell-basierten) Prüfung, ob das Profil noch zum Gerät passt. */
  private outdated: boolean | null = null

  async current(): Promise<HardwareState> {
    if (this.state.state === 'running' || this.state.state === 'error') return this.state
    const profile = await this.profiles.load()
    if (!profile) return { state: 'none' }
    if (this.outdated === null) {
      // Sofort antworten, die Prüfung läuft im Hintergrund und meldet sich per Ereignis.
      void this.brauchtBlender()
        .then((blender) => needsHardwareTest(this.profiles, this.tools, app.getVersion(), this.root, blender))
        .then((outdated) => {
          this.outdated = outdated
          if (outdated) this.publish({ state: 'done', profile, outdated })
        })
    }
    return { state: 'done', profile, outdated: this.outdated ?? false }
  }

  /** Startet den Test (oder hängt sich an einen laufenden an). `blender` erzwingt bzw. verbietet den Blender-Teil. */
  run(blender?: boolean): Promise<DeviceProfile> {
    if (this.running) return this.running
    logLine('hardware test started')
    this.publish({ state: 'running', progress: { percent: 0, step: t('jobs.schritt.startet') } })
    let lastStep = ''
    this.running = (blender !== undefined ? Promise.resolve(blender) : this.brauchtBlender())
      .then((mitBlender) =>
        runHardwareTest({
          tools: this.tools,
          profiles: this.profiles,
          appVersion: app.getVersion(),
          benchScript: benchScriptPath(),
          root: this.root,
          blender: mitBlender,
          onProgress: (progress) => {
            if (progress.step !== lastStep && progress.percent % 5 === 0) logLine(`${progress.percent}% ${progress.step}`)
            lastStep = progress.step
            this.publish({ state: 'running', progress })
          }
        })
      )
      .then((profile) => {
        logLine(`done in ${profile.durationSeconds}s: ${JSON.stringify(profile.config)}`)
        this.outdated = false
        this.publish({ state: 'done', profile, outdated: false })
        return profile
      })
      .catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        logLine(`ERROR: ${message}`)
        this.publish({ state: 'error', message, profile: await this.profiles.load() })
        throw err
      })
      .finally(() => {
        this.running = null
      })
    return this.running
  }

  /** Beim App-Start: Test ausführen, wenn noch keiner lief oder sich das Gerät geändert hat. */
  async autoRunIfNeeded(): Promise<void> {
    const blender = await this.brauchtBlender()
    if (await needsHardwareTest(this.profiles, this.tools, app.getVersion(), this.root, blender)) {
      await this.run(blender).catch(() => undefined)
    }
  }

  register(): void {
    ipcMain.handle(IPC.hwState, () => this.current())
    ipcMain.handle(IPC.hwRun, async () => {
      await this.run().catch(() => undefined)
      return this.current()
    })
    // Leistungsbericht (ROADMAP 8.4): misst Export und Spracherkennung, schreibt Markdown und öffnet es
    ipcMain.handle(IPC.hwLeistung, async () => {
      const python = join(this.root, 'py', 'vorlage', 'Scripts', 'python.exe')
      const r = await leistungsbericht({
        ordner: join(this.root, 'leistung'),
        ffmpeg: await this.tools.exePath(FFMPEG),
        profil: await this.profiles.load(),
        python: existsSync(python) ? python : null,
        whisperSkript: join(resourceDir('blender'), 'transkript.py'),
        whisperModelle: join(this.root, 'py', 'modelle', 'whisper'),
        version: app.getVersion(),
        melde: (percent, step) => this.getWindow()?.webContents.send(IPC.hwLeistungStand, { percent, step })
      })
      void shell.openPath(r.datei)
      return r
    })
  }
}
