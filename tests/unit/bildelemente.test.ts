import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emojiPfade, loeseElemente, orteKatalog, waehleOrt, type Holen } from '../../src/main/thumbnail/bildelemente'
import { pruefeAllgemein, type AllgemeinVariante } from '../../src/main/thumbnail/planung/allgemein'
import { autoKorrektur } from '../../src/main/thumbnail/pruefung'

const FOTO = Buffer.from('jpg-daten')
const PNG = Buffer.from('png-daten')

/** Nachgebautes Poly Haven und Fluent-Emoji-Archiv */
function fakeNetz(): { holen: Holen; aufrufe: string[] } {
  const aufrufe: string[] = []
  const holen: Holen = async (eingabe) => {
    const url = String(eingabe)
    aufrufe.push(url)
    if (url.endsWith('/assets?t=hdris'))
      return Response.json({
        modern_kitchen: { name: 'Modern Kitchen', tags: ['kitchen', 'indoor', 'backplates'], categories: ['indoor'] },
        city_street: { name: 'City Street', tags: ['urban', 'street', 'backplates'], categories: ['outdoor', 'urban'] },
        nur_hdri: { name: 'Kitchen Without Photos', tags: ['kitchen'], categories: ['indoor'] },
        home_gym: { name: 'Home Gym', tags: ['gym', 'fitness', 'backplates'], categories: ['indoor'] }
      })
    if (url.endsWith('/files/modern_kitchen'))
      return Response.json({ backplates: { '12': { jpg_pretty: { url: 'https://dl.example/kitchen/12.jpg', md5: createHash('md5').update(FOTO).digest('hex') } }, '3': { jpg_pretty: { url: 'https://dl.example/kitchen/3.jpg', md5: createHash('md5').update(FOTO).digest('hex') } } } })
    if (url === 'https://dl.example/kitchen/3.jpg') return new Response(FOTO)
    if (url.includes('/Spaghetti/3D/spaghetti_3d.png') || url.includes('/Flexed%20biceps/Default/3D/flexed_biceps_3d_default.png')) return new Response(PNG)
    return new Response('nicht da', { status: 404 })
  }
  return { holen, aufrufe }
}

