// Echter Test der Spiele-Vorlage für jede Art von Bild (aus MoinStudio v0.38.0–v0.41.0): Box je Person, Hände,
// Freunde mit eigener Maske, Schlussprüfung mit Korrektur. Vorlagen: ein Porträtfoto und ein Thumbnail mit zwei
// Personen (aus den CC0-Testfotos gebaut). Mit Bild-KI (z. B. CS_KI_WEG=claude-cli) läuft der volle Weg, sonst der
// Rückfall ohne KI. Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/vorlage.test.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KiSchicht } from '../../src/main/ki/schicht'
import { thumbnailJob } from '../../src/main/thumbnail/job'
import { stilKontext } from '../../src/main/thumbnail/kontext'
import type { FigurDaten, ThumbPayload } from '../../src/main/thumbnail/typen'
import { vorlageJob } from '../../src/main/thumbnail/vorlage'
import { ThumbStartSchema, type Engine } from '../../src/shared/thumbnail'
import { fakeKi } from '../ki-fake'
import { ClaudeCliTest, findeClaude } from './claude-cli'
import { BLENDER, ctx, mcSkin, TEST_ECHT, umgebung, UV } from './hilfen'

const AUS = join(TEST_ECHT, 'vorlage')
const FOTOS = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-fotos')
const WEG = process.env['CS_KI_WEG'] ?? ''

/** CC0-Testfotos aus tests/fixtures/testfotos.json, nur lokal (nie im Repo) */
async function testFotos(): Promise<string[]> {
  const liste = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'testfotos.json'), 'utf8')) as { fotos: { id: string; url: string }[] }
  mkdirSync(FOTOS, { recursive: true })
  for (const f of liste.fotos) {
    const ziel = join(FOTOS, `${f.id}.jpg`)
    if (existsSync(ziel)) continue
    const r = await fetch(f.url, { headers: { 'User-Agent': 'ContentStudio-Tests/1.0 (https://github.com/MoinMornhart/contentstudio)' } })
    if (!r.ok) throw new Error(`${f.url} → ${r.status}`)
    writeFileSync(ziel, Buffer.from(await r.arrayBuffer()))
  }
  return readdirSync(FOTOS).filter((f) => f.endsWith('.jpg')).sort().map((f) => join(FOTOS, f))
}

function kiSchicht(): KiSchicht | null {
  if (WEG !== 'claude-cli') return null
  const exe = findeClaude()
  if (!exe) throw new Error('Claude Code nicht gefunden (CS_CLAUDE_CLI setzen)')
  const a = new ClaudeCliTest(exe, process.env['CS_KI_MODELL'] ?? null)
  return new KiSchicht(new Map([[a.id, a]]), async () => [{ id: a.id, aktiv: true }])
}

const figur = (x: Partial<FigurDaten>): FigurDaten => ({ id: 'ich', name: 'Test', rolle: 'ich', skin: null, slim: null, fotos: [], mensch: false, modell: null, ...x })

function payload(engine: Engine, figuren: FigurDaten[], ordner: string, quelle: string | null, beschreibung = ''): ThumbPayload {
  return {
    start: ThumbStartSchema.parse(quelle ? { art: 'vorlage', kontoId: 'k', quelle, beschreibung } : { kontoId: 'k', beschreibung, anzahl: 1 }),
    engine,
    kanal: { id: 'k', name: '@testkanal', plattform: 'YouTube', richtungen: [], sprache: 'de' },
    figuren,
    stil: stilKontext({ vorbilder: [], stilbuch: null, beispiel: null, auftrag: [], farben: ['#ffd400'] }),
    marke: { schrift: null, logo: null, farben: ['#ffd400'] },
    hintergrund: null,
    umgebung,
    ausgabe: join(AUS, ordner),
    sprache: 'de'
  }
}

describe.runIf(!!BLENDER && !!UV)('Spiele-Vorlage (echt)', () => {
  const ki = kiSchicht()
  let fotos: string[] = []
  let zwei = ''

  it('Vorlagen bauen: Thumbnail mit zwei Personen aus den Testfotos', async () => {
    fotos = await testFotos()
    expect(fotos.length).toBeGreaterThanOrEqual(4)
    const personen = [
      { id: 'ich', ausdruck: 'froh', seite: 'links', kopf_anteil: 0.3 },
      { id: 'freund', ausdruck: 'froh', seite: 'rechts', kopf_anteil: 0.28, spiegeln: true }
    ]
    const { schicht } = fakeKi(() => ({ varianten: [{ titel: 'Zwei', vorbild: 'frei', warum: 'Test', hintergrund: { art: 'verlauf', farben: ['#15205c', '#ff5a36'], winkel: 25 }, personen, text: [{ text: 'WER GEWINNT?' }], look: { kontrast: 1.08, saettigung: 1.12, vignette: 0.2 } }] }), { bilder: false })
    const erg = await thumbnailJob(payload('foto', [figur({ fotos: [fotos[0]!], mensch: true }), figur({ id: 'freund', name: 'Freund', rolle: 'freund', fotos: [fotos[1]!], mensch: true })], 'zwei-personen', null, 'Wer gewinnt?'), ctx(), { ki: schicht })
    zwei = erg.varianten[0]!.bild!
    expect(existsSync(zwei)).toBe(true)
  })

  const fall = async (name: string, engine: Engine, figuren: () => FigurDaten[], quelle: () => string, wunsch = ''): Promise<void> => {
    const p = payload(engine, figuren(), name, quelle(), wunsch)
    const erg = await vorlageJob(p, ctx(true) as never, { ki })
    const v = erg.varianten[0]!
    console.log(`  → ${v.bild} · ${JSON.stringify(v.pruefung)}`)
    expect(v.fehler).toBeNull()
    expect(v.bild && existsSync(v.bild)).toBe(true)
    if (ki) {
      const analyse = JSON.parse(readFileSync(join(p.ausgabe, 'analyse.json'), 'utf8')) as { box?: number[] }
      expect(analyse.box).toHaveLength(4)
      // Die Schlussprüfung hat mindestens einmal geurteilt
      expect(existsSync(join(p.ausgabe, 'pruefung-1.json'))).toBe(true)
    }
  }

  it('Minecraft-Figur in ein Porträtfoto', () => fall('mc-portraet', 'minecraft', () => [figur({ skin: mcSkin('alex'), slim: true })], () => fotos[2]!))

  it('Minecraft: zwei Figuren in ein Thumbnail mit zwei Personen (eigene Maske je Person)', async () => {
    await fall('mc-zwei', 'minecraft', () => [figur({ skin: mcSkin('alex'), slim: true }), figur({ id: 'freund', name: 'Freund', rolle: 'freund', skin: mcSkin('steve'), slim: false })], () => zwei)
    if (ki) {
      const person = JSON.parse(readFileSync(join(AUS, 'mc-zwei', 'person.json'), 'utf8')) as { personen?: unknown[] }
      expect(person.personen?.length).toBe(2)
    }
  })

  it('Foto: zwei andere Personen in das Thumbnail mit zwei Personen', () =>
    fall('foto-zwei', 'foto', () => [figur({ fotos: [fotos[2]!], mensch: true }), figur({ id: 'freund', name: 'Freund', rolle: 'freund', fotos: [fotos[3]!], mensch: true })], () => zwei))
})
