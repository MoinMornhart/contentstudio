// Herkunft: MoinStudio src/main/setup/ipc.ts (MIT). Der vollständige Assistent folgt in ROADMAP M2.
import { app, ipcMain } from 'electron'
import { IPC, type SpracheStand } from '@shared/app'
import { istSprache, spracheAusSystem, type Sprache } from '@shared/i18n'
import type { SettingsStore } from '../data/settings'
import { setzeHauptSprache } from '../i18n'

/** Systemsprache von Windows (Electron liefert z. B. „de-DE“). */
export function systemSprache(): Sprache {
  return spracheAusSystem(app.getPreferredSystemLanguages()[0] ?? app.getLocale())
}

/** Für Aufnahmen in beiden Sprachen (`--cs-sprache=en`): gilt, ohne gespeichert zu werden. */
let erzwungen: Sprache | null = null
export function erzwingeSprache(sprache: Sprache): void {
  erzwungen = sprache
}

export async function spracheStand(settings: SettingsStore): Promise<SpracheStand> {
  const gewaehlt = (await settings.load()).sprache
  const system = systemSprache()
  return { gewaehlt, wirksam: erzwungen ?? gewaehlt ?? system, system }
}

export function registerSetupIpc(settings: SettingsStore, forceCompleted: boolean): void {
  ipcMain.handle(IPC.setupState, async () => (forceCompleted ? true : (await settings.load()).setupCompleted))
  ipcMain.handle(IPC.setupComplete, async (_e, done: unknown) => {
    await settings.update({ setupCompleted: done !== false })
    return done !== false
  })
  ipcMain.handle(IPC.spracheGet, () => spracheStand(settings))
  ipcMain.handle(IPC.spracheSet, async (_e, sprache: unknown) => {
    await settings.update({ sprache: istSprache(sprache) ? sprache : null })
    const stand = await spracheStand(settings)
    setzeHauptSprache(stand.wirksam)
    return stand
  })
}
