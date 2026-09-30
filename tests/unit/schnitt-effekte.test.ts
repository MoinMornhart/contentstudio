import { describe, expect, it } from 'vitest'
import { atempoKette, effektGraph, effekteInSchnittzeit, pruefeEffekte, zeitleiste, zuSchnittzeit, type Effekt, type EffektOptionen } from '../../src/main/schnitt/effekte'

const basis = (effekte: Effekt[], x: Partial<EffektOptionen> = {}): EffektOptionen => ({ effekte, laenge: 20, breite: 1280, hoehe: 720, fps: 30, audio: true, autoZooms: [], textBilder: {}, klaenge: { whoosh: 'C:/k/whoosh.wav', piep: 'C:/k/piep.wav' }, untertitel: null, ...x })

describe('Schnitt: Effekt-Bausteine (ROADMAP E.2)', () => {
  it('rechnet Zeitlupe, Zeitraffer und Einfrieren in die neue Zeitleiste um', () => {
    const zl = zeitleiste(
      [
        { art: 'tempo', von: 4, bis: 6, faktor: 0.5 },
        { art: 'tempo', von: 10, bis: 14, faktor: 2 },
        { art: 'einfrieren', bei: 8, dauer: 1.5 }
      ],
      20
    )
    expect(zl.veraendert).toBe(true)
    expect(zl.laenge).toBeCloseTo(4 + 4 + 2 + 1.5 + 2 + 2 + 6)
    expect(zl.endzeit(4)).toBeCloseTo(4)
    expect(zl.endzeit(6)).toBeCloseTo(8) // 2 s Zeitlupe dauern 4 s
    expect(zl.endzeit(8)).toBeCloseTo(10) // Ereignis am Standbild beginnt mit ihm
    expect(zl.endzeit(9)).toBeCloseTo(12.5)
    expect(zl.endzeit(14)).toBeCloseTo(15.5) // 4 s Zeitraffer dauern 2 s
    expect(zeitleiste([{ art: 'zoom', von: 1, bis: 2, faktor: 1.5 }], 20)).toMatchObject({ veraendert: false, laenge: 20 })
  })

  it('verkettet atempo für starke Tempowechsel', () => {
    expect(atempoKette(0.25)).toBe('atempo=0.5,atempo=0.5')
    expect(atempoKette(4)).toBe('atempo=2,atempo=2')
    expect(atempoKette(0.75)).toBe('atempo=0.75')
    expect(atempoKette(1)).toBe('anull')
  })

  it('baut Zeitlupe und Standbild mit trim, setpts und concat für Bild und Ton', () => {
    const g = effektGraph(basis([{ art: 'tempo', von: 4, bis: 6, faktor: 0.5 }, { art: 'einfrieren', bei: 8, dauer: 1 }]))
    expect(g.graph).toContain('[vc]split=5')
    expect(g.graph).toContain('trim=start=4.000:end=6.000,setpts=(PTS-STARTPTS)/0.5')
    expect(g.graph).toContain('atempo=0.5')
    expect(g.graph).toContain('tpad=stop_mode=clone:stop_duration=1.000')
    expect(g.graph).toContain('concat=n=5:v=1:a=1[vz][az]')
    expect(g.laenge).toBeCloseTo(23)
  })

  it('setzt Zoom auf einen Punkt, Wackeln, Farbe, Blitz, Übergang und Zensur als zeitgesteuerte Filter', () => {
    const g = effektGraph(
      basis([
        { art: 'zoom', von: 2, bis: 5, faktor: 1.6, x: 0.8, y: 0.3 },
        { art: 'wackeln', von: 3, bis: 4, staerke: 1 },
        { art: 'farbe', von: 6, bis: 9, schwarzweiss: true, ton: 'kalt' },
        { art: 'blitz', bei: 10 },
        { art: 'uebergang', bei: 12, farbe: 'schwarz' },
        { art: 'zensur', von: 14, bis: 15 }
      ])
    )
    expect(g.graph).toContain("scale=w='iw*(1+(0.600)*")
    expect(g.graph).toContain('0.300*') // Zoom-Punkt x 0,8 → +0,3 aus der Mitte
    expect(g.graph).toContain('sin(t*47)')
    expect(g.graph).toContain("hue=s=0:enable='between(t\\,6.000\\,9.000)'")
    expect(g.graph).toContain('colorbalance=rs=-0.12:gs=0:bs=0.14:rm=-0.12')
    expect(g.graph).toContain("eq=brightness='1*max(0\\,1-abs(t-10.000)/0.125)+-1*max(0\\,1-abs(t-12.000)/0.300)':eval=frame")
    expect(g.graph).toContain('boxblur=20:5')
    // Zensur: Ton stumm und Piep dazu
    expect(g.graph).toContain("volume=0:enable='between(t\\,14.000\\,15.000)'")
    expect(g.eingaben.map((e) => e.datei)).toEqual(['C:/k/piep.wav'])
    expect(g.graph).toContain('amix=inputs=2:normalize=0:duration=first[a]')
  })

  it('blendet Texte mit Pop ein und mischt Geräusche zur richtigen Endzeit dazu', () => {
    const g = effektGraph(
      basis(
        [
          { art: 'tempo', von: 0, bis: 2, faktor: 0.5 },
          { art: 'text', von: 3, bis: 5, text: 'OH NEIN!', lage: 'mitte' },
          { art: 'geraeusch', bei: 3, klang: 'whoosh', lautstaerke: 0.8 },
          { art: 'geraeusch', bei: 4, klang: 'gibtsnicht' }
        ],
        { textBilder: { 1: { datei: 'C:/t/text1.png', breite: 300, hoehe: 60 } } }
      )
    )
    expect(g.eingaben).toEqual([
      { vor: ['-loop', '1', '-framerate', '30', '-t', '7.100'], datei: 'C:/t/text1.png' },
      { vor: [], datei: 'C:/k/whoosh.wav' }
    ])
    // 3 s Schnittzeit = 5 s Endzeit (2 s Schnitt als Zeitlupe dauern 4 s, dann 1 s normal)
    expect(g.graph).toContain("enable='between(t\\,5.000\\,7.000)'")
    expect(g.graph).toContain('*(0.55+0.45*min(1')
    expect(g.graph).toContain('adelay=5000:all=1,volume=0.800')
    expect(g.graph).not.toContain('gibtsnicht')
  })

  it('verschiebt automatische Zooms und kommt ohne Ton aus', () => {
    const g = effektGraph(basis([{ art: 'einfrieren', bei: 1, dauer: 2 }], { audio: false, autoZooms: [{ start: 5, ende: 7 }] }))
    expect(g.graph).toContain('concat=n=3:v=1:a=0[vz]')
    expect(g.graph).toContain('(t-7.000)') // Zoom bei 5 s beginnt nach 2 s Standbild bei 7 s
    expect(g.graph).not.toContain('[a]')
  })

  it('prüft Effekte: unbekannte Arten und kaputte Bereiche fliegen raus, Zeiten werden begrenzt', () => {
    const r = pruefeEffekte(
      [
        { art: 'zoom', von: 2, bis: 50, faktor: 2 },
        { art: 'teleport', von: 1, bis: 2 },
        { art: 'farbe', von: 5, bis: 4 },
        { art: 'text', von: 1, bis: 2, text: ' ' },
        { art: 'geraeusch', bei: 3, klang: 'boom' }
      ],
      20
    )
    expect(r.effekte).toEqual([
      { art: 'zoom', von: 2, bis: 20, faktor: 2 },
      { art: 'geraeusch', bei: 3, klang: 'boom' }
    ])
    expect(r.fehler).toHaveLength(3)
  })

  it('setzt ein Intro aus Clips und Titelkarte vor das Video und verschiebt alle Zeiten (E.3)', () => {
    const g = effektGraph(
      basis(
        [
          { art: 'intro', teile: [{ art: 'clip', von: 12, bis: 13.5 }, { art: 'clip', von: 16, bis: 17, tempo: 0.5 }, { art: 'karte', text: 'TAG 100', dauer: 2, hintergrund: 'unscharf', bei: 5 }] },
          { art: 'text', von: 1, bis: 2, text: 'HALLO' }
        ],
        { textBilder: { '0.2': { datei: 'C:/t/karte.png', breite: 400, hoehe: 70 }, '1': { datei: 'C:/t/hallo.png', breite: 200, hoehe: 70 } }, klaenge: { whoosh: 'C:/k/whoosh.wav', boom: 'C:/k/boom.wav' } }
      )
    )
    // Intro: 1,5 s + 2 s (1 s in Zeitlupe) + 2 s Karte = 5,5 s
    expect(g.laenge).toBeCloseTo(25.5)
    expect(g.endzeit(1)).toBeCloseTo(6.5)
    expect(g.graph).toContain('[vc]split=2[vc0][vi]')
    expect(g.graph).toContain('[vi]split=3[vi0][vi1][vi2]')
    expect(g.graph).toContain('trim=start=16.000:end=17.000,setpts=(PTS-STARTPTS)/0.5')
    expect(g.graph).toContain('boxblur=18:2')
    expect(g.graph).toContain('[ip0v][ip0a][ip1v][ip1a][ip2v][ip2a][vm][ac0]concat=n=4:v=1:a=1[vin][ain]')
    // Text des Videos rückt um das Intro nach hinten
    expect(g.graph).toContain("enable='between(t\\,6.500\\,7.500)'")
    // automatische Geräusche: Wusch vor dem zweiten Clip, Knall zur Karte
    expect(g.graph).toContain('adelay=1500:all=1,volume=0.700')
    expect(g.graph).toContain('adelay=3500:all=1,volume=0.900')
    expect(g.eingaben.map((e) => e.datei)).toEqual(['C:/t/karte.png', 'C:/t/hallo.png', 'C:/k/whoosh.wav', 'C:/k/boom.wav'])
  })

  it('prüft Intro-Teile', () => {
    const r = pruefeEffekte([{ art: 'intro', teile: [{ art: 'clip', von: 5, bis: 5.1 }, { art: 'karte', text: 'LOS' }, { art: 'quatsch' }] }, { art: 'intro', teile: [] }], 20)
    expect(r.effekte).toEqual([{ art: 'intro', teile: [{ art: 'karte', text: 'LOS' }] }])
    expect(r.fehler).toEqual(['Effekt 2: Intro ohne gültige Teile'])
  })

  it('rechnet Effekte aus Originalzeit in Schnittzeit um und rastet an entfernten Stellen ein', () => {
    const behalten = [
      { start: 2, ende: 6 },
      { start: 10, ende: 20 }
    ]
    expect(zuSchnittzeit(3, behalten, 'anfang')).toBe(1)
    expect(zuSchnittzeit(12, behalten, 'anfang')).toBe(6)
    expect(zuSchnittzeit(8, behalten, 'anfang')).toBe(4) // entfernt: nächster Anfang
    expect(zuSchnittzeit(8, behalten, 'ende')).toBe(4) // entfernt: voriges Ende
    expect(zuSchnittzeit(1, behalten, 'ende')).toBeNull()
    expect(zuSchnittzeit(25, behalten, 'ende')).toBe(14)
    const e = effekteInSchnittzeit(
      [
        { art: 'zoom', von: 5, bis: 12, faktor: 1.5 },
        { art: 'farbe', von: 7, bis: 9, schwarzweiss: true }, // ganz entfernt
        { art: 'geraeusch', bei: 11, klang: 'boom' },
        { art: 'intro', teile: [{ art: 'clip', von: 15, bis: 17 }, { art: 'clip', von: 7, bis: 8 }, { art: 'karte', text: 'LOS', bei: 12 }] }
      ],
      behalten
    )
    expect(e).toEqual([
      { art: 'zoom', von: 3, bis: 6, faktor: 1.5 },
      { art: 'geraeusch', bei: 5, klang: 'boom' },
      { art: 'intro', teile: [{ art: 'clip', von: 9, bis: 11 }, { art: 'karte', text: 'LOS', bei: 6 }] }
    ])
  })
  it('blendet am Ende aus (bleibt schwarz) und am Anfang ein, Ton geht mit', () => {
    const g = effektGraph(basis([{ art: 'abblende', von: 18, bis: 20, richtung: 'aus' }, { art: 'abblende', von: 0, bis: 1, richtung: 'ein', farbe: 'weiss' }]))
    expect(g.graph).toContain("eq=brightness='-1*clip((t-18.000)/2.000\\,0\\,1)+1*(1-clip((t-0.000)/1.000\\,0\\,1))':eval=frame")
    expect(g.graph).toContain("volume='1-clip((t-18.000)/2.000\\,0\\,1)':eval=frame")
    expect(g.graph).toContain("volume='clip((t-0.000)/1.000\\,0\\,1)':eval=frame")
  })
})
