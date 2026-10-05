import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  analysePrompt,
  ersatzSuchwort,
  freundePlaetze,
  gueltigeHaende,
  gueltigeReste,
  gueltigeVerbindungen,
  korrigiere,
  personenArgumente,
  pruefPrompt,
  PruefungZ,
  requisitLaenge,
  VorlagenAnalyseZ,
  zumZielen
} from '../../src/main/thumbnail/vorlage'

// Spiele-Vorlage für jede Art von Bild (aus MoinStudio v0.38.0–v0.41.0)
describe('Spiele-Vorlage', () => {
  it('Analyse kennt Box je Person, Hände und Verbindungen; das Schema lässt sich für jeden Anbieter umwandeln', () => {
    const a = VorlagenAnalyseZ.parse({
      inhalt: 'zwei Spieler an einer Kette',
      box: [0.1, 0.1, 0.4, 0.95],
      kopf: [0.25, 0.2],
      kopf_anteil: 0.18,
      haende: [[0.3, 0.5]],
      weitere: [{ box: [0.6, 0.1, 0.9, 0.95], kopf: [0.75, 0.2], kopf_anteil: 0.17, haende: [[0.7, 0.5]] }],
      verbindungen: [{ von: 'ich', zu: 'freund0', art: 'kette', von_punkt: 'hand_r', zu_punkt: 'hand_l', box: [0.3, 0.4, 0.7, 0.6] }]
    })
    expect(a.verbindungen?.[0]?.art).toBe('kette')
    expect(() => VorlagenAnalyseZ.parse({ inhalt: 'x', kopf: [0.5, 0.5], kopf_anteil: 0.2, verbindungen: [{ von: 'ich', zu: 'freund0', art: 'kleber' }] })).toThrow()
    const schema = JSON.stringify(z.toJSONSchema(VorlagenAnalyseZ))
    for (const feld of ['box', 'haende', 'verbindungen', 'hand_r']) expect(schema).toContain(feld)
    expect(z.toJSONSchema(PruefungZ)).toMatchObject({ required: ['passt'] })
  })

  it('Hände: höchstens zwei, nur im Bild', () => {
    expect(gueltigeHaende([[0.1, 0.2], [1.5, 0.2], [0.3], 'x', [0.4, 0.5], [0.6, 0.7]])).toEqual([
      [0.1, 0.2],
      [0.4, 0.5]
    ])
    expect(gueltigeHaende(undefined)).toEqual([])
  })

  it('Ersatzmodell und Länge des Gehaltenen', () => {
    expect(ersatzSuchwort('double barrel shotgun')).toBe('rifle')
    expect(ersatzSuchwort('Revolver')).toBe('pistol')
    expect(ersatzSuchwort('katana')).toBe('sword')
    expect(ersatzSuchwort('banana')).toBeNull()
    expect(requisitLaenge('sniper rifle')).toBe(24)
    expect(requisitLaenge('sword')).toBe(18)
    expect(requisitLaenge('knife')).toBe(11)
    expect(requisitLaenge('cup')).toBe(10)
    expect(zumZielen('crossbow')).toBe(true)
    expect(zumZielen('sword')).toBe(false)
  })

  it('Kästen je Person für freistellen.py, nur so viele, wie ersetzt werden', () => {
    const a = { box: [0.1, -0.05, 0.4, 1.1] as number[], weitere: [{ box: [0.6, 0.1, 0.9, 0.9], kopf: [0.7, 0.2], kopf_anteil: 0.2 }, { box: [0, 0, 0.1, 0.1], kopf: [0.05, 0.05], kopf_anteil: 0.1 }] }
    expect(personenArgumente(a, 1)).toEqual(['--person=0.1,0,0.4,1', '--person=0.6,0.1,0.9,0.9'])
    expect(personenArgumente(a, 0)).toEqual(['--person=0.1,0,0.4,1'])
    // Fehlt der Kasten eines Freundes, bekommt nur die Hauptfigur eine eigene Maske
    expect(personenArgumente({ box: a.box, weitere: [{ kopf: [0.7, 0.2], kopf_anteil: 0.2 }] }, 1)).toEqual(['--person=0.1,0,0.4,1'])
    expect(personenArgumente({ weitere: a.weitere }, 1)).toEqual([])
  })

  it('Verbindungen nur zwischen Figuren, die wirklich ersetzt werden', () => {
    const verbindungen = [
      { von: 'ich', zu: 'freund0', art: 'kette' as const },
      { von: 'ich', zu: 'freund1', art: 'seil' as const },
      { von: 'ich', zu: 'ich', art: 'leine' as const }
    ]
    expect(gueltigeVerbindungen({ verbindungen }, 1)).toEqual([verbindungen[0]])
    expect(gueltigeVerbindungen({ verbindungen }, 0)).toEqual([])
  })

  it('Freunde übernehmen die Hände ihrer Person', () => {
    const f = freundePlaetze({ kopf: [0.3, 0.3], kopf_anteil: 0.2, weitere: [{ kopf: [0.7, 0.3], kopf_anteil: 0.2, haende: [[0.8, 0.5], [2, 2]] }] }, [{ skin: 'a.png' }])
    expect(f[0]!['haende']).toEqual([[0.8, 0.5]])
  })

  it('Reste: nur gültige, nicht riesige Kästen, höchstens vier', () => {
    expect(gueltigeReste({ reste: [[0.1, 0.1, 0.2, 0.2], [0, 0, 1, 1], [0.5, 0.5, 0.4, 0.6], [0.1, 0.1, 0.2], [0.6, 0.6, 0.7, 0.7]] })).toEqual([
      [0.1, 0.1, 0.2, 0.2],
      [0.6, 0.6, 0.7, 0.7]
    ])
    expect(gueltigeReste({})).toEqual([])
  })

  it('Korrektur der Schlussprüfung: nur erlaubte Felder, Werte begrenzt, Pfade unangetastet', () => {
    const spec: Record<string, unknown> = { skin: 'ich.png', kopf: [0.3, 0.3], kopf_anteil: 0.2, freunde: [{ skin: 'f.png', kopf: [0.7, 0.3], kopf_anteil: 0.2 }] }
    korrigiere(spec, { skin: 'boese.png', maske: 'x', kopf_anteil: 0.95, blick: 160, pose: { koerper: { drehen: 120 } }, haende: [[0.2, 0.4], [3, 3]], freunde: [{ kopf_anteil: 0.01, skin: 'boese.png', blick: -200 }] })
    expect(spec['skin']).toBe('ich.png')
    expect(spec['maske']).toBeUndefined()
    expect(spec['kopf_anteil']).toBe(0.7)
    expect(spec['blick']).toBe(90)
    expect(spec['pose']).toEqual({ koerper: { drehen: 60 } })
    expect(spec['haende']).toEqual([[0.2, 0.4]])
    const freund = (spec['freunde'] as Record<string, unknown>[])[0]!
    expect(freund).toMatchObject({ skin: 'f.png', kopf_anteil: 0.08, blick: -90 })

    // Größe korrigiert → das Einpassen in den Umriss entfällt für genau diese Figur, sonst wäre die Korrektur wirkungslos
    const eingepasst: Record<string, unknown> = { kopf_anteil: 0.3, person: { maske: 'm0.png' }, freunde: [{ kopf_anteil: 0.2, person: { maske: 'm1.png' } }] }
    korrigiere(eingepasst, { kopf_anteil: 0.6 })
    expect(eingepasst['person']).toBeUndefined()
    expect((eingepasst['freunde'] as Record<string, unknown>[])[0]!['person']).toEqual({ maske: 'm1.png' })
    korrigiere(eingepasst, { pose: 'jubeln', freunde: [{ kopf: [0.6, 0.3] }] })
    expect((eingepasst['freunde'] as Record<string, unknown>[])[0]!['person']).toBeUndefined()
    const nurPose: Record<string, unknown> = { person: { maske: 'm0.png' } }
    korrigiere(nurPose, { pose: 'jubeln' })
    expect(nurPose['person']).toEqual({ maske: 'm0.png' })

    // Foto: keine Pose, kein Blick – nur Lage und Größe
    const foto: Record<string, unknown> = { kopf: [0.3, 0.3], kopf_anteil: 0.2, freunde: [{ kopf: [0.7, 0.3], kopf_anteil: 0.2 }] }
    korrigiere(foto, { kopf: [0.35, 0.3], kopf_anteil: 0.3, pose: 'jubeln', blick: 20, freunde: [null, { kopf_anteil: 0.5 }] }, 'foto')
    expect(foto).toEqual({ kopf: [0.35, 0.3], kopf_anteil: 0.3, freunde: [{ kopf: [0.7, 0.3], kopf_anteil: 0.2 }] })
  })

  it('Prompts: neutral, ohne Pfade, je Engine nur die passenden Felder', () => {
    const spec = { hintergrund: 'C:/x/hintergrund.png', skin: 'C:/x/skin.png', maske: 'C:/x/maske.png', kopf: [0.3, 0.3], kopf_anteil: 0.2, freunde: [{ skin: 'C:/x/f.png', person: { maske: 'C:/x/m.png' }, kopf: [0.7, 0.3] }] }
    const mc = pruefPrompt(spec, { minecraft: true, wunsch: 'mit Schwert' })
    expect(mc).not.toMatch(/C:\/x/)
    expect(mc).toContain('Minecraft-Figur')
    expect(mc).toContain('haende')
    expect(mc).toContain('mit Schwert')
    const foto = pruefPrompt(spec, { minecraft: false, wunsch: null })
    expect(foto).toContain('freigestelltes Foto')
    expect(foto).not.toContain('verbindungen')
    const analyse = analysePrompt(['zeigen'], 'zeigen: {}', { minecraft: true, freunde: ['Freund A'], wunsch: null })
    for (const wort of ['box', 'haende', 'verbindungen', 'kippen_seite']) expect(analyse).toContain(wort)
    expect(analysePrompt([], '', { minecraft: false, freunde: ['Freund A'], wunsch: null })).not.toContain('verbindungen')
    // neutral formuliert: es geht immer um „den Creator“, nie um eine bestimmte Person
    for (const p of [mc, foto, analyse]) expect(p).toContain('Creator')
  })
})
