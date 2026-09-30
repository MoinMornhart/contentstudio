import { describe, expect, it } from 'vitest'
import { clipListe, highlightPrompt, lauteMomente, ordneHighlights } from '../../src/main/schnitt/highlights'
import { filterGraph } from '../../src/main/schnitt/render'

describe('Schnitt: Stream-Highlights und Shorts (ROADMAP M5, MoinStudio 6.8)', () => {
  it('findet laute Momente (Explosion) über dem Üblichen, höchstens einen je 15 s', () => {
    const werte = Array.from({ length: 100 * 20 }, (_, i) => (i >= 80 * 20 && i < 81 * 20 ? 95 : i >= 33 * 20 && i < 34 * 20 ? 80 : 25))
    expect(lauteMomente({ aufloesung: 0.05, werte })).toEqual([33, 80])
    expect(lauteMomente(null)).toEqual([])
  })

  it('fasst überlappende Höhepunkte zusammen, stärkste zuerst, Länge 8–75 s', () => {
    const h = ordneHighlights(
      [
        { start: 24, ende: 50, titel: 'Diamanten', grund: '', wert: 8 },
        { start: 62, ende: 90, titel: 'Creeper', grund: '', wert: 9 },
        { start: 70, ende: 95, titel: 'Creeper nochmal', grund: '', wert: 6 },
        { start: 10, ende: 11, titel: 'kurz', grund: '', wert: 3 },
        { start: 200, ende: 400, titel: 'lang', grund: '', wert: 5 }
      ],
      500
    )
    expect(h.map((x) => x.titel)).toEqual(['Creeper', 'Diamanten', 'lang', 'kurz'])
    expect(h[0]).toMatchObject({ start: 62, ende: 95 })
    expect(h.find((x) => x.titel === 'kurz')!.ende).toBe(18)
    expect(h.find((x) => x.titel === 'lang')!.ende).toBe(275)
  })

  it('übernimmt gekürzte Pausen des Rohschnitts in den Clip', () => {
    const l = clipListe({ version: 1, dauer: 100, behalten: [{ start: 0, ende: 65 }, { start: 68, ende: 100 }], entfernt: [] }, { start: 60, ende: 80 }, 100)
    expect(l.behalten).toEqual([{ start: 60, ende: 65 }, { start: 68, ende: 80 }])
    expect(clipListe(null, { start: 5, ende: 9 }, 100).behalten).toEqual([{ start: 5, ende: 9 }])
  })

  it('baut Shorts mit Facecam oben und Gameplay darunter (1080×1920)', () => {
    const liste = { version: 1 as const, dauer: 30, behalten: [{ start: 0, ende: 10 }], entfernt: [] }
    const g = filterGraph({ quelle: 'a.mp4', liste, zooms: [{ start: 1, ende: 2 }], untertitel: 'x.ass', breite: 1080, hoehe: 1920, fps: 30, audio: false, encoder: [], ausgabe: 'o.mp4', hoch: { cam: [0.03, 0.53, 0.18, 0.89] } })
    expect(g).toContain('split=2[g][c]')
    expect(g).toContain('scale=1080:640:force_original_aspect_ratio=increase,crop=1080:640[cam]')
    expect(g).toContain('crop=1080:1280[spiel];[cam][spiel]vstack,setsar=1[vc]')
    expect(g).not.toContain('eval=frame') // keine Zooms in Shorts
    const ohneCam = filterGraph({ quelle: 'a.mp4', liste, zooms: [], untertitel: null, breite: 1080, hoehe: 1920, fps: 30, audio: false, encoder: [], ausgabe: 'o.mp4', hoch: { cam: null } })
    expect(ohneCam).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:x=')
  })

  it('gibt der KI Transkript und laute Momente und verlangt 15–60-s-Momente', () => {
    const p = highlightPrompt([{ start: 76, ende: 80, text: 'Oh nein, er explodiert!', woerter: [] }], [80], { kanal: 'Testkanal', richtung: 'gaming', sprache: 'Deutsch' })
    expect(p).toContain('Laute Momente: 80s')
    expect(p).toContain('[76–80] Oh nein, er explodiert!')
    expect(p).toContain('15–60 s')
  })
})
