import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auswahlAusdruck, filterGraph, renderArgs, untertitelAss, zeitAbbildung, zoomsAus } from '../../src/main/schnitt/render'
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
    expect(g).toContain("[0:v]select='")
    expect(g).toContain('eval=frame,crop=960:540')
    expect(g).toContain('subtitles=vorschau.ass')
    expect(g).toContain("[0:a]aselect='")
    expect(renderArgs(o, 'f.txt')).toEqual(expect.arrayContaining(['-/filter_complex', 'f.txt', '-map', '[a]']))
    expect(g).not.toContain('loudnorm')
    // Export: Ton auf Plattform-Lautheit, Ausgang bleibt [a] (genau einmal; aus MoinStudio v0.52.0/v0.53.1)
    const laut = filterGraph({ ...o, lautheit: -14 })
    expect(laut).toContain('[aroh]loudnorm=I=-14:TP=-1:LRA=11,aresample=48000[a]')
    expect(laut.match(/\[a\]/g)).toHaveLength(1)
    // sonst unverändert: nur die Marke wird umbenannt, kein „a“ in Filternamen (scale, aselect)
    expect(laut).toContain('crop=960:540')
    expect(laut.replace(';\n[aroh]loudnorm=I=-14:TP=-1:LRA=11,aresample=48000[a]', '').split('[aroh]').join('[a]')).toBe(g)
    // ohne Ton keine Normalisierung
    expect(filterGraph({ ...o, audio: false, lautheit: -14 })).not.toContain('loudnorm')
  })

  it('Zuschauen: zusätzliches Live-Bild einmal pro Sekunde, Hauptausgabe bleibt [v] (aus MoinStudio v0.54.0)', () => {
    const o = { quelle: 'proxy.mp4', liste, zooms: [], untertitel: null, breite: 960, hoehe: 540, fps: 30, audio: true, encoder: ['-c:v', 'libx264'], ausgabe: 'v.mp4', live: 'C:/live/x.jpg' }
    const g = filterGraph(o)
    expect(g).toContain('[vfertig]split=2[v][vl];[vl]fps=1,scale=640:-2[vlive]')
    expect(g.split('[v]').length - 1).toBe(1)
    const args = renderArgs(o, 'f.txt')
    expect(args.slice(-9)).toEqual(['-map', '[vlive]', '-update', '1', '-q:v', '5', '-f', 'image2', 'C:/live/x.jpg'])
    expect(args.indexOf('v.mp4')).toBeLessThan(args.indexOf('[vlive]'))
    // mit Lautheit zusammen: beide Ausgänge je genau einmal
    const beide = filterGraph({ ...o, lautheit: -14 })
    expect(beide.match(/\[a\]/g)).toHaveLength(1)
    expect(beide.split('[v]').length - 1).toBe(1)
    expect(filterGraph({ ...o, live: undefined })).not.toContain('vlive')
  })

  it('Auswahl auch bei Hunderten Stücken: flacher Baum, wählt genau die behaltenen Zeiten', () => {
    const stuecke = Array.from({ length: 700 }, (_, i) => ({ start: i * 10, ende: i * 10 + 4 }))
    const a = auswahlAusdruck(stuecke)
    let tiefe = 0
    let max = 0
    for (const c of a) {
      if (c === '(') max = Math.max(max, ++tiefe)
      if (c === ')') tiefe--
    }
    expect(max).toBeLessThan(16) // als Summe wären es 700 Glieder – FFmpeg bricht ab („Cannot allocate memory“)
    const auswerten = (t: number): number =>
      new Function('t', 'between', 'iff', 'lt', `return ${a.replace(/\\,/g, ',').replace(/if\(/g, 'iff(')}`)(
        t,
        (x: number, u: number, o: number) => (x >= u && x <= o ? 1 : 0),
        (b: number, j: number, n: number) => (b ? j : n),
        (x: number, y: number) => (x < y ? 1 : 0)
      ) as number
    for (const t of [0, 2, 4.5, 9.99, 10, 13.9, 5000, 5003, 5006, 6994, 6999]) {
      const soll = stuecke.some((s) => t >= s.start && t <= s.ende) ? 1 : 0
      expect(auswerten(t), `t=${t}`).toBe(soll)
    }
    expect(auswahlAusdruck([])).toBe('0')
    // der Filtergraph des Renders nutzt den Baum (0.7.2 hatte ihn nur im Podcast-Export)
    const viele = { quelle: 'p.mp4', liste: { ...liste, behalten: stuecke }, zooms: [], untertitel: null, breite: 640, hoehe: 360, fps: 30, audio: true, encoder: [], ausgabe: 'v.mp4' }
    const g = filterGraph(viele as unknown as Parameters<typeof filterGraph>[0])
    expect(g).toContain("select='if(lt(t")
    expect(g).not.toContain(')+between(')
  })
})
