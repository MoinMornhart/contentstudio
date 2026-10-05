import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { alsBausteine, bibAutomatisch, bibPfad, bibZeitpunkt, dateiInBibliothek, imOriginal, istDran, ladeBibliothek, loescheBibEffekt, passtZu, pruefeBibEffekt, speichereBibEffekt, type BibEffekt } from '../../src/main/schnitt/bibliothek'
import { chromaFilter, spillArt } from '../../src/main/schnitt/chroma'
import { effektGraph, lageXY, pruefeEffekte } from '../../src/main/schnitt/effekte'
import { bibText } from '../../src/main/schnitt/bearbeiten'

const basis = (x: Partial<BibEffekt> = {}): BibEffekt => pruefeBibEffekt({ name: 'Abo-Animation', video: { datei: 'video.webm', greenscreen: false, ton: true }, ...x })

describe('Effekt-Bibliothek (aus MoinStudio v0.50.0)', () => {
  it('prüft Eingaben und füllt Standardwerte auf', () => {
    const e = basis({ groesse: 7, lage: 'irgendwo' as BibEffekt['lage'], konten: ['k1', 'k1', ''], richtungen: [' Reactions '] })
    expect(e.groesse).toBe(1)
    expect(e.lage).toBe('unten-rechts')
    expect(e.konten).toEqual(['k1'])
    expect(e.richtungen).toEqual(['Reactions'])
    expect(e.haeufigkeit).toEqual({ modus: 'manuell' })
    expect(e.chroma).toBeUndefined()
    const g = pruefeBibEffekt({ name: 'Boom', video: { datei: 'video.mp4', greenscreen: true, ton: false }, chroma: { farbe: 'grün', toleranz: 3, weichheit: 0.2, spill: 0.4 } })
    expect(g.chroma).toEqual({ farbe: '#00ff00', toleranz: 1, weichheit: 0.2, spill: 0.4 })
    expect(() => pruefeBibEffekt({ name: '  ' })).toThrow()
    expect(() => pruefeBibEffekt({ name: 'x', video: { datei: '../geheim', greenscreen: false, ton: false } })).toThrow()
  })

  it('passt zu Konto und Richtung; leere Listen gelten für alle', () => {
    expect(passtZu(basis(), 'k1', 'Kochen')).toBe(true)
    expect(passtZu(basis({ konten: ['k2'] }), 'k1', 'Kochen')).toBe(false)
    expect(passtZu(basis({ richtungen: ['reaction'] }), 'k1', 'Reactions')).toBe(true)
    expect(passtZu(basis({ richtungen: ['gaming'] }), 'k1', 'Kochen')).toBe(false)
  })

  it('verteilt „nur in manchen“ gleichmäßig', () => {
    const jedes3 = basis({ haeufigkeit: { modus: 'manchmal', jedes: 3 } })
    expect([0, 1, 2, 3, 4, 5].map((n) => istDran(jedes3, n))).toEqual([true, false, false, true, false, false])
    const halb = basis({ haeufigkeit: { modus: 'manchmal', prozent: 50 } })
    expect([0, 1, 2, 3].filter((n) => istDran(halb, n))).toHaveLength(2)
    expect(istDran(basis({ haeufigkeit: { modus: 'immer' } }), 7)).toBe(true)
    expect(istDran(basis(), 0)).toBe(false)
  })

  it('wählt den Zeitpunkt fest oder nach dem ersten Höhepunkt', () => {
    expect(bibZeitpunkt(basis({ platzierung: { modus: 'fest', bezug: 'start', sekunden: 12 } }), 300, [])).toBe(12)
    expect(bibZeitpunkt(basis({ platzierung: { modus: 'fest', bezug: 'ende', sekunden: 20 } }), 300, [])).toBe(280)
    expect(bibZeitpunkt(basis(), 300, [10, 55, 120])).toBe(57)
    expect(bibZeitpunkt(basis(), 300, [])).toBe(45)
    expect(bibZeitpunkt(basis(), 40, [])).toBe(20)
  })

  it('rechnet Schnittzeit in Originalzeit um', () => {
    const behalten = [{ start: 0, ende: 10 }, { start: 20, ende: 40 }]
    expect(imOriginal(behalten, 5)).toBe(5)
    expect(imOriginal(behalten, 15)).toBe(25)
    expect(imOriginal(behalten, 99)).toBe(40)
  })

  it('legt Effekte im Datenordner ab, löst Verweise auf und setzt sie nach dem Rohschnitt automatisch ein', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-bib-'))
    const quelle = join(daten, 'abo.webm')
    await writeFile(quelle, 'webm')
    const datei = await dateiInBibliothek(daten, 'abo1', 'video', quelle)
    expect(datei).toBe('video.webm')
    const e = await speichereBibEffekt(daten, { id: 'abo1', name: 'Abo', video: { datei, greenscreen: false, ton: true }, haeufigkeit: { modus: 'manchmal', jedes: 2 }, platzierung: { modus: 'fest', bezug: 'start', sekunden: 15 } })
    expect((await ladeBibliothek(daten)).map((x) => x.name)).toEqual(['Abo'])
    expect(bibPfad(daten, `bib:abo1/${datei}`)).toBe(join(daten, 'effekte', 'abo1', 'video.webm'))
    expect(bibPfad(daten, 'bib:abo1/../../x')).toBeNull()
    const behalten = [{ start: 0, ende: 10 }, { start: 20, ende: 60 }]
    // erstes Projekt: dran (Zähler 0), von Hand gesetzte Effekte bleiben, alte automatische werden ersetzt
    const vorher = [{ art: 'text', von: 1, bis: 2, text: 'Hallo' }, { art: 'video', bei: 3, datei: 'bib:abo1/video.webm', bib: { id: 'abo1', name: 'Abo', auto: true } }]
    const a = await bibAutomatisch(daten, { kontoId: 'k', richtung: 'Gaming', behalten, laut: [], effekte: vorher, entscheid: {} })
    expect(a.gesetzt).toEqual(['Abo'])
    expect(a.effekte).toHaveLength(2)
    expect(a.effekte[1]).toMatchObject({ art: 'video', bei: 25, ton: true, bib: { id: 'abo1', auto: true } })
    // derselbe Rohschnitt noch einmal: Entscheidung bleibt, der Zähler dreht nicht weiter
    const b = await bibAutomatisch(daten, { kontoId: 'k', richtung: 'Gaming', behalten, laut: [], effekte: a.effekte, entscheid: a.entscheid })
    expect(b.effekte).toHaveLength(2)
    expect(JSON.parse(await readFile(join(daten, 'effekte', 'abo1', 'effekt.json'), 'utf8')).zaehler).toBe(1)
    // zweites Projekt: nicht dran (jedes 2. Video)
    const c = await bibAutomatisch(daten, { kontoId: 'k', richtung: 'Gaming', behalten, laut: [], effekte: [], entscheid: {} })
    expect(c.gesetzt).toEqual([])
    await loescheBibEffekt(daten, e.id)
    expect(existsSync(join(daten, 'effekte', 'abo1'))).toBe(false)
  })

  it('beschreibt die Bibliothek für die KI mit fertigen Bausteinen', () => {
    const e = basis({ id: 'abo1', sound: { datei: 'sound.mp3', lautstaerke: 1 } })
    expect(alsBausteine(e, 10, false).map((b) => b['art'])).toEqual(['video', 'geraeusch'])
    const text = bibText([e])
    expect(text).toContain('„Abo-Animation“')
    expect(text).toContain('bib:abo1/video.webm')
    expect(bibText([])).toBe('')
  })
})

