// Echter Test des Schnitts (ROADMAP 5.1–5.7): Testvideos entstehen hier aus der Windows-Sprachausgabe (Deutsch und
// Englisch, mit Pausen, Füllwort und abgebrochenem Satz) und einem wandernden Motiv. Danach läuft alles echt: FFmpeg,
// faster-whisper, Rohschnitt nach Stil, alle Effekt-Bausteine, Hochformat mit Verfolgung, Spur-Ausrichtung am Ton und
// Export je Plattform mit Prüfung. Braucht FFmpeg, uv und die Python-Umgebung aus CONTENTSTUDIO_TOOLS_DIR.
// Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/schnitt.test.ts
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { importJob } from '../../src/main/schnitt/import'
import { aendereProjekt, ladeProjekt, projektOrdner, speichereProjekt, type Projekt } from '../../src/main/schnitt/projekt'
import { transkriptJob, liesAbschnitte } from '../../src/main/schnitt/transkript'
import { rohschnittJob, laenge, type Schnittliste } from '../../src/main/schnitt/rohschnitt'
import { vorschauJob } from '../../src/main/schnitt/vorschau'
import { exportJob } from '../../src/main/schnitt/export'
import { spurJob } from '../../src/main/schnitt/spuren'
import type { EffektHilfe } from '../../src/main/schnitt/effekt-vorbereitung'
import { ctx, dauerVon, FFMPEG, FFPROBE, PY_DIR, ROOT, SKRIPTE, sprachDatei, testVideo, umgebung, UV } from './hilfen'
import type { Plattform } from '../../src/shared/profil'

const AUS = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-echt', 'schnitt')
const DATEN = join(AUS, 'daten')
const hilfe: EffektHilfe = { ffmpeg: FFMPEG, python: join(PY_DIR, 'Scripts', 'python.exe'), skripte: SKRIPTE, lokal: ROOT, schrift: null, schriftName: null, minecraftAssets: null }

// Sprechtexte mit Pausen (Sekunden), Füllwort und abgebrochenem Satz vor seiner Wiederholung
const TEXTE = {
  de: {
    teile: ['Hallo zusammen, willkommen zu meinem Video über das Wandern in den Bergen.', 3.5, 'Heute zeige ich euch, wie man, ähm, den Rucksack richtig packt.', 4, 'Zuerst kommt die Jacke in die.', 0.4, 'Zuerst kommt die Regenjacke ganz nach oben in den Rucksack.', 3, 'Oh nein, ich habe die Trinkflasche vergessen!', 1, 'Zum Glück gibt es auf der Hütte Wasser.', 2.5, 'Wenn euch das Video gefallen hat, lasst ein Abo da. Tschüss.'],
    wort: /rucksack/i
  },
  en: {
    teile: ['Hi everyone, welcome back to my channel about cooking at home.', 3.5, 'Today I will show you, um, how to bake a simple loaf of bread.', 4, 'First we put the flour in the.', 0.4, 'First we put the flour and the salt into a large bowl.', 3, 'Oh no, I forgot to buy yeast!', 1, 'Luckily there is some left in the fridge.', 2.5, 'If you liked this video, please subscribe. Bye.'],
    wort: /bread|flour/i
  }
} as const

async function neuesProjekt(id: string, sprache: string, video: string, richtung: string, plattform: Plattform = 'youtube'): Promise<void> {
  const p: Projekt = { id, name: `Test ${id}`, kontoId: 'k', kanal: 'Testkanal', plattform, sprache, richtung, erstellt: new Date().toISOString(), quelle: { pfad: video, groesse: 0, pruefsumme: '', dauer: 0, breite: 0, hoehe: 0, fps: 0, audio: false }, spuren: [], proxy: false, wellenform: false, leiste: false }
  await speichereProjekt(DATEN, p)
  await importJob({ daten: DATEN, projekt: id, ffmpeg: FFMPEG, ffprobe: FFPROBE }, ctx())
}

const transkript = (id: string, sprache: string): Promise<unknown> =>
  transkriptJob({ daten: DATEN, projekt: id, ffmpeg: FFMPEG, uv: UV, pyDir: PY_DIR, skript: join(SKRIPTE, 'transkript.py'), whisper: { model: 'small', device: 'cpu', compute: 'int8' }, lokal: ROOT, sprache, begriffe: 'Testkanal' }, ctx())

