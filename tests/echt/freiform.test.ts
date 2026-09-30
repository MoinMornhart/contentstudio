// Freiform-Tests (ROADMAP 8.1) mit einem echten KI-Weg: je Richtung 20 ungewöhnliche Thumbnail-Beschreibungen und 20
// Schnittwünsche aus tests/freiform/aufgaben.json, neutrale Test-Avatare und Testvideos. Ergebnisse (Bilder, Bögen,
// Antworten, Tokens) landen je Weg in %LOCALAPPDATA%\ContentStudio\test-echt\freiform\<weg>\; bewertet wird danach von
// Hand in docs/tests/freiform-<richtung>.md. Fertige Aufgaben werden übersprungen (Lauf lässt sich fortsetzen).
//
// Aufruf (Beispiel):
//   set CS_KI_WEG=api-anthropic   (oder api-openai, api-google, api-openrouter, ollama, lmstudio, llamacpp; ohne = ohne KI)
//   set CS_KI_MODELL=…            (optional, sonst wählt der Weg selbst)
//   set CS_FREIFORM_NUR=kochen    (optional: kochen | kochen:thumb | kochen:wunsch:1-5)
//   npx vitest run -c vitest.echt.config.ts tests/echt/freiform.test.ts
// Der Schlüssel liegt nur in %LOCALAPPDATA%\ContentStudio-dev\ki-<weg>.txt (nie im Repo, nie im Protokoll).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ThumbStartSchema, type Engine } from '../../src/shared/thumbnail'
import type { Plattform } from '../../src/shared/profil'
import { AnthropicApi } from '../../src/main/ki/anbieter/anthropic-api'
import { GoogleApi } from '../../src/main/ki/anbieter/google-api'
import { Ollama } from '../../src/main/ki/anbieter/ollama'
import { OpenAiKompatibel, waehleOpenAi } from '../../src/main/ki/anbieter/openai-kompatibel'
import type { SchluesselSpeicher } from '../../src/main/ki/schluessel'
import { KiSchicht } from '../../src/main/ki/schicht'
import type { KiAnbieter } from '../../src/main/ki/typen'
import { thumbnailJob } from '../../src/main/thumbnail/job'
import { stilKontext } from '../../src/main/thumbnail/kontext'
import { ladeBeispiele } from '../../src/main/thumbnail/vorbilder'
import type { FigurDaten, ThumbPayload } from '../../src/main/thumbnail/typen'
import { importJob } from '../../src/main/schnitt/import'
import { projektOrdner, speichereProjekt, type Projekt } from '../../src/main/schnitt/projekt'
import { transkriptJob } from '../../src/main/schnitt/transkript'
import { rohschnittJob } from '../../src/main/schnitt/rohschnitt'
import { wunschJob } from '../../src/main/schnitt/bearbeiten'
import { vorschauJob } from '../../src/main/schnitt/vorschau'
import type { EffektHilfe } from '../../src/main/schnitt/effekt-vorbereitung'
import { ctx, FFMPEG, PY_DIR, ROOT, SKRIPTE, sprachDatei, TEST_ECHT, testVideo, umgebung, UV } from './hilfen'

interface Richtung {
  id: string
  name: string
  engine: Engine
  figur: { skin?: string; foto?: string; modell?: string }
  konto: { plattform: Plattform; name: string; sprache: string; richtungen: string[]; spiele?: string[] }
  thumbnails: string[]
  video: { sprache: string; teile: (string | number)[] }
  wuensche: string[]
}

const WEG = process.env['CS_KI_WEG'] ?? ''
const MODELL = process.env['CS_KI_MODELL'] ?? null
const NUR = (process.env['CS_FREIFORM_NUR'] ?? '').split(':')
const VARIANTEN = Number(process.env['CS_FREIFORM_VARIANTEN'] ?? 1)
const AUFGABEN = JSON.parse(readFileSync(join(__dirname, '..', 'freiform', 'aufgaben.json'), 'utf8')) as { richtungen: Richtung[] }
const AUS = join(TEST_ECHT, 'freiform', WEG || 'ohne-weg')
const FOTOS = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-fotos')
const hilfe: EffektHilfe = { ffmpeg: FFMPEG, python: join(PY_DIR, 'Scripts', 'python.exe'), skripte: SKRIPTE, lokal: ROOT, schrift: null, schriftName: null, minecraftAssets: null }

