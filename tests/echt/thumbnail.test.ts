// Echter Nachbau-Test der Thumbnail-Pipeline (ROADMAP 4.3, 4.4, 4.7, 4.8): Die KI-Antworten sind vorgegeben (so, wie
// eine KI sie planen würde), alles andere läuft echt: Blender (Minecraft-Welt, GLB-Avatar), Freistellen mit rembg,
// Text, Logo, Selbstprüfung. Braucht Blender, uv und die Bild-Umgebung aus CONTENTSTUDIO_TOOLS_DIR sowie die
// Minecraft-Spieldatei im Zwischenspeicher. Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/thumbnail.test.ts
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leeresProfil } from '../../src/shared/profil'
import { ThumbStartSchema, type Engine } from '../../src/shared/thumbnail'
import { thumbnailJob } from '../../src/main/thumbnail/job'
import { stilKontext } from '../../src/main/thumbnail/kontext'
import type { FigurDaten, ThumbPayload } from '../../src/main/thumbnail/typen'
import type { ThumbUmgebung } from '../../src/main/thumbnail/umgebung'
import type { JobContext } from '../../src/main/jobs/queue'
import { exportiereFormat, exportierePsd } from '../../src/main/thumbnail/export'
import { fakeKi } from '../ki-fake'

const ROOT = process.env['CONTENTSTUDIO_TOOLS_DIR'] ?? join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio')
const AUS = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-echt', 'thumbnail')
const FOTOS = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-fotos')
const BLENDER = ['4.5.9', '5.2.2'].map((v) => join(ROOT, 'bl', v, 'blender.exe')).find(existsSync)
const UV = readdirSync(join(ROOT, 'uv')).map((v) => join(ROOT, 'uv', v, 'uv.exe')).find(existsSync) ?? null
void leeresProfil

const umgebung: ThumbUmgebung = {
  blender: BLENDER ? { exe: BLENDER, mesa: true, geraet: 'CPU', samples: 16 } : null,
  uv: UV,
  pyDir: join(ROOT, 'py', 'vorlage'),
  modelle: join(ROOT, 'py', 'modelle'),
  skripte: join(__dirname, '..', '..', 'blender'),
  prompts: join(__dirname, '..', '..', 'resources', 'prompts'),
  werkzeugRoot: ROOT,
  mojangErlaubt: false
}

function ctx(): JobContext<never> {
  let cp: unknown
  return {
    id: 'test',
    get checkpoint() {
      return cp as never
    },
    save: async (c: unknown) => void (cp = c),
    progress: (p, s) => console.log(`  ${p ?? '…'} % ${s}`),
    yield: async () => undefined,
    signal: new AbortController().signal,
    track: () => undefined,
    waitUntil: () => {
      throw new Error('limit')
    }
  } as JobContext<never>
}

function payload(engine: Engine, figuren: FigurDaten[], ordner: string, beschreibung: string, logo: string | null = null): ThumbPayload {
  return {
    start: ThumbStartSchema.parse({ kontoId: 'k', beschreibung, anzahl: 1 }),
    engine,
    kanal: { id: 'k', name: '@testkanal', plattform: 'YouTube', richtungen: [], sprache: 'de' },
    figuren,
    stil: stilKontext({ vorbilder: [], stilbuch: null, beispiel: null, auftrag: [], farben: ['#ffd400'] }),
    marke: { schrift: null, logo, farben: ['#ffd400'] },
    hintergrund: null,
    umgebung,
    ausgabe: join(AUS, ordner),
    sprache: 'de'
  }
}

const figur = (x: Partial<FigurDaten>): FigurDaten => ({ id: 'ich', name: 'Test', rolle: 'ich', skin: null, slim: null, fotos: [], mensch: false, modell: null, ...x })