/** Helligkeit des Motivs: größter Grauwert in einem verkleinerten Standbild */
function hellstes(video: string, zeit: number): number {
  const roh = execFileSync(FFMPEG, ['-v', 'error', '-ss', zeit.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=54:96,format=gray', '-f', 'rawvideo', '-'])
  return Math.max(...roh)
}

beforeAll(() => {
  rmSync(DATEN, { recursive: true, force: true })
  mkdirSync(AUS, { recursive: true })
  for (const s of ['de', 'en'] as const) {
    const wav = join(AUS, `sprache-${s}.wav`)
    if (!existsSync(join(AUS, `sprache-${s}.mp4`))) {
      sprachDatei(s, TEXTE[s].teile, wav)
      testVideo(wav, join(AUS, `sprache-${s}.mp4`))
    }
  }
}, 300_000)

describe('Schnitt echt', () => {
  for (const s of ['de', 'en'] as const) {
    it(`5.1 Transkript ${s}: Wörter mit Zeiten in der richtigen Sprache`, async () => {
      await neuesProjekt(s, s, join(AUS, `sprache-${s}.mp4`), s === 'de' ? 'gaming' : 'kochen')
      const pr = await ladeProjekt(DATEN, s)
      expect(pr?.proxy).toBe(true)
      expect(pr?.quelle?.audio).toBe(true)
      await transkript(s, s)
      const abschnitte = liesAbschnitte(await readFile(join(projektOrdner(DATEN, s), 'transkript.jsonl'), 'utf8'))
      const text = abschnitte.map((a) => a.text).join(' ')
      console.log(`[${s}]`, text)
      expect(text).toMatch(TEXTE[s].wort)
      expect(abschnitte.length).toBeGreaterThanOrEqual(5)
      const woerter = abschnitte.flatMap((a) => a.woerter)
      for (let i = 1; i < woerter.length; i++) expect(woerter[i]!.start).toBeGreaterThanOrEqual(woerter[i - 1]!.start - 0.01)
    }, 900_000)

    it(`5.2 Rohschnitt ${s}: kürzer, kein Wort angeschnitten`, async () => {
      await rohschnittJob({ daten: DATEN, projekt: s }, ctx(), { ki: null })
      const ordner = projektOrdner(DATEN, s)
      const liste = JSON.parse(await readFile(join(ordner, 'schnitt.json'), 'utf8')) as Schnittliste
      const vorher = liste.dauer
      const nachher = laenge(liste.behalten)
      console.log(`[${s}] ${vorher.toFixed(1)} s → ${nachher.toFixed(1)} s`, liste.entfernt.map((e) => `${e.grund}${e.text ? ` „${e.text}“` : ''}`).join(', '))
      expect(nachher).toBeLessThan(vorher * 0.85)
      // der abgebrochene Satz fliegt raus, ob Whisper ihn als eigenen Abschnitt schreibt oder nicht
      expect(liste.entfernt.some((e) => e.grund === 'wiederholung')).toBe(true)
      const woerter = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8')).flatMap((a) => a.woerter)
      for (const x of liste.entfernt.filter((e) => e.grund === 'pause')) for (const w of woerter) expect(x.ende <= w.start + 0.02 || x.start >= w.ende - 0.02).toBe(true)
    }, 300_000)
  }

  it('5.3 Stil: dasselbe Video als Gaming schneller geschnitten als als Kochen', async () => {
    // Projekt „de“ ist Gaming; Kopie mit Richtung Kochen auf demselben Transkript
    const ordner = projektOrdner(DATEN, 'de')
    await neuesProjekt('de-ruhig', 'de', join(AUS, 'sprache-de.mp4'), 'kochen')
    await writeFile(join(projektOrdner(DATEN, 'de-ruhig'), 'transkript.jsonl'), await readFile(join(ordner, 'transkript.jsonl')))
    await aendereProjekt(DATEN, 'de-ruhig', () => ({ transkript: true }))
    await rohschnittJob({ daten: DATEN, projekt: 'de-ruhig' }, ctx(), { ki: null })
    const schnell = JSON.parse(await readFile(join(ordner, 'schnitt.json'), 'utf8')) as Schnittliste
    const ruhig = JSON.parse(await readFile(join(projektOrdner(DATEN, 'de-ruhig'), 'schnitt.json'), 'utf8')) as Schnittliste
    expect(laenge(schnell.behalten)).toBeLessThan(laenge(ruhig.behalten) - 0.5)
  }, 300_000)

  it('5.4 alle Effekt-Bausteine rendern in der Vorschau', async () => {
    const ordner = projektOrdner(DATEN, 'de')
    const bild = join(AUS, 'bild.png')
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=400x300:d=1', '-frames:v', '1', bild])
    const effekte = [
      { art: 'text', von: 0.5, bis: 3, text: 'BERGTOUR', lage: 'oben', farbe: '#ffd400' },
      { art: 'geraeusch', bei: 0.5, klang: 'plopp' },
      { art: 'zoom', von: 9, bis: 12, faktor: 1.5, x: 0.6, y: 0.5 },
      { art: 'wackeln', von: 30, bis: 31.5, staerke: 1 },
      { art: 'blitz', bei: 30 },
      { art: 'geraeusch', bei: 30, klang: 'boom' },
      { art: 'tempo', von: 13, bis: 15, faktor: 0.5 },
      { art: 'farbe', von: 16, bis: 18, schwarzweiss: true },
      { art: 'einfrieren', bei: 20, dauer: 1.2 },
      { art: 'uebergang', bei: 22, farbe: 'schwarz', dauer: 0.6 },
      { art: 'tempo', von: 33, bis: 35, faktor: 2 },
      { art: 'zensur', von: 36, bis: 37 },
      { art: 'lautstaerke', von: 38, bis: 40, faktor: 0.5 },
      { art: 'farbe', von: 40, bis: 42, ton: 'warm', saettigung: 1.4 },
      { art: 'abblende', von: 44, bis: 46, richtung: 'aus' },
      { art: 'bild', von: 24, bis: 27, datei: bild, lage: 'rechts', groesse: 0.25 },
      { art: 'intro', teile: [{ art: 'clip', von: 9, bis: 11 }, { art: 'karte', text: 'RUCKSACK-TIPPS', dauer: 1.5 }] }
    ]
    await writeFile(join(ordner, 'effekte.json'), JSON.stringify(effekte))
    await aendereProjekt(DATEN, 'de', () => ({ einstellungen: { untertitel: 'karaoke', zooms: true, format: '16:9' } }))
    const r = await vorschauJob({ daten: DATEN, projekt: 'de', ffmpeg: FFMPEG, hilfe, umgebung }, ctx())
    const d = dauerVon(join(ordner, 'vorschau.mp4'))
    console.log('Vorschau mit Effekten', d.toFixed(2), 'erwartet', r.laenge.toFixed(2))
    expect(Math.abs(d - r.laenge)).toBeLessThan(0.4)
    expect(existsSync(join(ordner, 'effekte', 'text0.png'))).toBe(true)
    for (const [name, zeit] of [['anfang', 1], ['mitte', d / 2], ['ende', d - 1]] as const) execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', zeit.toFixed(2), '-i', join(ordner, 'vorschau.mp4'), '-frames:v', '1', join(AUS, `effekte-${name}.jpg`)])
  }, 900_000)

  it('5.5 Hochformat: das wandernde Motiv bleibt im Bild', async () => {
    await writeFile(join(projektOrdner(DATEN, 'de'), 'effekte.json'), '[]')
    await aendereProjekt(DATEN, 'de', () => ({ plattform: 'tiktok', einstellungen: { untertitel: 'karaoke', zooms: true, format: '9:16' } }))
    const r = await exportJob({ daten: DATEN, projekt: 'de', ffmpeg: FFMPEG, ffprobe: FFPROBE, encoder: 'libx264', hilfe, umgebung }, ctx(), { ki: null })
    const datei = join(projektOrdner(DATEN, 'de'), 'export.mp4')
    const hell = [0.08, 0.3, 0.5, 0.7, 0.92].map((a) => hellstes(datei, r.laenge * a))
    console.log('Hochformat, hellster Wert je Stelle', hell.join(' '), r.pruefung.map((x) => `${x.ok ? '✓' : '✗'} ${x.punkt}`).join(', '))
    for (const h of hell) expect(h).toBeGreaterThan(200)
    for (const a of [0.08, 0.5, 0.92]) execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', (r.laenge * a).toFixed(2), '-i', datei, '-frames:v', '1', join(AUS, `hoch-${Math.round(a * 100)}.jpg`)])
    // 5.7 TikTok: alle Prüfpunkte grün
    expect(r.pruefung.filter((x) => !x.ok)).toEqual([])
  }, 900_000)

  it('5.6 zweite Spur mit Versatz wird am Ton ausgerichtet', async () => {
    // Getrennter Ton, 2,7 s früher gestartet (Rauschen davor) und leiser
    const ton = join(AUS, 'spur-ton.wav')
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=2.7:a=0.02:r=22050', '-i', join(AUS, 'sprache-de.wav'), '-filter_complex', '[1:a]aresample=22050,volume=0.5[s];[0:a][s]concat=n=2:v=0:a=1[a]', '-map', '[a]', ton])
    await aendereProjekt(DATEN, 'de', (p) => ({ spuren: [...(p.spuren ?? []), { pfad: ton, art: 'ton', versatz: null, sicherheit: null, dauer: 0 }] }))
    const r = await spurJob({ daten: DATEN, projekt: 'de', index: 0, ffmpeg: FFMPEG, ffprobe: FFPROBE }, ctx())
    console.log('Spur-Versatz', r)
    expect(r.versatz).not.toBeNull()
    expect(Math.abs(r.versatz! + 2.7)).toBeLessThan(0.06)
    expect(r.sicherheit!).toBeGreaterThan(0.6)
  }, 300_000)

  for (const plattform of ['youtube', 'podcast', 'x'] as const) {
    it(`5.7 Export für ${plattform}: Prüfpunkte grün`, async () => {
      await aendereProjekt(DATEN, 'en', () => ({ plattform, einstellungen: { untertitel: 'an', zooms: true, format: '16:9' } }))
      const r = await exportJob({ daten: DATEN, projekt: 'en', ffmpeg: FFMPEG, ffprobe: FFPROBE, encoder: 'libx264', hilfe, umgebung }, ctx(), { ki: null })
      console.log(plattform, r.laenge.toFixed(1), r.pruefung.map((x) => `${x.ok ? '✓' : '✗'} ${x.punkt} (${x.wert})`).join(', '))
      expect(r.pruefung.filter((x) => !x.ok)).toEqual([])
      expect(r.datei.endsWith(plattform === 'podcast' ? '.m4a' : '.mp4')).toBe(true)
    }, 900_000)
  }
})
