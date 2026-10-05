// Echter Test des Logo-Reiters (aus MoinStudio v0.38.0): Minecraft-Logos aus der Spieldatei (Blender, 2D und 3D) und
// Schrift-Logos mit Fluent-Emoji für andere Richtungen; danach eine Änderung in Worten. Mit CS_KI_WEG=claude-cli plant
// die KI, sonst laufen die Rückfälle ohne KI. Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/logo.test.ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KiSchicht } from '../../src/main/ki/schicht'
import { liesBild } from '../../src/main/bild/rohbild'
import { hatTransparenz } from '../../src/main/logo/bild'
import { logoAenderungJob, logoJob, type Bauart, type LogoPayload } from '../../src/main/logo/job'
import { ClaudeCliTest, findeClaude } from './claude-cli'
import { BLENDER, ctx, mcSkin, TEST_ECHT, umgebung, UV } from './hilfen'

const AUS = join(TEST_ECHT, 'logo')
const WEG = process.env['CS_KI_WEG'] ?? ''

function kiSchicht(): KiSchicht | null {
  if (WEG !== 'claude-cli') return null
  const exe = findeClaude()
  if (!exe) throw new Error('Claude Code nicht gefunden (CS_CLAUDE_CLI setzen)')
  const a = new ClaudeCliTest(exe, process.env['CS_KI_MODELL'] ?? null)
  return new KiSchicht(new Map([[a.id, a]]), async () => [{ id: a.id, aktiv: true }])
}

function payload(bauart: Bauart, ordner: string, beschreibung: string, kanal: string, richtungen: string[]): LogoPayload {
  return {
    beschreibung,
    anzahl: 2,
    kanal: { id: 'k', name: kanal, plattform: 'YouTube', richtungen, sprache: 'de' },
    bauart,
    koepfe: bauart === 'minecraft' ? [{ name: 'Testkanal', datei: mcSkin('alex') }] : [],
    schrift: null,
    farben: ['#ff7a00', '#ffd400'],
    umgebung,
    ausgabe: join(AUS, ordner),
    sprache: 'de'
  }
}

describe.runIf(!!BLENDER && !!UV)('Logos (echt)', () => {
  const ki = kiSchicht()
  const faelle: { name: string; bauart: Bauart; beschreibung: string; kanal: string; richtungen: string[] }[] = [
    { name: 'minecraft', bauart: 'minecraft', beschreibung: 'Kanal-Logo mit meinem Kopf, gold und mutig', kanal: '@testkanal', richtungen: ['gaming'] },
    { name: 'kochen', bauart: 'schrift', beschreibung: 'Kanal-Logo, warm und freundlich, mit einem Symbol fürs Kochen', kanal: '@kochmitkim', richtungen: ['kochen'] }
  ]
  for (const f of faelle) {
    it(`${f.name}: zwei Varianten mit transparentem Hintergrund, dann eine Änderung`, async () => {
      const p = payload(f.bauart, f.name, f.beschreibung, f.kanal, f.richtungen)
      const erg = await logoJob(p, ctx(true) as never, { ki })
      for (const v of erg.varianten) console.log(`  → ${v.bild} · ${v.titel} · ${JSON.stringify(v.warnungen)}`)
      expect(erg.varianten).toHaveLength(2)
      for (const v of erg.varianten) {
        expect(v.fehler).toBeUndefined()
        expect(v.bild && existsSync(v.bild)).toBe(true)
        expect(hatTransparenz(await liesBild(v.bild!))).toBe(true)
      }
      if (ki) {
        const v = erg.varianten[0]!
        const a = await logoAenderungJob({ ...p, wunsch: 'Text in Blau statt der jetzigen Farbe', eltern: 'x', basis: { job: 'x', variante: 0 }, bild: v.bild!, szene: v.szene, ausgabe: join(AUS, `${f.name}-aenderung`) }, ctx(true), { ki })
        console.log(`  → Änderung: ${a.varianten[0]!.bild}`)
        expect(a.varianten[0]!.bild && existsSync(a.varianten[0]!.bild)).toBe(true)
      }
    })
  }
})