describe('Video-Einblendung und Greenscreen (aus MoinStudio v0.46.0, v0.50.0)', () => {
  it('blendet ein Video mit Ton ein, Greenscreen per Chroma Key, Ecken über der Player-Leiste', () => {
    const { effekte } = pruefeEffekte([{ art: 'video', bei: 2, datei: 'C:/e/abo.webm', lage: 'unten-rechts', groesse: 0.3, ton: true, chroma: { farbe: '#00ff00', toleranz: 0.3, weichheit: 0.1, spill: 0.5 } }, { art: 'video', bei: 1 }], 20)
    expect(effekte).toHaveLength(1)
    const g = effektGraph({ effekte, laenge: 20, breite: 1920, hoehe: 1080, fps: 30, audio: true, autoZooms: [], textBilder: {}, klaenge: {}, untertitel: null })
    expect(g.eingaben.at(-1)).toEqual({ vor: ['-c:v', 'libvpx-vp9'], datei: 'C:/e/abo.webm' })
    expect(g.graph).toContain('chromakey=color=0x00ff00')
    expect(g.graph).toContain("overlay=x='W*0.96-w':y='H*0.86-h'")
    expect(g.graph).toMatch(/adelay=2000:all=1\[vt0\]/)
    expect(lageXY('voll', 'unten')).toEqual({ x: '0', y: '0' })
  })

  it('wählt den Spill-Typ nach der Key-Farbe', () => {
    expect(spillArt('#00ff00')).toBe('green')
    expect(spillArt('#1030ff')).toBe('blue')
    expect(chromaFilter({ farbe: '#0000ff', toleranz: 0, weichheit: 0, spill: 0 })).not.toContain('despill')
  })
})