describe('Bildelemente: Orte und Gegenstände (ROADMAP 8.1)', () => {
  it('nimmt nur Orte mit Fotos und findet den passendsten', async () => {
    const orte = await orteKatalog(await mkdtemp(join(tmpdir(), 'cs-orte-')), fakeNetz().holen)
    expect(orte.map((o) => o.id).sort()).toEqual(['city_street', 'home_gym', 'modern_kitchen'])
    expect(waehleOrt(orte, 'kitchen')?.id).toBe('modern_kitchen')
    expect(waehleOrt(orte, 'busy city streets at night')?.id).toBe('city_street')
    expect(waehleOrt(orte, 'gym')?.id).toBe('home_gym')
    expect(waehleOrt(orte, 'underwater cave')).toBeNull()
    // Genau ein Name aus der Liste (so wählt die KI); ein einzelnes passendes Wort reicht bei langen Suchen nicht
    expect(waehleOrt(orte, 'Home Gym')?.id).toBe('home_gym')
    expect(waehleOrt(orte, 'empty train station gym')).toBeNull()
  })

  it('die KI bekommt die vorhandenen Orte genannt, ohne Liste bleibt es bei Stichworten', async () => {
    const { allgemeinPrompt } = await import('../../src/main/thumbnail/planung/allgemein')
    const { stilKontext } = await import('../../src/main/thumbnail/kontext')
    const e = { engine: 'foto' as const, beschreibung: 'x', kanal: 'k', plattform: 'YouTube', richtungen: [], figuren: [], anzahl: 1, stil: stilKontext({ vorbilder: [], stilbuch: null, beispiel: null, auftrag: [], farben: [] }), hintergrund: false, sprache: 'Deutsch', kanalsprache: 'Deutsch' }
    expect(allgemeinPrompt('A {{orte}} B', { ...e, orte: ['Home Gym', 'Modern Kitchen'] })).toContain('Home Gym; Modern Kitchen')
    expect(allgemeinPrompt('A {{orte}} B', e)).toBe('A  B')
  })

  it('setzt Emoji-Namen in Pfade des Fluent-Archivs um', () => {
    expect(emojiPfade('Hot Pepper')[0]).toMatch(/\/Hot%20pepper\/3D\/hot_pepper_3d\.png$/)
    expect(emojiPfade('flexed biceps')[1]).toMatch(/\/Flexed%20biceps\/Default\/3D\/flexed_biceps_3d_default\.png$/)
    expect(emojiPfade('🍝')).toEqual([])
    expect(emojiPfade('../geheim')).toEqual([])
  })

  it('lädt Ortsfoto und Gegenstände einmal, prüft die Prüfsumme und lässt Fehlendes mit Hinweis weg', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cs-elemente-'))
    const netz = fakeNetz()
    const v = { hintergrund: { art: 'ort', ort: 'cozy kitchen' }, objekte: [{ emoji: 'spaghetti', x: 0.75, y: 0.6, groesse: 0.35 }, { emoji: 'flexed biceps', x: 0.8, y: 0.3, groesse: 0.2 }, { emoji: 'gibt es nicht', x: 0.5, y: 0.5, groesse: 0.2 }] }
    const e = await loeseElemente(root, v, netz.holen)
    expect(e.ortFoto).toBe(join(root, 'bilder', 'orte', 'modern_kitchen-3.jpg')) // erste Aufnahme in Zahlenreihenfolge
    expect(existsSync(e.ortFoto!)).toBe(true)
    expect(e.objekte.map((o) => o.emoji)).toEqual(['spaghetti', 'flexed biceps'])
    expect(e.hinweise).toEqual(['Gegenstand „gibt es nicht“ nicht gefunden – weggelassen'])
    const vorher = netz.aufrufe.length
    await loeseElemente(root, v, netz.holen)
    // zweiter Lauf: Katalog und Bilder aus dem Zwischenspeicher, nur die Dateiliste des Ortes wird neu gefragt
    expect(netz.aufrufe.slice(vorher).filter((u) => u.endsWith('.png') || u.endsWith('.jpg') || u.includes('assets?'))).toEqual(['https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Gibt%20es%20nicht/3D/gibt_es_nicht_3d.png', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Gibt%20es%20nicht/Default/3D/gibt_es_nicht_3d_default.png'])
  })

  it('fällt ohne Ortsfoto auf den Farbverlauf zurück', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cs-elemente-'))
    const e = await loeseElemente(root, { hintergrund: { art: 'ort', ort: 'mars base' } }, fakeNetz().holen)
    expect(e.ortFoto).toBeNull()
    expect(e.hinweise[0]).toContain('Farbverlauf')
    const kaputt: Holen = async () => new Response('', { status: 500 })
    expect((await loeseElemente(root + '-x', { hintergrund: { art: 'ort', ort: 'kitchen' } }, kaputt)).hinweise[0]).toContain('nicht geladen')
  })
})

describe('Plan und Korrektur mit Bildelementen', () => {
  const variante = (x: Partial<AllgemeinVariante>): AllgemeinVariante => ({
    titel: 't',
    vorbild: 'frei',
    warum: 'w',
    hintergrund: { art: 'ort', ort: 'kitchen', farben: ['#ff0000'] },
    personen: [{ id: 'ich', ausdruck: 'froh', seite: 'links', kopf_anteil: 0.35 }],
    ...x
  })

  it('repariert leere Orte und zu viele Gegenstände', () => {
    const p = { varianten: [variante({ hintergrund: { art: 'ort', ort: ' ', farben: ['#ff0000'] }, objekte: [1, 2, 3, 4].map(() => ({ emoji: 'fire', x: 0.7, y: 0.5, groesse: 0.2 })) })] }
    expect(pruefeAllgemein(p, { engine: 'foto', figurIds: ['ich'], vorbilder: [], hintergrund: false })).toEqual([])
    expect(p.varianten[0]!.hintergrund.art).toBe('verlauf')
    expect(p.varianten[0]!.objekte).toHaveLength(3)
  })

  it('schiebt einen Gegenstand vor dem Gesicht in die freie Hälfte', () => {
    const v = variante({ objekte: [{ emoji: 'spaghetti', x: 0.3, y: 0.4, groesse: 0.45 }] })
    const neu = autoKorrektur(v, [{ art: 'aufbau', text: 'Gegenstand 1 verdeckt das Gesicht von ich', ernst: true }])
    expect(neu?.objekte?.[0]).toMatchObject({ x: 0.75, groesse: 0.3 })
    const rechts = autoKorrektur(variante({ personen: [{ id: 'ich', ausdruck: 'froh', seite: 'rechts', kopf_anteil: 0.35 }], objekte: [{ emoji: 'fire', x: 0.7, y: 0.4, groesse: 0.2 }] }), [{ art: 'aufbau', text: 'Object 1 covers the face of ich', ernst: true }])
    expect(rechts?.objekte?.[0]?.x).toBe(0.25)
  })
})