// Szenen, wie eine KI sie nach dem Planungs-Prompt liefern würde
const MINECRAFT: { beschreibung: string; szene: Record<string, unknown>; text?: string }[] = [
  { beschreibung: 'Ich stehe am Klippenrand und schaue in den Abgrund', szene: { welt: { art: 'klippe', kante: 2, tiefe: 20 }, himmel: 'abend', figuren: [{ id: 'ich', pose: 'blick_runter', mimik: 'erschrocken', position: [0, 0], blick: 60 }], kamera: { modus: 'gefahr', seite: 'links', hoehe: 25 } } },
  { beschreibung: 'Ein Creeper schleicht sich an mich heran', szene: { welt: { art: 'wiese', seed: 3 }, himmel: 'tag', figuren: [{ id: 'ich', pose: 'schreck', mimik: 'erschrocken', position: [0, 0], blick: 40 }], mobs: [{ art: 'creeper', position: [3, 3], blick: 'ich' }], kamera: { modus: 'mob', seite: 'links', thema: 'mob:0' } }, text: 'ZU SPÄT' },
  { beschreibung: 'Kampf gegen den Enderdrachen', szene: { welt: { art: 'end' }, himmel: 'end', figuren: [{ id: 'ich', pose: 'sturmangriff', mimik: 'wuetend', position: [0, 0], blick: 65, item: { name: 'diamond_sword', hand: 'r' } }], mobs: [{ art: 'ender_dragon', position: [6, 14], hoehe: 8, blick: 'ich', groesse: 1 }], kamera: { modus: 'held', seite: 'links', thema: 'mob:0' } } },
  { beschreibung: 'Ich finde Diamanten in einer Höhle', szene: { welt: { art: 'hoehle' }, figuren: [{ id: 'ich', pose: 'zur_kamera', mimik: 'froh', position: [0, 0], blick: 20, item: { name: 'diamond', hand: 'l' } }], objekte: [{ block: 'diamond_ore', position: [3, 3, 1], wichtig: true }], kamera: { modus: 'nah', seite: 'links', thema: 'objekt:0' } }, text: 'ENDLICH' },
  { beschreibung: 'Überleben im Nether', szene: { welt: { art: 'nether' }, himmel: 'blutrot', figuren: [{ id: 'ich', pose: 'panik', mimik: 'erschrocken', position: [0, 0], blick: 50 }], mobs: [{ art: 'ghast', position: [6, 12], hoehe: 6, blick: 'ich' }], kamera: { modus: 'mob', seite: 'links', thema: 'mob:0' } } },
  { beschreibung: 'Das Dorf wird von Zombies angegriffen', szene: { welt: { art: 'dorf', haeuser: 5 }, himmel: 'nacht', figuren: [{ id: 'ich', pose: 'schwert', mimik: 'wuetend', position: [0, 0], blick: 55, item: { name: 'iron_sword', hand: 'r' } }], mobs: [{ art: 'zombie', position: [3, 3], blick: 'ich' }, { art: 'villager', position: [-2, 4], blick: 'ich' }], kamera: { modus: 'kampf', seite: 'links', thema: 'mob:0' } } },
  { beschreibung: 'Ich fliege mit der Elytra über das Meer', szene: { welt: { art: 'meer' }, himmel: 'tag', figuren: [{ id: 'ich', pose: 'gleiten', mimik: 'froh', position: [0, 0], hoehe: 5, blick: 30, elytra: 'offen' }], kamera: { modus: 'ganz', seite: 'links' } } },
  { beschreibung: 'Ich jubele, weil ich den Wither besiegt habe', szene: { welt: { art: 'schlucht', kante: 3, tiefe: 15 }, himmel: 'gewitter', figuren: [{ id: 'ich', pose: 'jubeln', mimik: 'froh', position: [0, 0], blick: 15 }], kamera: { modus: 'brust', seite: 'links' } }, text: 'GESCHAFFT' },
  { beschreibung: 'Ein Wolf ist mein neuer Freund', szene: { welt: { art: 'wiese', seed: 11 }, himmel: 'abend', figuren: [{ id: 'ich', pose: 'kopfkratzen', mimik: 'froh', position: [0, 0], blick: 35 }], mobs: [{ art: 'wolf', position: [2.5, 2.5], blick: 'ich', groesse: 1.8 }], kamera: { modus: 'mob', seite: 'links', thema: 'mob:0' } } },
  { beschreibung: 'Auf einer Säule über dem Lavasee', szene: { welt: { art: 'lavameer', bloecke: [{ art: 'netherrack', von: [5, 6, -4], bis: [5, 6, 1] }] }, himmel: 'blutrot', figuren: [{ id: 'ich', pose: 'taumeln', mimik: 'erschrocken', position: [0, 0], blick: 45 }], kamera: { modus: 'gefahr', seite: 'links', hoehe: 30 } } }
]

