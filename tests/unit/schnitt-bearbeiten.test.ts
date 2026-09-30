import { describe, expect, it } from 'vitest'
import { bereichSetzen, neuBerechnen, umschalten, wunschPrompt } from '../../src/main/schnitt/bearbeiten'
import { laenge, schnittliste } from '../../src/main/schnitt/rohschnitt'

const basis = schnittliste(60, [
  { start: 5, ende: 8, grund: 'pause' },
  { start: 20, ende: 20.5, grund: 'aehm', text: 'ähm' },
  { start: 30, ende: 33, grund: 'wiederholung', text: 'Ich geh jetzt in die.' }
])

describe('Schnitt: prüfen und ändern (ROADMAP M5, MoinStudio 6.5)', () => {
  it('schaltet eine Stelle aus und wieder ein – das Video wird entsprechend länger und wieder kürzer', () => {
    expect(laenge(basis.behalten)).toBeCloseTo(53.5)
    const aus = umschalten(basis, 1)
    expect(aus.entfernt[1]!.aus).toBe(true)
    expect(laenge(aus.behalten)).toBeCloseTo(54)
    expect(laenge(umschalten(aus, 1).behalten)).toBeCloseTo(53.5)
  })

  it('schneidet einen Bereich von Hand raus und holt ihn zurück, ohne andere Schnitte zu verlieren', () => {
    const raus = bereichSetzen(basis, 40, 45, true, 'Puh, das war knapp.')
    expect(raus.entfernt.some((e) => e.grund === 'manuell' && e.text === 'Puh, das war knapp.')).toBe(true)
    expect(laenge(raus.behalten)).toBeCloseTo(48.5)
    const zurueck = bereichSetzen(raus, 40, 45, false)
    expect(laenge(zurueck.behalten)).toBeCloseTo(53.5)
    expect(zurueck.entfernt.filter((e) => !e.aus).length).toBe(3)
  })

  it('kürzt einen Handschnitt, wenn nur ein Teil davon zurückgeholt wird', () => {
    const l = bereichSetzen(bereichSetzen(basis, 40, 50, true), 44, 46, false)
    const hand = l.entfernt.filter((e) => e.grund === 'manuell' && !e.aus)
    expect(hand.map((e) => [e.start, e.ende])).toEqual([
      [40, 44],
      [46, 50]
    ])
  })

  it('holt einen automatischen Schnitt zurück, indem er ausgeschaltet wird (bleibt sichtbar)', () => {
    const l = bereichSetzen(basis, 29, 34, false)
    expect(l.entfernt.find((e) => e.grund === 'wiederholung')!.aus).toBe(true)
    expect(neuBerechnen(l).behalten.some((b) => b.start <= 30 && b.ende >= 33)).toBe(true)
  })

  it('gibt der KI Wunsch, Transkript mit herausgeschnittenen Stellen, Effekt-Bausteine und laute Momente (E.4)', () => {
    const p = wunschPrompt({ wunsch: 'mach mir ein geiles Intro', kanal: 'Testkanal', plattform: 'YouTube', stil: '', sprache: 'Deutsch', liste: basis, saetze: [{ start: 19.5, ende: 22, text: 'und, ähm, ein paar Fackeln' }, { start: 20, ende: 20.5, text: 'ähm' }], effekte: [{ art: 'blitz', bei: 5 }], laut: [33] })
    expect(p).toContain('„mach mir ein geiles Intro“')
    expect(p).toContain('[19.50–22.00] und, ähm, ein paar Fackeln')
    expect(p).toContain('[20.00–20.50] [raus] ähm')
    expect(p).toContain('Laute Momente (Originalzeit): 33s')
    expect(p).toContain('endet bei 60.00 s')
    expect(p).toContain('Aktuelle Effekte (Originalzeit): [{"art":"blitz","bei":5}]')
    for (const b of ['tempo', 'einfrieren', 'zoom', 'wackeln', 'farbe', 'blitz', 'uebergang', 'text', 'geraeusch', 'zensur', 'lautstaerke', 'intro', 'abblende']) expect(p).toContain(`- ${b} {`)
    expect(p).toContain('whoosh (Wusch')
  })
})
