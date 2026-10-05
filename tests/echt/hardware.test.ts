// Hardware-Test und Leistungsbericht auf diesem Rechner (ROADMAP 8.4), wie beim ersten Start und der Knopf in
// Einstellungen → Hardware, ohne Electron. Werkzeuge aus CONTENTSTUDIO_TOOLS_DIR; der Test arbeitet in einem eigenen
// Ordner (Kopie der Werkzeugliste), damit er dort nichts verändert.
// Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/hardware.test.ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { leistungsbericht } from '../../src/main/hardware/leistung'
import { ProfileStore } from '../../src/main/hardware/profile'
import { runHardwareTest } from '../../src/main/hardware/run'
import { ToolManager } from '../../src/main/tools/manager'
import { FFMPEG, PY_DIR, ROOT, SKRIPTE, TEST_ECHT } from './hilfen'

it('erkennt die Hardware, misst und schreibt den Leistungsbericht', async () => {
  const root = join(TEST_ECHT, 'hardware')
  mkdirSync(root, { recursive: true })
  if (existsSync(join(ROOT, 'tools.json'))) copyFileSync(join(ROOT, 'tools.json'), join(root, 'tools.json'))
  const profiles = new ProfileStore(root)
  const profil = await runHardwareTest({
    tools: new ToolManager(root),
    profiles,
    appVersion: 'dev',
    benchScript: join(SKRIPTE, 'bench.py'),
    root,
    blender: true,
    onProgress: (p) => console.log(`  ${p.percent} % ${p.step}`)
  })
  writeFileSync(join(root, 'profil-zusammenfassung.json'), JSON.stringify({ hardware: profil.hardware, config: ProfileStore.effective(profil) }, null, 1))
  console.log(JSON.stringify(ProfileStore.effective(profil)))
  const python = join(PY_DIR, 'Scripts', 'python.exe')
  const r = await leistungsbericht({ ordner: join(root, 'leistung'), ffmpeg: FFMPEG, profil, python: existsSync(python) ? python : null, whisperSkript: join(SKRIPTE, 'transkript.py'), whisperModelle: join(ROOT, 'py', 'modelle', 'whisper'), version: 'dev' })
  console.log(r.datei)
  console.log(readFileSync(r.datei, 'utf8'))
  expect(r.schritte.filter((s) => s.sekunden !== null).length).toBeGreaterThanOrEqual(2)
}, 3_600_000)
