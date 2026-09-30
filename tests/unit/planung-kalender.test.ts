import { describe, expect, it } from 'vitest'
import { luecken, monatsRaster, plusTage, rhythmusAus, terminAufTag, wochenStart, wochenTage, wochentag } from '../../src/shared/kalender'

describe('Planung: Kalender (ROADMAP M6, MoinStudio 7.4)', () => {
  it('rechnet Tage ohne Zeitzonen- und Sommerzeit-Fehler', () => {
    expect(plusTage('2026-10-24', 2)).toBe('2026-10-26') // Zeitumstellung am 25.10.
    expect(plusTage('2026-12-31', 1)).toBe('2027-01-01')
    expect(wochentag('2026-10-03')).toBe(6)
    expect(wochenStart('2026-10-04')).toBe('2026-09-28')
    expect(wochenStart('2026-09-28')).toBe('2026-09-28')
    expect(wochenTage('2026-10-01')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('baut ein Monatsraster aus 6 Wochen ab Montag', () => {
    const r = monatsRaster(2026, 9) // Oktober 2026, der 1. ist ein Donnerstag
    expect(r).toHaveLength(42)
    expect(r[0]).toBe('2026-09-28')
    expect(r[3]).toBe('2026-10-01')
    expect(r[41]).toBe('2026-11-08')
  })

  it('behält beim Verschieben die Uhrzeit, sonst gilt die Rhythmus-Zeit des Wochentags', () => {
    const slots = [
      { tag: 3 as const, zeit: '17:00' },
      { tag: 6 as const, zeit: '12:00' }
    ]
    expect(terminAufTag('2026-10-10', '2026-10-07T18:30', slots)).toBe('2026-10-10T18:30')
    expect(terminAufTag('2026-10-10', null, slots)).toBe('2026-10-10T12:00')
    expect(terminAufTag('2026-10-06', null, slots)).toBe('2026-10-06T17:00')
    expect(terminAufTag('2026-10-06', null)).toBe('2026-10-06T17:00')
  })

  it('zeigt Lücken im Upload-Rhythmus, aber keine in der Vergangenheit', () => {
    const rhythmus = { k1: [{ tag: 3 as const, zeit: '17:00' }, { tag: 6 as const, zeit: '17:00' }], k2: [{ tag: 5 as const, zeit: '18:00' }] }
    const karten = [
      { kanal: 'k1', termin: '2026-10-03T17:00' },
      { kanal: 'k2', termin: '2026-10-07T18:00' }, // anderer Kanal belegt den Mittwoch nicht
      { kanal: 'k2', termin: null }
    ]
    expect(luecken(rhythmus, karten, '2026-09-28', '2026-10-11', '2026-09-30')).toEqual([
      { kanal: 'k1', tag: '2026-09-30', zeit: '17:00' },
      { kanal: 'k2', tag: '2026-10-02', zeit: '18:00' },
      { kanal: 'k1', tag: '2026-10-07', zeit: '17:00' },
      { kanal: 'k2', tag: '2026-10-09', zeit: '18:00' },
      { kanal: 'k1', tag: '2026-10-10', zeit: '17:00' }
    ])
  })

  it('liest einen Rhythmus robust und sortiert ab Montag', () => {
    expect(rhythmusAus({ k1: [{ tag: 0, zeit: '10:00' }, { tag: 3, zeit: '17:00' }, { tag: 9, zeit: '1:00' }, 'x'], k2: 'kaputt' })).toEqual({
      k1: [
        { tag: 3, zeit: '17:00' },
        { tag: 0, zeit: '10:00' }
      ]
    })
    expect(rhythmusAus(null)).toEqual({})
  })
})
