// Herkunft: MoinStudio tests/unit/sting.test.ts (MIT), v0.45.0.
import { describe, expect, it } from 'vitest'
import { stingAnimation } from '../../src/main/animation/sting'
import { effektGraph, introDauer, pruefeEffekte, type Effekt, type EffektOptionen } from '../../src/main/schnitt/effekte'

const basis = (effekte: Effekt[], x: Partial<EffektOptionen> = {}): EffektOptionen => ({ effekte, laenge: 20, breite: 1280, hoehe: 720, fps: 30, audio: true, autoZooms: [], textBilder: {}, klaenge: { whoosh: 'C:/k/whoosh.wav', boom: 'C:/k/boom.wav', ding: 'C:/k/ding.wav' }, untertitel: null, ...x })

describe('Skin-Sting im Intro (aus MoinStudio v0.45.0)', () => {
  it('prüft Sting-Teile: unbekannte Vorlage wird „sprung“, Dauer 1–4 s', () => {
    const { effekte, fehler } = pruefeEffekte([{ art: 'intro', teile: [{ art: 'clip', von: 2, bis: 4 }, { art: 'sting', vorlage: 'tanzen', text: '@testkanal', dauer: 9 }] }], 20)
    expect(fehler).toEqual([])
    const intro = effekte[0] as Extract<Effekt, { art: 'intro' }>
    const sting = intro.teile[1]!
    expect(sting).toMatchObject({ art: 'sting', vorlage: 'sprung', text: '@testkanal' })
    expect(introDauer(sting)).toBe(4)
  })

  it('legt das Sting-Video über den Hintergrund und den Kanalnamen darunter, mit Wusch, Knall und Ding', () => {
    const effekte: Effekt[] = [{ art: 'intro', teile: [{ art: 'clip', von: 2, bis: 4 }, { art: 'sting', vorlage: 'sprung', text: '@testkanal', dauer: 2 }] }]
    const g = effektGraph(basis(effekte, { stingVideos: { '0.1': 'C:/s/sting.mov' }, textBilder: { '0.1': { datei: 'C:/t/text.png', breite: 400, hoehe: 60 } } }))
    expect(g.eingaben.map((e) => e.datei)).toContain('C:/s/sting.mov')
    const graph = g.graph
    expect(graph).toMatch(/\[kb1\]\[st1\]overlay/)
    expect(graph).toMatch(/enable='gte\(t\\,0\.8/)
  })

  it('ohne fertiges Sting-Video bleibt der Hintergrund mit Kanalname (kein Absturz)', () => {
    const effekte: Effekt[] = [{ art: 'intro', teile: [{ art: 'sting', text: '@testkanal' }] }]
    const g = effektGraph(basis(effekte, { textBilder: { '0.0': { datei: 'C:/t/text.png', breite: 400, hoehe: 60 } } }))
    expect(g.graph).toMatch(/\[kb0\]\[kt0\]overlay/)
  })

  it('Vorlagen skalieren mit der Dauer und rahmen am Ende eng', () => {
    const a = stingAnimation('sprung', { skin: 'C:/s/ich.png' }, { dauer: 3, breite: 1920, hoehe: 1080, fps: 30, samples: 16, geraet: 'CPU' }) as { figuren: { schluessel: { zeit: number }[] }[]; kamera: { schluessel: { zeit: number; position: number[] }[] }; hintergrund: string }
    expect(a.hintergrund).toBe('transparent')
    expect(a.figuren[0]!.schluessel.at(-1)!.zeit).toBe(3)
    const ende = a.kamera.schluessel.at(-1)!
    expect(ende.zeit).toBe(3)
    expect(Math.hypot(ende.position[0]!, ende.position[1]!)).toBeLessThan(4)
  })
})

describe('Sting im Wunsch-Prompt', () => {
  it('nur Konten mit Minecraft-Skin bekommen den Baustein angeboten', async () => {
    const { bausteinText } = await import('../../src/main/schnitt/bearbeiten')
    expect(bausteinText(null, true)).toContain('"sting"')
    expect(bausteinText(null, false)).not.toContain('sting')
  })
})
