import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filterGraph, renderArgs, untertitelAss, zeitAbbildung, zoomsAus } from '../../src/main/schnitt/render'
import { regelSchnitt, schnittliste } from '../../src/main/schnitt/rohschnitt'
import { liesAbschnitte } from '../../src/main/schnitt/transkript'

const abschnitte = liesAbschnitte(readFileSync('tests/fixtures/sprache-transkript.jsonl', 'utf8'))
const liste = schnittliste(53.52, regelSchnitt(abschnitte, 53.52))

describe('Schnitt: Untertitel, Zooms, Render (ROADMAP M5, MoinStudio 6.6)', () => {
  it('rechnet Originalzeiten in Zeiten des geschnittenen Videos um', () => {
    const { imSchnitt, laenge } = zeitAbbildung([
      { start: 0, ende: 5 },
      { start: 10, ende: 12 }
    ])
    expect(laenge).toBe(7)
    expect(imSchnitt(4)).toBe(4)
    expect(imSchnitt(7)).toBeNull()
    expect(imSchnitt(11)).toBe(6)
  })

  it('schreibt Untertitel nur für behaltene Wörter, in Schnittzeit und ohne Überlappung', () => {
    const text = untertitelAss(abschnitte, liste, { breite: 1920, hoehe: 1080, karaoke: false, woerter: 7 })
    expect(text).toContain('PlayResX: 1920')
    const zeilen = text.split('\n').filter((z) => z.startsWith('Dialogue:'))
    expect(zeilen.length).toBeGreaterThan(8)
    expect(text).not.toMatch(/Dialogue:[^\n]*ähm/) // „ähm“ ist rausgeschnitten
    expect(text).not.toContain('Okay, ich geh jetzt in die.') // abgebrochener Satz ebenso
    const zeit = (s: string): number => {
      const [h, m, sek] = s.split(':')
      return Number(h) * 3600 + Number(m) * 60 + Number(sek)
    }
    const spannen = zeilen.map((z) => z.split(',').slice(1, 3).map(zeit) as [number, number])
    for (let i = 1; i < spannen.length; i++) expect(spannen[i]![0]).toBeGreaterThanOrEqual(spannen[i - 1]![1] - 0.01)
    expect(spannen[spannen.length - 1]![1]).toBeLessThanOrEqual(zeitAbbildung(liste.behalten).laenge + 0.5)
  })

  it('hebt bei Karaoke jedes Wort mit seiner Dauer hervor', () => {
    const text = untertitelAss(abschnitte, liste, { breite: 1080, hoehe: 1920, karaoke: true, woerter: 4 })
    expect(text).toMatch(/\{\\k\d+\}Moin \{\\k\d+\}Leute,/)
  })

  it('setzt Zooms zuerst auf Ausrufe und höchstens alle 20 Sekunden', () => {
    const zooms = zoomsAus(abschnitte, liste, null)
    expect(zooms.length).toBe(1) // „Oh nein, da ist ein Creeper …“ (Satz ohne „!“, aber mit „oh nein“)
    const { imSchnitt } = zeitAbbildung(liste.behalten)
    expect(zooms[0]!.start).toBeCloseTo(imSchnitt(30.7)!, 0)
  })

  it('baut einen Filtergraph mit Auswahl, Zoom und Untertiteln und legt ihn in eine Datei', () => {
    const o = { quelle: 'proxy.mp4', liste, zooms: [{ start: 10, ende: 12 }], untertitel: 'vorschau.ass', breite: 960, hoehe: 540, fps: 30, audio: true, encoder: ['-c:v', 'libx264'], ausgabe: 'v.mp4' }
    const g = filterGraph(o)
    expect(g).toContain("select='between(t\\,0.000\\,")
    expect(g).toContain('eval=frame,crop=960:540')
    expect(g).toContain('subtitles=vorschau.ass')
    expect(g).toContain("[0:a]aselect='")
    expect(renderArgs(o, 'f.txt')).toEqual(expect.arrayContaining(['-/filter_complex', 'f.txt', '-map', '[a]']))
  })
})
