import { describe, expect, it } from 'vitest'
import { liesAbschnitte, whisperWahl } from '../../src/main/schnitt/transkript'

describe('Schnitt: Transkript (ROADMAP M5, MoinStudio 6.3)', () => {
  const small = { model: 'small', device: 'cpu', compute: 'int8' } as const

  it('nimmt das Modell aus dem Hardware-Profil, solange es schnell genug ist', () => {
    expect(whisperWahl(small, null)).toEqual(small)
    expect(whisperWahl(small, { modell: 'small', geraet: 'cpu', faktor: 0.4 })).toEqual(small)
  })

  it('geht nach der Messung beim ersten Einsatz eine Stufe kleiner, wenn es langsamer als Echtzeit war', () => {
    expect(whisperWahl(small, { modell: 'small', geraet: 'cpu', faktor: 1.8 }).model).toBe('base')
    expect(whisperWahl({ model: 'medium', device: 'cpu', compute: 'int8' }, { modell: 'medium', geraet: 'cpu', faktor: 2 }).model).toBe('small')
    // Messung eines anderen Modells zählt nicht
    expect(whisperWahl(small, { modell: 'medium', geraet: 'cpu', faktor: 3 })).toEqual(small)
    // kleiner als base geht nicht
    expect(whisperWahl({ model: 'base', device: 'cpu', compute: 'int8' }, { modell: 'base', geraet: 'cpu', faktor: 5 }).model).toBe('base')
  })

  it('liest die laufend geschriebenen Abschnitte, auch mit Leerzeilen und Windows-Zeilenenden', () => {
    const a = liesAbschnitte('{"start":0,"ende":4.08,"text":"Moin Leute","woerter":[]}\r\n\r\n{"start":8.54,"ende":12.44,"text":"Heute gehen wir","woerter":[]}\n')
    expect(a.map((x) => x.text)).toEqual(['Moin Leute', 'Heute gehen wir'])
  })
})