describe.runIf(!!BLENDER)('Minecraft: 10 Beschreibungen (echter Render)', () => {
  const skin = join(ROOT, 'mc', '26.3', 'extracted', 'assets', 'minecraft', 'textures', 'entity', 'player', 'wide', 'alex.png')
  for (const [i, m] of MINECRAFT.entries()) {
    it(`${i + 1}. ${m.beschreibung}`, async () => {
      const { schicht } = fakeKi((a) => (a.prompt.includes('Korrektur nach dem Render') ? { szene: m.szene } : { varianten: [{ titel: m.beschreibung, vorbild: 'frei', warum: 'Test', text: m.text ? [{ text: m.text }] : [], szene: structuredClone(m.szene) }] }), { bilder: false })
      const erg = await thumbnailJob(payload('minecraft', [figur({ skin, slim: true })], `mc-${i + 1}`, m.beschreibung), ctx(), { ki: schicht })
      const v = erg.varianten[0]!
      console.log(`  → ${v.bild} · Prüfung: ${JSON.stringify(v.pruefung)}`)
      expect(v.fehler).toBeNull()
      expect(v.bild && existsSync(v.bild)).toBe(true)
      expect(v.pruefung.ki).toBeNull() // Test-KI sieht keine Bilder – die App sagt das
    })
  }
})

describe.runIf(!!BLENDER && !!UV)('GLB-Test-Avatar: 5 Beschreibungen', () => {
  const glb = join(AUS, 'avatar.glb')
  const POSEN = [
    { pose: 'zeigen', kamera: 'brust', text: 'SCHAU MAL', farben: ['#15205c', '#ff5a36'] },
    { pose: 'jubeln', kamera: 'ganz', text: 'GEWONNEN', farben: ['#0b3d2e', '#ffd400'] },
    { pose: 'nachdenken', kamera: 'nah', text: '', farben: ['#2b1055', '#7597de'] },
    { pose: 'winken', kamera: 'brust', text: 'HALLO', farben: ['#ff7a00', '#ffd400'] },
    { pose: 'schreck', kamera: 'brust', text: 'WAS?!', farben: ['#111111', '#e0141e'] }
  ] as const
  it('baut den Avatar', () => {
    mkdirSync(AUS, { recursive: true })
    if (!existsSync(glb)) execFileSync(BLENDER!, ['-b', '--factory-startup', '--python', join(__dirname, '..', 'fixtures', 'avatar_bauen.py'), '--', glb], { env: { ...process.env, GALLIUM_DRIVER: 'llvmpipe' } })
    expect(existsSync(glb)).toBe(true)
  })
  for (const [i, p] of POSEN.entries()) {
    it(`${i + 1}. Pose ${p.pose}, Kamera ${p.kamera}`, async () => {
      const { schicht } = fakeKi(() => ({ varianten: [{ titel: p.pose, vorbild: 'frei', warum: 'Test', hintergrund: { art: 'verlauf', farben: [...p.farben] }, personen: [{ id: 'ich', ausdruck: 'froh', seite: i % 2 ? 'rechts' : 'links', kopf_anteil: 0.3 }], modell: { pose: p.pose, kamera: p.kamera, licht: 'studio', kopf: { drehen: 15, neigen: 6 } }, text: p.text ? [{ text: p.text }] : [] }] }), { bilder: false })
      const erg = await thumbnailJob(payload('modell3d', [figur({ modell: glb })], `glb-${i + 1}`, p.pose), ctx(), { ki: schicht })
      const v = erg.varianten[0]!
      console.log(`  → ${v.bild} · ${JSON.stringify(v.pruefung)}`)
      expect(v.fehler).toBeNull()
      expect(v.bild && existsSync(v.bild)).toBe(true)
    })
  }
})

