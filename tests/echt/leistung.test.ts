// Leistungsbericht auf diesem Rechner (ROADMAP 8.4), wie der Knopf in Einstellungen → Hardware, ohne Electron.
// Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/leistung.test.ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { leistungsbericht } from '../../src/main/hardware/leistung'
import { ProfileStore } from '../../src/main/hardware/profile'
import { FFMPEG, PY_DIR, ROOT, SKRIPTE, TEST_ECHT } from './hilfen'

it('schreibt einen Leistungsbericht mit Export und Spracherkennung', async () => {
  const profil = await new ProfileStore(join(process.env['APPDATA'] ?? '', 'ContentStudio')).load()
  const python = join(PY_DIR, 'Scripts', 'python.exe')
  const r = await leistungsbericht({ ordner: join(TEST_ECHT, 'leistung'), ffmpeg: FFMPEG, profil, python: existsSync(python) ? python : null, whisperSkript: join(SKRIPTE, 'transkript.py'), whisperModelle: join(ROOT, 'py', 'modelle', 'whisper'), version: 'dev' })
  console.log(r.datei)
  expect(r.schritte.filter((s) => s.sekunden !== null).length).toBeGreaterThanOrEqual(2)
}, 900_000)