/** Nur ausgewählte Aufgaben? (CS_FREIFORM_NUR=richtung[:thumb|wunsch[:von-bis]]) */
function gewaehlt(richtung: string, art: 'thumb' | 'wunsch', nr: number): boolean {
  if (NUR[0] && NUR[0] !== richtung) return false
  if (NUR[1] && NUR[1] !== art) return false
  if (NUR[2]) {
    const [von, bis] = NUR[2].split('-').map(Number)
    if (nr < von! || nr > (bis ?? von!)) return false
  }
  return true
}

/** Tokens je Auftrag mitzählen (für die Kosten im Bericht) */
const nutzung: { eingabe: number; ausgabe: number }[] = []
function mitZaehler(a: KiAnbieter): KiAnbieter {
  return {
    ...a,
    id: a.id,
    art: a.art,
    faehigkeiten: a.faehigkeiten,
    pruefe: () => a.pruefe(),
    preis: a.preis?.bind(a),
    frage: async (r, c) => {
      const antwort = await a.frage(r, c)
      nutzung.push({ eingabe: antwort.nutzung?.eingabe ?? 0, ausgabe: antwort.nutzung?.ausgabe ?? 0 })
      return antwort
    }
  }
}

/** KI-Schicht des gewählten Wegs; „ohne“ prüft die Abläufe ohne KI (Rückfälle und Hinweise) */
function kiSchicht(): KiSchicht | null {
  if (WEG === 'ohne') return null
  const datei = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio-dev', `ki-${WEG}.txt`)
  const key = existsSync(datei) ? readFileSync(datei, 'utf8').trim() : null
  const modell = async (): Promise<string | null> => MODELL
  const lokal = (id: string, name: string, basis: string): KiAnbieter => new OpenAiKompatibel({ id, art: 'lokal', name, basis, schluessel: async () => null, modell })
  const wege: Record<string, () => KiAnbieter> = {
    'api-anthropic': () => new AnthropicApi({ hat: async () => !!key, hole: async () => key } as unknown as SchluesselSpeicher, modell),
    'api-openai': () => new OpenAiKompatibel({ id: 'api-openai', art: 'api', name: 'OpenAI', basis: 'https://api.openai.com/v1', schluessel: async () => key, modell, waehle: waehleOpenAi, maxCompletionTokens: true }),
    'api-google': () => new GoogleApi(async () => key, modell, async () => null),
    'api-openrouter': () => new OpenAiKompatibel({ id: 'api-openrouter', art: 'api', name: 'OpenRouter', basis: 'https://openrouter.ai/api/v1', schluessel: async () => key, modell, standard: 'openrouter/auto', waehle: () => null }),
    ollama: () => new Ollama(modell),
    lmstudio: () => lokal('lmstudio', 'LM Studio', 'http://127.0.0.1:1234/v1'),
    llamacpp: () => lokal('llamacpp', 'llama.cpp', 'http://127.0.0.1:8080/v1')
  }
  const bau = wege[WEG]
  if (!bau) throw new Error(`Unbekannter Weg ${WEG}; erlaubt: ${Object.keys(wege).join(', ')}`)
  const a = mitZaehler(bau())
  return new KiSchicht(new Map([[a.id, a]]), async () => [{ id: a.id, aktiv: true }])
}

function figuren(r: Richtung): FigurDaten[] {
  const basis: FigurDaten = { id: 'ich', name: 'Test', rolle: 'ich', skin: null, slim: null, fotos: [], mensch: false, modell: null }
  if (r.figur.skin) return [{ ...basis, skin: join(ROOT, 'mc', '26.3', 'extracted', 'assets', 'minecraft', 'textures', 'entity', 'player', 'wide', `${r.figur.skin}.png`), slim: true }]
  if (r.figur.foto) return [{ ...basis, fotos: [join(FOTOS, r.figur.foto)], mensch: true }]
  return [{ ...basis, modell: join(TEST_ECHT, 'thumbnail', r.figur.modell ?? 'avatar.glb') }]
}

