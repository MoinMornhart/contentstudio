import type { BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { IPC, TABS } from '@shared/app'

const FLAG = '--cs-screenshot='
/** Zusätzlich zu `--cs-screenshot=`: statt der Reiter die Schritte des Einrichtungsassistenten aufnehmen */
export const SETUP_FLAG = '--cs-screenshot-setup'
export const SETUP_STEPS = 4

/** Liest `--cs-screenshot=<ordner>` aus den Startargumenten (für Selbstprüfung und README-Bilder). */
export function parseScreenshotArg(argv: readonly string[]): string | null {
  const arg = argv.find((a) => a.startsWith(FLAG))
  if (!arg) return null
  const dir = arg.slice(FLAG.length).trim()
  return dir ? resolve(dir) : null
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Schaltet jeden Reiter durch und speichert je ein PNG, ohne das Fenster anzuzeigen. */
export async function runScreenshotMode(win: BrowserWindow, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  if (win.webContents.isLoading()) {
    await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))
  }
  await wait(800)
  if (process.argv.includes(SETUP_FLAG)) {
    for (let step = 0; step < SETUP_STEPS; step++) {
      win.webContents.send(IPC.setupStep, step)
      await wait(1500)
      await writeFile(join(dir, `setup-${step + 1}.png`), (await win.webContents.capturePage()).toPNG())
    }
    return
  }
  for (const tab of TABS) {
    win.webContents.send(IPC.selectTab, tab.id)
    await wait(1200)
    await writeFile(join(dir, `${tab.id}.png`), (await aufnahme(win)).toPNG())
  }
  await zusatzSchritte(win, dir)
}

/**
 * Selbstprüfung von Bedienabläufen: `CS_SCREENSHOT_SCHRITTE=<datei.json>` enthält
 * `[{ "reiter"?: "planung", "js"?: "…", "warte"?: 800, "name"?: "planung-details" }]`. Jeder Schritt wechselt optional den
 * Reiter, führt JavaScript in der Oberfläche aus und speichert bei `name` ein Bild. Das Ergebnis des Skripts landet in
 * `schritte.json`.
 */
async function zusatzSchritte(win: BrowserWindow, dir: string): Promise<void> {
  const datei = process.env['CS_SCREENSHOT_SCHRITTE']
  if (!datei) return
  const schritte = JSON.parse(await readFile(datei, 'utf8')) as { reiter?: string; js?: string; warte?: number; name?: string }[]
  const ergebnisse: unknown[] = []
  for (const s of schritte) {
    if (s.reiter) win.webContents.send(IPC.selectTab, s.reiter)
    ergebnisse.push(s.js ? await win.webContents.executeJavaScript(s.js, true).catch((e: Error) => `Fehler: ${e.message}`) : null)
    await wait(s.warte ?? 800)
    if (s.name) await writeFile(join(dir, `${s.name}.png`), (await aufnahme(win)).toPNG())
  }
  await writeFile(join(dir, 'schritte.json'), JSON.stringify(ergebnisse, null, 2))
}

/** Auf langsamen Rechnern liefert die Aufnahme manchmal ein leeres, einfarbiges Bild – dann warten und neu aufnehmen. */
async function aufnahme(win: BrowserWindow): Promise<Electron.NativeImage> {
  let bild = await win.webContents.capturePage()
  for (let versuch = 0; versuch < 5 && einfarbig(bild); versuch++) {
    await wait(1000)
    win.webContents.invalidate()
    bild = await win.webContents.capturePage()
  }
  return bild
}

function einfarbig(bild: Electron.NativeImage): boolean {
  const px = bild.toBitmap()
  for (let i = 4; i < px.length; i += 4 * 997) if (px[i] !== px[0] || px[i + 1] !== px[1] || px[i + 2] !== px[2]) return false
  return true
}
