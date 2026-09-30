import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rohschnittPrompt, laenge, regelSchnitt, schnittliste, vereinige } from '../../src/main/schnitt/rohschnitt'
import { liesAbschnitte } from '../../src/main/schnitt/transkript'

// Transkript des synthetischen Testvideos (Windows-Stimme): Pausen von 3,5 s, 4 s und 3 s, ein „ähm“ und ein
// abgebrochener Satz vor seiner Wiederholung
const abschnitte = liesAbschnitte(readFileSync('tests/fixtures/sprache-transkript.jsonl', 'utf8'))
const DAUER = 53.52

describe('Schnitt: Rohschnitt (ROADMAP M5, MoinStudio 6.4)', () => {
  it('findet lange Pausen, das „ähm“ und den abgebrochenen Satz', () => {
    const weg = regelSchnitt(abschnitte, DAUER)
    const gruende = weg.map((w) => w.grund)
    expect(gruende.filter((g) => g === 'pause').length).toBeGreaterThanOrEqual(3)
    expect(weg.find((w) => w.grund === 'aehm')?.text).toMatch(/ähm/i)
    expect(weg.find((w) => w.grund === 'wiederholung')?.text).toBe('Okay, ich geh jetzt in die.')
  })

  it('schneidet nie mitten in ein Wort (außer dem entfernten Füllwort und dem abgebrochenen Satz)', () => {
    const weg = regelSchnitt(abschnitte, DAUER).filter((w) => w.grund === 'pause')
    const woerter = abschnitte.flatMap((a) => a.woerter)
    for (const w of woerter) for (const x of weg) expect(x.ende <= w.start || x.start >= w.ende).toBe(true)
  })

  it('lässt laute Stellen ohne Sprache drin (Kampf, Explosion)', () => {
    // gleichmäßige Spielmusik (überall 30): Pausen werden trotzdem gekürzt
    const leise = { aufloesung: 1, werte: Array.from({ length: 54 }, () => 30) }
    // die 4-s-Pause (≈19,6–24,2) mit Kampflärm 90, sonst 30
    const kampf = { aufloesung: 1, werte: Array.from({ length: 54 }, (_, i) => (i >= 20 && i < 24 ? 90 : 30)) }
    const pausenLeise = regelSchnitt(abschnitte, DAUER, leise).filter((w) => w.grund === 'pause' && w.start > 19 && w.ende < 25)
    const pausenKampf = regelSchnitt(abschnitte, DAUER, kampf).filter((w) => w.grund === 'pause' && w.start > 19 && w.ende < 25)
    expect(pausenLeise.length).toBe(1)
    expect(pausenKampf.length).toBe(0)
  })

  it('baut eine Schnittliste, die das Video deutlich kürzer macht, und vereinigt Überlappungen', () => {
    const liste = schnittliste(DAUER, regelSchnitt(abschnitte, DAUER))
    expect(liste.behalten[0]!.start).toBe(0)
    expect(laenge(liste.behalten)).toBeLessThan(DAUER - 10)
    expect(laenge(liste.behalten)).toBeGreaterThan(30)
    for (let i = 1; i < liste.behalten.length; i++) expect(liste.behalten[i]!.start).toBeGreaterThan(liste.behalten[i - 1]!.ende)
    expect(vereinige([{ start: 5, ende: 7 }, { start: 1, ende: 3 }, { start: 2, ende: 4 }])).toEqual([{ start: 1, ende: 4 }, { start: 5, ende: 7 }])
  })

  it('gibt der KI jeden Satz mit Nummer und Zeit und schützt Reaktionen aufs Spiel', () => {
    const p = rohschnittPrompt(abschnitte.slice(0, 3), { kanal: 'Testkanal', plattform: 'YouTube', sprache: 'Deutsch', stil: '' })
    expect(p).toContain('0 [0.0–4.1] Moin Leute')
    expect(p).toContain('Nicht entfernen: Reaktionen')
  })
})
