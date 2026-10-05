import { describe, expect, it } from 'vitest'
import { kiSaetze, type Abschnitt } from '../../src/main/schnitt/transkript'

// Freiform-Lauf 05.10.: ein Whisper-Abschnitt über 41 s – die KI muss die Sätze mit eigenen Zeiten sehen
describe('Sätze für die KI', () => {
  const wort = (wort: string, start: number, ende: number): Abschnitt['woerter'][number] => ({ wort, start, ende, p: 1 })
  it('teilt lange Abschnitte an Satzenden und Pausen, kurze bleiben', () => {
    const lang: Abschnitt = {
      start: 0,
      ende: 20,
      text: 'Ich habe Brot dabei. Warte, da vorne leuchtet etwas',
      woerter: [wort('Ich', 0, 0.3), wort('habe', 0.3, 0.6), wort('Brot', 13.65, 14.07), wort('dabei.', 14.1, 14.4), wort('Warte,', 17.6, 18), wort('da', 18, 18.2), wort('vorne', 18.2, 18.5), wort('leuchtet', 19.4, 19.8), wort('etwas', 19.8, 20)]
    }
    const kurz: Abschnitt = { start: 21, ende: 23, text: 'Tschüss.', woerter: [wort('Tschüss.', 21, 23)] }
    expect(kiSaetze([lang, kurz])).toEqual([
      { start: 0, ende: 0.6, text: 'Ich habe' },
      { start: 13.65, ende: 14.4, text: 'Brot dabei.' },
      { start: 17.6, ende: 18.5, text: 'Warte, da vorne' },
      { start: 19.4, ende: 20, text: 'leuchtet etwas' },
      { start: 21, ende: 23, text: 'Tschüss.' }
    ])
  })

  it('spätestens nach 25 Wörtern ein neuer Satz', () => {
    const woerter = Array.from({ length: 60 }, (_, i) => wort(`w${i}`, i * 0.3, i * 0.3 + 0.25))
    const s = kiSaetze([{ start: 0, ende: 18, text: '', woerter }])
    expect(s).toHaveLength(3)
    expect(s[0]!.text.split(' ')).toHaveLength(25)
  })
})

describe('Zensur auf volle Wörter', () => {
  it('dehnt eine Zensur auf jedes berührte Wort aus, andere Effekte bleiben', async () => {
    const { zensurAufWoerter } = await import('../../src/main/schnitt/bearbeiten')
    const woerter = [
      { start: 13.0, ende: 13.6 },
      { start: 13.65, ende: 14.07 },
      { start: 14.1, ende: 14.4 }
    ]
    expect(zensurAufWoerter([{ art: 'zensur', von: 13.7, bis: 13.9 }, { art: 'blitz', bei: 13.7 }], woerter)).toEqual([
      { art: 'zensur', von: 13.65, bis: 14.07 },
      { art: 'blitz', bei: 13.7 }
    ])
    expect(zensurAufWoerter([{ art: 'zensur', von: 20, bis: 21 }], woerter)).toEqual([{ art: 'zensur', von: 20, bis: 21 }])
  })
})