describe.runIf(!!UV && existsSync(FOTOS))('Foto-Compositing: 10 Beschreibungen mit neutralen Testfotos', () => {
  const alle = existsSync(FOTOS) ? readdirSync(FOTOS).filter((f) => f.endsWith('.jpg')).map((f) => join(FOTOS, f)) : []
  const FAELLE = [
    { b: 'Ich teste das teuerste Handy', seite: 'links', k: 0.36, text: 'LOHNT ES SICH?', farben: ['#15205c', '#ff5a36'] },
    { b: 'Mein erstes Mal Sushi', seite: 'rechts', k: 0.4, text: 'LECKER?', farben: ['#0b3d2e', '#ffd400'] },
    { b: '30 Tage ohne Zucker', seite: 'links', k: 0.33, text: 'TAG 30', farben: ['#2b1055', '#7597de'] },
    { b: 'Wir reagieren auf alte Videos', seite: 'links', k: 0.3, text: '', farben: ['#111111', '#e0141e'], freund: true },
    { b: 'So lernst du Englisch in einer Woche', seite: 'rechts', k: 0.36, text: '7 TAGE', farben: ['#ff7a00', '#ffd400'] },
    { b: 'Mein Setup-Tour 2026', seite: 'links', k: 0.28, text: 'SETUP', farben: ['#000428', '#004e92'] },
    { b: 'Ich koche wie ein Profi', seite: 'rechts', k: 0.34, text: 'PROFI?', farben: ['#7b4397', '#dc2430'] },
    { b: 'Die größte Überraschung', seite: 'links', k: 0.42, text: 'WOW', farben: ['#f12711', '#f5af19'], freund: true },
    { b: 'Ehrliche Meinung zum Update', seite: 'links', k: 0.35, text: 'EHRLICH', farben: ['#232526', '#414345'] },
    { b: 'Fitness für Anfänger', seite: 'rechts', k: 0.38, text: 'START', farben: ['#11998e', '#38ef7d'] }
  ] as const
  for (const [i, f] of FAELLE.entries()) {
    it(`${i + 1}. ${f.b}`, async () => {
      const ich = figur({ fotos: [alle[i % alle.length]!], mensch: true })
      const freund = figur({ id: 'freund', name: 'Freund', rolle: 'freund', fotos: [alle[(i + 3) % alle.length]!], mensch: true })
      const personen = [{ id: 'ich', ausdruck: 'froh', seite: f.seite, kopf_anteil: f.k }, ...('freund' in f ? [{ id: 'freund', ausdruck: 'froh', seite: f.seite === 'links' ? 'rechts' : 'links', kopf_anteil: f.k * 0.8, spiegeln: true }] : [])]
      const { schicht } = fakeKi(() => ({ varianten: [{ titel: f.b, vorbild: 'frei', warum: 'Test', hintergrund: { art: 'verlauf', farben: [...f.farben], winkel: 25 }, personen, text: f.text ? [{ text: f.text }] : [], look: { kontrast: 1.08, saettigung: 1.12, vignette: 0.2 } }] }), { bilder: false })
      const logo = i === 0 ? join(AUS, 'test-logo.png') : null
      if (logo && !existsSync(logo)) {
        const { kodierePng } = await import('../../src/main/bild/rohbild')
        const d = new Uint8Array(200 * 80 * 4)
        for (let p = 0; p < 200 * 80; p++) d.set([255, 212, 0, (p % 200) < 190 ? 255 : 0], p * 4)
        mkdirSync(AUS, { recursive: true })
        ;(await import('node:fs')).writeFileSync(logo, kodierePng({ width: 200, height: 80, data: d }))
      }
      const erg = await thumbnailJob(payload('foto', 'freund' in f ? [ich, freund] : [ich], `foto-${i + 1}`, f.b, logo), ctx(), { ki: schicht })
      const v = erg.varianten[0]!
      console.log(`  → ${v.bild} · ${JSON.stringify(v.pruefung)}`)
      expect(v.fehler).toBeNull()
      expect(v.bild && existsSync(v.bild)).toBe(true)
      // Kein Text über einem Gesicht
      expect(v.pruefung.technisch.filter((x) => /Text liegt über/.test(x))).toEqual([])
      if (i === 0) {
        // Export in allen Formaten und PSD mit Ebenen (ROADMAP 4.10)
        const { sicherePython } = await import('../../src/main/thumbnail/umgebung')
        const pyU = await sicherePython(umgebung, ctx() as never)
        for (const fmt of ['16:9', '9:16', '1:1'] as const)
          await exportiereFormat({ v, format: fmt, typ: 'png', ziel: join(AUS, `export-${fmt.replace(':', 'x')}.png`), arbeit: join(AUS, 'export'), umgebung, py: pyU, marke: { schrift: null, logo, farben: ['#ffd400'] }, ctx: ctx() as never })
        const ebenen = await exportierePsd(v.bild!, v.ebenen, join(AUS, 'export.psd'))
        expect(ebenen).toBeGreaterThanOrEqual(3)
      }
    })
  }
})

