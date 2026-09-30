/**
 * Globales Aufräumen für Vitest: Tests legen Arbeitsordner mit mkdtemp an („cs-…“, „planung-…“). Nach dem Lauf werden
 * alle, die während des Laufs entstanden sind, gelöscht – sonst sammeln sich Hunderte Ordner im Temp und füllen die Platte.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default function setup(): () => Promise<void> {
  const start = Date.now() - 1000
  return async () => {
    const ordner = tmpdir()
    for (const name of await readdir(ordner).catch(() => [] as string[])) {
      if (!/^(cs-|planung-)/.test(name)) continue
      const p = join(ordner, name)
      const info = await stat(p).catch(() => null)
      if (info?.isDirectory() && info.birthtimeMs >= start) await rm(p, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
