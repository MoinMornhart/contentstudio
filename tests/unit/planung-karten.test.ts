import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  aendereKarte,
  beobachteKarten,
  fuehreZusammen,
  karteVonDatei,
  kartenOrdner,
  ladeKarten,
  loescheKarte,
  neueKarte,
  neueId,
  ordnungFuer,
  pruefeAenderung,
  verschiebeKarte,
  wendeAn,
  type Karte
} from '../../src/main/planung/karten'

const ordner = (): Promise<string> => mkdtemp(join(tmpdir(), 'cs-karten-'))

const basis = (x: Partial<Karte> = {}): Karte => ({
  id: 'abcdefghij01',
  kontoId: 'k1',
  spalte: 'idee',
  ordnung: 1,
  titel: 'Alt',
  notizen: '',
  checkliste: [],
  termin: null,
  thumbnail: null,
  schnitt: null,
  texte: null,
  crossposting: [],
  erstellt: '2026-09-29T10:00:00.000Z',
  rev: 1,
  updatedAt: '2026-09-29T10:00:00.000Z',
  updatedBy: 'PC',
  felder: {},
  ...x
})

describe('Planung: Karten-Speicher (ROADMAP M6, MoinStudio 7.2)', () => {
  it('erkennt Originale und Konfliktkopien von OneDrive und iCloud', () => {
    const id = neueId()
    expect(id).toMatch(/^[a-z0-9]{17}$/)
    expect(karteVonDatei(`${id}.json`)).toEqual({ id, kopie: false })
    expect(karteVonDatei(`${id}-LAPTOP.json`)).toEqual({ id, kopie: true })
    expect(karteVonDatei(`${id}-DESKTOP-AB12-2.json`)).toEqual({ id, kopie: true })
    expect(karteVonDatei(`${id} 2.json`)).toEqual({ id, kopie: true })
    expect(karteVonDatei(`${id}.json.123-abcd.tmp`)).toBeNull()
    expect(karteVonDatei('boards.json')).toBeNull()
  })

  it('merkt sich je Feld die Änderungszeit und lässt unveränderte Karten in Ruhe', () => {
    const k = basis()
    expect(wendeAn(k, { titel: 'Alt' }, 'PC', '2026-09-29T11:00:00.000Z')).toBe(k)
    const n = wendeAn(k, { titel: 'Neu', notizen: '' }, 'LAPTOP', '2026-09-29T11:00:00.000Z')
    expect(n).toMatchObject({ titel: 'Neu', rev: 2, updatedBy: 'LAPTOP', felder: { titel: '2026-09-29T11:00:00.000Z' } })
    expect(n.felder['notizen']).toBeUndefined()
  })

  it('führt gleichzeitige Änderungen zweier Geräte Feld für Feld zusammen', () => {
    const pc = wendeAn(basis(), { titel: 'Titel vom PC', termin: '2026-10-03T17:00' }, 'PC', '2026-09-29T12:00:00.000Z')
    const laptop = wendeAn(basis(), { notizen: 'Notiz vom Laptop', termin: '2026-10-04T17:00' }, 'LAPTOP', '2026-09-29T12:05:00.000Z')
    const k = fuehreZusammen([pc, laptop])
    expect(k).toMatchObject({ titel: 'Titel vom PC', notizen: 'Notiz vom Laptop', termin: '2026-10-04T17:00', rev: 3 })
  })

  it('lässt bei einer Änderung alle anderen Felder unangetastet', async () => {
    expect(pruefeAenderung({ spalte: 'schnitt' })).toEqual({ spalte: 'schnitt' })
    expect(pruefeAenderung({ termin: null, rev: 99 })).toEqual({ termin: null })
    expect(() => pruefeAenderung({ spalte: 'irgendwo' })).toThrow()
    const d = await ordner()
    const k = await neueKarte(d, { kontoId: 'k1', titel: 'A', notizen: 'Wichtig', termin: '2026-10-07T17:00', checkliste: [{ text: 'x', erledigt: false }] }, 'PC')
    await verschiebeKarte(d, k.id, { spalte: 'schnitt', index: 0 }, 'PC')
    await aendereKarte(d, k.id, { checkliste: [{ text: 'x', erledigt: true }] }, 'PC')
    const [n] = await ladeKarten(d)
    expect(n).toMatchObject({ spalte: 'schnitt', notizen: 'Wichtig', termin: '2026-10-07T17:00', checkliste: [{ text: 'x', erledigt: true }] })
    expect(Object.keys(n.felder).sort()).toEqual(['checkliste', 'spalte'])
  })

  it('findet Reihenfolge-Werte zwischen Nachbarn und meldet, wenn kein Platz mehr ist', () => {
    const s = [basis({ ordnung: 1 }), basis({ ordnung: 2 }), basis({ ordnung: 4 })]
    expect(ordnungFuer([], 0)).toBe(1)
    expect(ordnungFuer(s, 0)).toBe(0)
    expect(ordnungFuer(s, 1)).toBe(1.5)
    expect(ordnungFuer(s, 3)).toBe(5)
    expect(ordnungFuer(s, 99)).toBe(5)
    expect(ordnungFuer([basis({ ordnung: 1 }), basis({ ordnung: 1 + 1e-12 })], 1)).toBeNull()
  })

  it('speichert, verschiebt, ändert und löscht Karten im Datenordner', async () => {
    const d = await ordner()
    const a = await neueKarte(d, { kontoId: 'k1', titel: 'Creeper-Challenge' }, 'PC')
    const b = await neueKarte(d, { kontoId: 'k1', titel: '100 Tage Nether' }, 'PC')
    const c = await neueKarte(d, { kontoId: 'k2', titel: 'Stream-Highlights', spalte: 'schnitt' }, 'PC')
    expect(b.ordnung).toBeGreaterThan(a.ordnung)
    await verschiebeKarte(d, b.id, { spalte: 'idee', index: 0 }, 'PC')
    let alle = await ladeKarten(d)
    expect(alle.filter((k) => k.kontoId === 'k1').map((k) => k.titel)).toEqual(['100 Tage Nether', 'Creeper-Challenge'])
    await verschiebeKarte(d, a.id, { spalte: 'aufnahme', index: 0 }, 'PC')
    await aendereKarte(d, a.id, { termin: '2026-10-03T17:00', checkliste: [{ text: 'Seed suchen', erledigt: true }] }, 'PC')
    alle = await ladeKarten(d)
    expect(alle.find((k) => k.id === a.id)).toMatchObject({ spalte: 'aufnahme', termin: '2026-10-03T17:00', rev: 3 })
    await loescheKarte(d, c.id)
    expect((await ladeKarten(d)).map((k) => k.id).sort()).toEqual([a.id, b.id].sort())
    await expect(aendereKarte(d, c.id, { titel: 'x' })).rejects.toThrow('nicht gefunden')
  })

  it('zählt eine Spalte neu durch, wenn zwischen zwei Karten kein Platz mehr ist', async () => {
    const d = await ordner()
    const a = await neueKarte(d, { kontoId: 'k2', titel: 'A', ordnung: 1 }, 'PC')
    await neueKarte(d, { kontoId: 'k2', titel: 'B', ordnung: 1 + 1e-12 }, 'PC')
    const c = await neueKarte(d, { kontoId: 'k2', titel: 'C', ordnung: 5 }, 'PC')
    await verschiebeKarte(d, c.id, { spalte: 'idee', index: 1 }, 'PC')
    const alle = await ladeKarten(d)
    expect(alle.map((k) => k.titel)).toEqual(['A', 'C', 'B'])
    expect(alle.find((k) => k.id === a.id)!.ordnung).toBe(1)
  })

  it('führt Konfliktkopien beim Laden zusammen und räumt sie weg', async () => {
    const d = await ordner()
    const k = await neueKarte(d, { kontoId: 'k1', titel: 'Original' }, 'PC')
    const pfad = join(kartenOrdner(d), `${k.id}.json`)
    const pc = wendeAn(k, { titel: 'Neuer Titel' }, 'PC', '2099-01-01T10:00:00.000Z')
    const laptop = wendeAn(k, { notizen: 'Vom Laptop' }, 'LAPTOP', '2099-01-01T10:01:00.000Z')
    await writeFile(pfad, JSON.stringify(pc))
    await writeFile(join(kartenOrdner(d), `${k.id}-LAPTOP.json`), JSON.stringify(laptop))
    await writeFile(join(kartenOrdner(d), `${k.id} 2.json`), '{ kaputt')
    const [geladen] = await ladeKarten(d, 'PC')
    expect(geladen).toMatchObject({ titel: 'Neuer Titel', notizen: 'Vom Laptop' })
    expect(await readdir(kartenOrdner(d))).toEqual([`${k.id} 2.json`, `${k.id}.json`])
    expect(JSON.parse(await readFile(pfad, 'utf8'))).toMatchObject({ titel: 'Neuer Titel', notizen: 'Vom Laptop' })
  })

  it('bemerkt Änderungen im Kartenordner (z. B. vom anderen Gerät)', async () => {
    const d = await ordner()
    await neueKarte(d, { kontoId: 'k1', titel: 'A' }, 'PC')
    let meldungen = 0
    const stopp = beobachteKarten(d, () => meldungen++, 50)
    await writeFile(join(kartenOrdner(d), 'zzzzzzzzzzzz.json'), '{}')
    await writeFile(join(kartenOrdner(d), 'zzzzzzzzzzzz.json'), '{ }')
    await new Promise((r) => setTimeout(r, 400))
    stopp()
    expect(meldungen).toBe(1)
  })
})
