// Herkunft: MoinStudio tests/unit/kalender-ics.test.ts (MIT, v0.53.0), Kalender „ContentStudio“.
import { describe, expect, it } from 'vitest'
import { dauerSekunden, leseIcs, schreibeIcs } from '../../src/main/kalender/ics'

const ms = (s: string): number => new Date(s).getTime()
const ics = (...events: string[]): string => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n')
const ev = (...z: string[]): string => ['BEGIN:VEVENT', ...z, 'END:VEVENT'].join('\r\n')

// Zeitzone des Rechners nicht voraussetzen: Erwartungen über lokale Zeit aus Date bilden
const lokal = (iso: string): string => {
  const d = new Date(iso)
  const z = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}

describe('ICS lesen', () => {
  it('liest UTC-, Zonen- und ganztägige Termine, entfaltet Zeilen und Sonderzeichen', () => {
    const t = leseIcs(
      ics(
        ev('UID:a', 'SUMMARY:Zahnarzt\\, kurz', 'DTSTART:20261010T080000Z', 'DTEND:20261010T090000Z'),
        ev('UID:b', 'SUMMARY:Stream mit', '  Freunden', 'DTSTART;TZID=Europe/Berlin:20261012T200000', 'DURATION:PT2H'),
        ev('UID:c', 'SUMMARY:Urlaub', 'DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261023'),
        ev('UID:d', 'SUMMARY:Abgesagt', 'STATUS:CANCELLED', 'DTSTART:20261011T080000Z')
      ),
      ms('2026-10-01T00:00Z'),
      ms('2026-11-01T00:00Z')
    )
    expect(t.map((x) => x.uid)).toEqual(['a', 'b', 'c'])
    expect(t[0]).toMatchObject({ titel: 'Zahnarzt, kurz', start: lokal('2026-10-10T08:00Z'), ende: lokal('2026-10-10T09:00Z'), ganztag: false })
    expect(t[1]).toMatchObject({ titel: 'Stream mit Freunden', start: lokal('2026-10-12T18:00Z'), ende: lokal('2026-10-12T20:00Z') })
    expect(t[2]).toMatchObject({ start: '2026-10-20', ende: '2026-10-22', ganztag: true })
  })

  it('kennt Outlook-Zonennamen und Sommerzeit-Wechsel', () => {
    const t = leseIcs(ics(ev('UID:o', 'SUMMARY:Meeting', 'DTSTART;TZID="W. Europe Standard Time":20261026T100000', 'DTEND;TZID="W. Europe Standard Time":20261026T110000')), ms('2026-10-01Z'), ms('2026-11-30Z'))
    // 26.10. ist schon Winterzeit (UTC+1)
    expect(t[0]!.start).toBe(lokal('2026-10-26T09:00Z'))
  })

  it('löst Wiederholungen mit BYDAY, COUNT, EXDATE und geänderten Vorkommen auf', () => {
    const t = leseIcs(
      ics(
        ev('UID:w', 'SUMMARY:Training', 'DTSTART;TZID=Europe/Berlin:20261005T180000', 'DTEND;TZID=Europe/Berlin:20261005T190000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', 'EXDATE;TZID=Europe/Berlin:20261007T180000'),
        ev('UID:w', 'SUMMARY:Training (später)', 'RECURRENCE-ID;TZID=Europe/Berlin:20261012T180000', 'DTSTART;TZID=Europe/Berlin:20261012T200000', 'DTEND;TZID=Europe/Berlin:20261012T210000')
      ),
      ms('2026-10-01Z'),
      ms('2026-12-01Z')
    )
    // Mo 5., (Mi 7. entfällt), Mo 12. → 20 Uhr, Mi 14., Mo 19., Mi 21. = 6 Vorkommen gezählt, eines gestrichen
    expect(t.map((x) => x.start.slice(0, 10))).toEqual(['2026-10-05', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21'])
    expect(t.find((x) => x.start.startsWith('2026-10-12'))!.titel).toBe('Training (später)')
    expect(t.find((x) => x.start.startsWith('2026-10-12'))!.start).toBe(lokal('2026-10-12T18:00Z'))
  })

  it('monatlich am letzten Freitag, jährlich, täglich mit UNTIL', () => {
    const r = (rrule: string, start: string): string[] => leseIcs(ics(ev('UID:r', 'SUMMARY:x', `DTSTART;VALUE=DATE:${start}`, rrule)), ms('2026-01-01Z'), ms('2027-03-01Z')).map((x) => x.start)
    expect(r('RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3', '20261030')).toEqual(['2026-10-30', '2026-11-27', '2026-12-25'])
    expect(r('RRULE:FREQ=YEARLY', '20200315')).toEqual(['2026-03-15', '2027-03-15'].filter((x) => x < '2027-03-01'))
    expect(r('RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261007', '20261001')).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07'])
  })

  it('Dauer lesen', () => {
    expect(dauerSekunden('PT1H30M')).toBe(5400)
    expect(dauerSekunden('P1D')).toBe(86400)
    expect(dauerSekunden('-PT15M')).toBe(-900)
  })

  it('schreibt einen Termin, den es selbst wieder liest', () => {
    const text = schreibeIcs({ uid: 'contentstudio-abc@contentstudio', titel: '▶ Kochen: Suppe, Brot; und mehr', start: '2026-10-10T17:00', minuten: 30, beschreibung: 'Zeile 1\nZeile 2', geaendert: '2026-10-05T10:00:00Z' })
    expect(text).toContain('UID:contentstudio-abc@contentstudio')
    expect(text).toContain('PRODID:-//ContentStudio//Planung//DE')
    expect(text.split('\r\n').every((z) => z.length <= 75)).toBe(true)
    const t = leseIcs(text, ms('2026-10-01Z'), ms('2026-11-01Z'))[0]!
    expect(t).toMatchObject({ titel: '▶ Kochen: Suppe, Brot; und mehr', start: '2026-10-10T17:00', ende: '2026-10-10T17:30', geaendert: '2026-10-05T10:00:00.000Z' })
  })
})