// Vorlagen-Modus (ROADMAP 4.5): 5 Vorlagen – Thumbnails mit einer Person und Titel, gebaut aus den Foto-Ergebnissen
// oben. Die Person darin wird entfernt und durch eine andere ersetzt (ohne Bild-KI: Lage aus der erkannten Person).
describe.runIf(!!UV && existsSync(FOTOS))('Vorlagen-Modus: 5 Vorlagen', () => {
  const alle = existsSync(FOTOS) ? readdirSync(FOTOS).filter((f) => f.endsWith('.jpg')).map((f) => join(FOTOS, f)) : []
  for (const i of [2, 3, 5, 7, 9]) {
    it(`Vorlage aus foto-${i}`, async () => {
      const ordner = join(AUS, `foto-${i}`)
      const vorlage = readdirSync(ordner).filter((f) => /variante-1\.v\d\.(text|fertig)\.png$/.test(f)).sort().pop() ?? 'variante-1.v0.roh.png'
      const { vorlageJob } = await import('../../src/main/thumbnail/vorlage')
      const p = payload('foto', [figur({ fotos: [alle[(i + 1) % alle.length]!], mensch: true })], `vorlage-${i}`, '')
      p.start = ThumbStartSchema.parse({ art: 'vorlage', kontoId: 'k', quelle: join(ordner, vorlage) })
      const erg = await vorlageJob(p, ctx() as never, { ki: null })
      const v = erg.varianten[0]!
      console.log(`  → ${v.bild} · ${JSON.stringify(v.pruefung)}`)
      expect(v.fehler).toBeNull()
      expect(v.bild && existsSync(v.bild)).toBe(true)
    })
  }
})

// Aus dem Video (ROADMAP 4.9): 3 Testvideos mit bekannten Schnitten; die lokal gefundenen Momente müssen die Schnitte
// treffen. Ideen braucht eine Bild-KI (hier keine: die App sagt das).
describe.runIf(existsSync(join(ROOT, 'ffmpeg')))('Aus dem Video: 3 Testvideos', () => {
  const ffmpeg = readdirSync(join(ROOT, 'ffmpeg')).map((v) => join(ROOT, 'ffmpeg', v, 'bin', 'ffmpeg.exe')).find(existsSync)!
  const VIDEOS = [
    { name: 'drei-szenen', farben: ['red', 'white', 'blue'], laenge: 8 },
    { name: 'fuenf-szenen', farben: ['black', 'white', 'orange', 'purple', 'cyan'], laenge: 6 },
    { name: 'lang', farben: ['navy', 'yellow', 'gray', 'pink'], laenge: 30 }
  ]
  for (const t of VIDEOS) {
    it(t.name, async () => {
      mkdirSync(AUS, { recursive: true })
      const datei = join(AUS, `${t.name}.mp4`)
      if (!existsSync(datei)) {
        const eingaben = t.farben.flatMap((f) => ['-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=25:duration=${t.laenge},hue=h=0,drawbox=color=${f}@0.85:t=fill`])
        const filter = `${t.farben.map((_, k) => `[${k}:v]`).join('')}concat=n=${t.farben.length}:v=1:a=0[v]`
        execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...eingaben, '-filter_complex', filter, '-map', '[v]', '-pix_fmt', 'yuv420p', datei])
      }
      const { videoJob } = await import('../../src/main/thumbnail/video')
      const erg = await videoJob({ video: datei, ffmpeg, ausgabe: join(AUS, `video-${t.name}`), kanal: { name: '@test', richtungen: [], sprache: 'de' }, titel: null, freunde: [], sprache: 'de' }, ctx() as never, { ki: null })
      const schnitte = t.farben.slice(1).map((_, k) => (k + 1) * t.laenge)
      const szenen = erg.momente.filter((m) => /Szenenwechsel/.test(m.grund)).map((m) => m.zeit)
      console.log(`  Schnitte ${schnitte.join(', ')} · Momente ${erg.momente.map((m) => m.zeit.toFixed(1)).join(', ')}`)
      // Jeder Schnitt wird von einem Moment kurz danach getroffen
      for (const s of schnitte) expect(szenen.some((z) => z >= s && z - s < 1.5)).toBe(true)
      expect(erg.mitKi).toBe(false)
      expect(erg.momente.every((m) => m.bild && existsSync(m.bild))).toBe(true)
    })
  }
})
