import { app } from 'electron'
import { join } from 'node:path'

/** Mitgelieferte Dateien: im Installer unter resources/<name> (electron-builder extraResources), sonst im Repo. */
const DEV: Record<string, string> = {
  config: 'config',
  blender: 'blender',
  minecraft: 'resources/minecraft',
  prompts: 'resources/prompts',
  stilbuecher: 'resources/stilbuecher'
}

export function resourceDir(name: keyof typeof DEV | string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), DEV[name] ?? name)
}