const zwei = (n: number): string => String(n).padStart(2, '0')

describe.skipIf(!WEG)(`Freiform mit KI-Weg ${WEG}`, () => {
  const ki = WEG ? kiSchicht() : null
  const zusammenfassung: Record<string, unknown>[] = []

  for (const r of AUFGABEN.richtungen) {
    it(`${r.name}: Thumbnails`, async () => {
      const beispiele = await ladeBeispiele(join(__dirname, '..', '..', 'resources', 'stilbuecher'))
      const beispiel = r.engine === 'minecraft' ? (beispiele[0] ?? null) : null
      for (const [i, beschreibung] of r.thumbnails.entries()) {
        if (!gewaehlt(r.id, 'thumb', i + 1)) continue
        const ordner = join(AUS, r.id, `thumb-${zwei(i + 1)}`)
        if (existsSync(join(ordner, 'ergebnis.json'))) continue
        mkdirSync(ordner, { recursive: true })
        const p: ThumbPayload = {
          start: ThumbStartSchema.parse({ kontoId: 'k', beschreibung, anzahl: VARIANTEN }),
          engine: r.engine,
          kanal: { id: 'k', name: r.konto.name, plattform: 'YouTube', richtungen: r.konto.richtungen, sprache: r.konto.sprache },
          figuren: figuren(r),
          stil: stilKontext({ vorbilder: [], stilbuch: null, beispiel, auftrag: [], farben: ['#ffd400'] }),
          marke: { schrift: null, logo: null, farben: ['#ffd400'] },
          hintergrund: null,
          umgebung,
          ausgabe: ordner,
          sprache: r.konto.sprache as ThumbPayload['sprache']
        }
        const t0 = Date.now()
        const vorher = nutzung.length
        let ergebnis: Record<string, unknown>
        try {
          const erg = await thumbnailJob(p, ctx(true), { ki })
          erg.varianten.forEach((v, j) => v.bild && copyFileSync(v.bild, join(AUS, r.id, `thumb-${zwei(i + 1)}${erg.varianten.length > 1 ? `-${j + 1}` : ''}.png`)))
          ergebnis = { beschreibung, status: 'ok', varianten: erg.varianten.map((v) => ({ titel: v.titel, warum: v.warum, bild: v.bild, fehler: v.fehler ?? null, pruefung: v.pruefung ?? null })) }
        } catch (e) {
          ergebnis = { beschreibung, status: 'fehler', fehler: e instanceof Error ? e.message : String(e) }
        }
        ergebnis['sekunden'] = Math.round((Date.now() - t0) / 1000)
        ergebnis['tokens'] = nutzung.slice(vorher)
        await writeFile(join(ordner, 'ergebnis.json'), JSON.stringify(ergebnis, null, 1))
        zusammenfassung.push({ richtung: r.id, art: 'thumb', nr: i + 1, status: ergebnis['status'], sekunden: ergebnis['sekunden'] })
      }
    }, 24 * 3600_000)

    it(`${r.name}: Schnittwünsche`, async () => {
      if (!r.wuensche.some((_, i) => gewaehlt(r.id, 'wunsch', i + 1))) return
      const daten = join(AUS, 'daten')
      const projektId = r.id
      const ordner = projektOrdner(daten, projektId)
      // Testvideo und Grundschnitt einmal je Richtung (Transkript lokal, Rohschnitt über den KI-Weg)
      if (!existsSync(join(ordner, 'schnitt.basis.json'))) {
        mkdirSync(join(AUS, r.id), { recursive: true })
        const wav = join(AUS, r.id, 'video.wav')
        const mp4 = join(AUS, r.id, 'video.mp4')
        sprachDatei(r.video.sprache, r.video.teile, wav)
        testVideo(wav, mp4)
        const projekt: Projekt = { id: projektId, name: r.name, kontoId: 'k', kanal: r.konto.name, plattform: r.konto.plattform, sprache: r.video.sprache, richtung: r.konto.richtungen[0] ?? '', erstellt: new Date().toISOString(), quelle: { pfad: mp4, groesse: 0, pruefsumme: '', dauer: 0, breite: 0, hoehe: 0, fps: 0, audio: false }, spuren: [], proxy: false, wellenform: false, leiste: false }
        await speichereProjekt(daten, projekt)
        await importJob({ daten, projekt: projektId, ffmpeg: FFMPEG, ffprobe: FFMPEG.replace(/ffmpeg\.exe$/, 'ffprobe.exe') }, ctx())
        await transkriptJob({ daten, projekt: projektId, ffmpeg: FFMPEG, uv: UV, pyDir: PY_DIR, skript: join(SKRIPTE, 'transkript.py'), whisper: { model: 'small', device: 'cpu', compute: 'int8' }, lokal: ROOT, sprache: r.video.sprache, begriffe: r.konto.name }, ctx())
        await rohschnittJob({ daten, projekt: projektId }, ctx(), { ki })
        await copyFile(join(ordner, 'schnitt.json'), join(ordner, 'schnitt.basis.json'))
      }
      for (const [i, wunsch] of r.wuensche.entries()) {
        if (!gewaehlt(r.id, 'wunsch', i + 1)) continue
        const ziel = join(AUS, r.id, `wunsch-${zwei(i + 1)}.json`)
        if (existsSync(ziel)) continue
        // jeder Wunsch auf dem Ausgangsstand: Grundschnitt, keine Effekte
        await copyFile(join(ordner, 'schnitt.basis.json'), join(ordner, 'schnitt.json'))
        await writeFile(join(ordner, 'effekte.json'), '[]')
        const t0 = Date.now()
        const vorher = nutzung.length
        let ergebnis: Record<string, unknown>
        try {
          const a = await wunschJob({ daten, projekt: projektId, wunsch, ffmpeg: FFMPEG }, ctx(), { ki })
          const v = await vorschauJob({ daten, projekt: projektId, ffmpeg: FFMPEG, hilfe, umgebung }, ctx())
          const bogen = join(AUS, r.id, `wunsch-${zwei(i + 1)}.jpg`)
          execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', join(ordner, 'vorschau.mp4'), '-vf', `fps=${(36 / Math.max(1, v.laenge)).toFixed(3)},scale=320:-2,tile=6x6`, '-frames:v', '1', bogen])
          ergebnis = { wunsch, status: 'ok', antwort: a.antwort, effekte: JSON.parse(await readFile(join(ordner, 'effekte.json'), 'utf8')), laenge: v.laenge }
        } catch (e) {
          ergebnis = { wunsch, status: 'fehler', fehler: e instanceof Error ? e.message : String(e) }
        }
        ergebnis['sekunden'] = Math.round((Date.now() - t0) / 1000)
        ergebnis['tokens'] = nutzung.slice(vorher)
        writeFileSync(ziel, JSON.stringify(ergebnis, null, 1))
        zusammenfassung.push({ richtung: r.id, art: 'wunsch', nr: i + 1, status: ergebnis['status'], sekunden: ergebnis['sekunden'] })
      }
    }, 24 * 3600_000)
  }

  it('fasst den Lauf zusammen', async () => {
    mkdirSync(AUS, { recursive: true })
    const datei = join(AUS, 'lauf.json')
    const alt = existsSync(datei) ? (JSON.parse(readFileSync(datei, 'utf8')) as Record<string, unknown>[]) : []
    writeFileSync(datei, JSON.stringify([...alt, ...zusammenfassung], null, 1))
    const tokens = nutzung.reduce((s, n) => ({ eingabe: s.eingabe + n.eingabe, ausgabe: s.ausgabe + n.ausgabe }), { eingabe: 0, ausgabe: 0 })
    console.log(`Weg ${WEG}: ${zusammenfassung.length} Aufgaben, Tokens ein ${tokens.eingabe} / aus ${tokens.ausgabe}`)
    expect(zusammenfassung.every((z) => z['status'] === 'ok' || z['status'] === 'fehler')).toBe(true)
  })
})
