// Herkunft: MoinStudio src/main/tools/ipc.ts (MIT), verallgemeinert für ContentStudio.
import { app, ipcMain, type BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, type ToolStatus } from '@shared/app'
import { ToolManager, type ToolProgress } from './manager'
import { smokeTest } from './smoke'
import { BLENDER_FALLBACK, GRUNDWERKZEUGE, WERKZEUGE, type ToolId, type ToolSpec } from './specs'
import { t } from '../i18n'

/** %LOCALAPPDATA%\ContentStudio – große, gerätespezifische Dateien (nicht im Roaming-Profil, nie im Datenordner). */
export function localRoot(): string {
  return join(process.env['LOCALAPPDATA'] ?? app.getPath('userData'), 'ContentStudio')
}

/**
 * Ordner der Werkzeuge (Blender, FFmpeg, uv). Standard ist localRoot(); `CONTENTSTUDIO_TOOLS_DIR` zeigt auf einen anderen
 * Ordner, z. B. auf Entwicklungsrechnern mit wenig Platz auf einen vorhandenen, geprüften Werkzeug-Ordner.
 */
export function werkzeugRoot(): string {
  return process.env['CONTENTSTUDIO_TOOLS_DIR'] || localRoot()
}

/** Anzeigename in der Sprache der Oberfläche */
export function werkzeugName(spec: ToolSpec): string {
  return spec.id === 'uv' ? t('werkzeuge.uv', { version: spec.version }) : spec.label
}

export async function toolStatus(mgr: ToolManager): Promise<ToolStatus[]> {
  const rows: ToolStatus[] = await Promise.all(
    WERKZEUGE.map(async (spec) => {
      const exe = await mgr.exePath(spec)
      return { id: spec.id, label: werkzeugName(spec), version: spec.version, installed: exe !== null, path: exe, sizeBytes: spec.sizeBytes }
    })
  )
  // Zusätzlich installierte Versionen (z. B. Blender-Rückfall 4.5 LTS aus dem Hardware-Test) mit anzeigen
  const exe = await mgr.exePath(BLENDER_FALLBACK)
  if (exe) {
    rows.push({
      id: BLENDER_FALLBACK.id,
      label: t('werkzeuge.rueckfall', { name: BLENDER_FALLBACK.label }),
      version: BLENDER_FALLBACK.version,
      installed: true,
      path: exe,
      sizeBytes: BLENDER_FALLBACK.sizeBytes
    })
  }
  return rows
}

export function registerToolsIpc(mgr: ToolManager, getWindow: () => BrowserWindow | undefined): void {
  const running = new Map<ToolId, Promise<string>>()
  ipcMain.handle(IPC.toolsStatus, () => toolStatus(mgr))
  ipcMain.handle(IPC.toolsInstall, async (_e, id: unknown) => {
    const spec = WERKZEUGE.find((s) => s.id === id)
    if (!spec) throw new Error(t('werkzeuge.fehler.unbekannt', { id: String(id) }))
    let job = running.get(spec.id)
    if (!job) {
      job = mgr.install(spec, (p) => getWindow()?.webContents.send(IPC.toolsProgress, p))
      running.set(spec.id, job)
      job.finally(() => running.delete(spec.id)).catch(() => undefined)
    }
    await job.catch(() => undefined) // Fehler kommen über das Fortschritts-Ereignis „error“
    return toolStatus(mgr)
  })
}

/**
 * `--cs-tools=install` (FFmpeg und uv) bzw. `--cs-tools=install-all` (zusätzlich Blender): installiert ohne
 * Oberfläche, führt die Starttests aus und protokolliert nach %APPDATA%\ContentStudio\logs\tools.log. Exit 0 = alles ok.
 */
export async function runToolsCli(mgr: ToolManager, alle: boolean): Promise<number> {
  const log = (line: string): void => {
    console.log(line)
    try {
      const dir = app.getPath('logs')
      mkdirSync(dir, { recursive: true })
      appendFileSync(join(dir, 'tools.log'), `${new Date().toISOString()} ${line}\n`, 'utf8')
    } catch {
      // Protokoll ist optional
    }
  }
  let failed = 0
  for (const spec of alle ? WERKZEUGE : GRUNDWERKZEUGE) {
    let last = ''
    const onProgress = (p: ToolProgress): void => {
      const text = `${spec.label}: ${p.phase}${p.percent !== null ? ` ${p.percent}%` : ''}${p.message ? ` – ${p.message}` : ''}`
      // Download-Fortschritt nur in 10er-Schritten protokollieren
      const key = p.phase === 'download' && p.percent !== null ? `download${Math.floor(p.percent / 10)}` : p.phase
      if (key !== last) log(text)
      last = key
    }
    try {
      const exe = await mgr.install(spec, onProgress)
      const smoke = await smokeTest(spec.id, exe)
      log(`${spec.label}: smoke test ${smoke.ok ? 'ok' : 'FAILED'} (${smoke.detail}, ${smoke.ms} ms)`)
      if (!smoke.ok) failed++
    } catch {
      failed++
    }
  }
  return failed === 0 ? 0 : 1
}
