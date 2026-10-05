import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { kartenOrdner, ladeKarten, neueKarte } from '../../src/main/planung/karten'
import { naechsteSpalte, passendeKarte, titelAusName, videoInPlanung } from '../../src/main/planung/verbindung'
import { speichereProjekt, type Projekt } from '../../src/main/schnitt/projekt'

const t = (gewaehlt: boolean) => ({ auftrag: 'a', bild: 'thumbnails/x/1.png', gewaehlt })

describe('Planung: Verbindung zu Schnitt und Thumbnail (ROADMAP M6, MoinStudio 7.5)', () => {
  it('schiebt Karten nach Import, Export und Thumbnail-Wahl weiter', () => {
    expect(naechsteSpalte({ spalte: 'idee', thumbnail: null }, 'import')).toBe('schnitt')
    expect(naechsteSpalte({ spalte: 'aufnahme', thumbnail: null }, 'export')).toBe('thumbnail')
    expect(naechsteSpalte({ spalte: 'schnitt', thumbnail: t(true) }, 'export')).toBe('upload')
    expect(naechsteSpalte({ spalte: 'schnitt', thumbnail: t(false) }, 'export')).toBe('thumbnail')
    expect(naechsteSpalte({ spalte: 'thumbnail', thumbnail: t(true) }, 'thumbnail-gewaehlt', true)).toBe('upload')
    expect(naechsteSpalte({ spalte: 'idee', thumbnail: t(true) }, 'thumbnail-gewaehlt', false)).toBe('thumbnail')
  })

  it('schiebt nie zurück und nie über „Upload“ hinaus', () => {
    expect(naechsteSpalte({ spalte: 'upload', thumbnail: null }, 'import')).toBe('upload')
    expect(naechsteSpalte({ spalte: 'veroeffentlicht', thumbnail: t(true) }, 'export')).toBe('veroeffentlicht')
    expect(naechsteSpalte({ spalte: 'thumbnail', thumbnail: null }, 'import')).toBe('thumbnail')
  })

  it('macht aus Dateinamen lesbare Titel (aus MoinStudio v0.41.0)', () => {
    expect(titelAusName('2026-10-01_brot_backen_wie_beim_baecker.mp4')).toBe('Brot backen wie beim baecker')
    expect(titelAusName('Aufnahme 19-42-10 Bergtour.mkv')).toBe('Aufnahme Bergtour')
  })

  it('findet die passende Karte im selben Konto, die noch nicht verknüpft und nicht hochgeladen ist', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-passend-'))
    const a = await neueKarte(d, { kontoId: 'k1', titel: 'Brot backen wie beim Bäcker' }, 'PC')
    await neueKarte(d, { kontoId: 'k2', titel: 'Brot backen wie beim Bäcker' }, 'PC')
    await neueKarte(d, { kontoId: 'k1', titel: 'Pizza in zehn Minuten' }, 'PC')
    const karten = await ladeKarten(d)
    expect(passendeKarte(karten, { name: '2026-10-01_brot_backen_wie_beim_bäcker.mp4', kontoId: 'k1' })?.id).toBe(a.id)
    expect(passendeKarte(karten, { name: 'Wanderung im Harz.mp4', kontoId: 'k1' })).toBeNull()
  })

  it('Video im Schnitt ohne Karte: verknüpft eine passende oder legt eine neue in „Schnitt“ an', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-auto-'))
    const idee = await neueKarte(d, { kontoId: 'k1', titel: 'Pizza in zehn Minuten' }, 'PC')
    const projekt = (id: string, name: string): Projekt => ({ id, name, kontoId: 'k1', kanal: 'Test', plattform: 'youtube', sprache: 'de', richtung: 'kochen', erstellt: '2026-10-01', quelle: null, spuren: [], proxy: false, wellenform: false, leiste: false }) as unknown as Projekt
    await speichereProjekt(d, projekt('p1', 'pizza in zehn minuten.mp4'))
    await speichereProjekt(d, projekt('p2', '2026-10-01_wanderung_im_harz.mp4'))
    expect(await videoInPlanung(d, 'p1')).toMatchObject({ id: idee.id, schnitt: 'p1', spalte: 'schnitt' })
    const neu = await videoInPlanung(d, 'p2')
    expect(neu).toMatchObject({ titel: 'Wanderung im harz', schnitt: 'p2', spalte: 'schnitt', kontoId: 'k1' })
    expect((await videoInPlanung(d, 'p2'))?.id).toBe(neu?.id)
    expect(await ladeKarten(d)).toHaveLength(2)
  })

  it('liest Karten mit altem Thumbnail-Feld ohne Fehler', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-verbindung-'))
    const k = await neueKarte(d, { kontoId: 'k1', titel: 'Alt', thumbnail: { auftrag: 'x', bild: null, gewaehlt: false } }, 'PC')
    await writeFile(join(kartenOrdner(d), `${k.id}.json`), JSON.stringify({ ...k, thumbnail: 'job-123' }))
    const [geladen] = await ladeKarten(d)
    expect(geladen).toMatchObject({ titel: 'Alt', thumbnail: null })
  })
})

describe('Planung ↔ Schnitt und Thumbnail mit echter Aufgaben-Warteschlange (ROADMAP 6.2)', () => {
  it('rückt eine Karte nach Import, Export und Thumbnail selbst weiter und übernimmt die Texte', async () => {
    const { JobQueue } = await import('../../src/main/jobs/queue')
    const { verbindePlanung } = await import('../../src/main/planung/verbindung')
    const daten = await mkdtemp(join(tmpdir(), 'cs-verb-q-'))
    const q = new JobQueue(join(daten, 'jobs'))
    q.register('schnitt-import', async () => ({ projekt: 'p1' }))
    q.register('schnitt-export', async () => ({ datei: join(daten, 'x.mp4'), plattform: 'youtube', laenge: 200, titel: ['Brot backen wie beim Bäcker'], beschreibung: 'Mein Rezept.', kapitel: [{ zeit: 0, titel: 'Start' }, { zeit: 60, titel: 'Teig' }, { zeit: 120, titel: 'Backen' }], pruefung: [] }))
    q.register('thumbnail', async () => ({ varianten: [{ titel: 'A', bild: join(daten, 'thumbnails', 'a', 'variante-1.png') }] }))
    await q.start()
    let meldungen = 0
    verbindePlanung(q, async () => daten, () => meldungen++)
    const k = await neueKarte(daten, { kontoId: 'k1', titel: 'Brot', schnitt: 'p1' }, 'PC')
    const warte = async (bis: (x: Awaited<ReturnType<typeof ladeKarten>>[number]) => boolean): Promise<void> => {
      for (let i = 0; i < 100; i++) {
        const x = (await ladeKarten(daten)).find((y) => y.id === k.id)!
        if (bis(x)) return
        await new Promise((r) => setTimeout(r, 30))
      }
      throw new Error('Karte rückt nicht weiter')
    }
    await q.waitFor(await q.enqueue('schnitt-import', 'Import', { projekt: 'p1' }))
    await warte((x) => x.spalte === 'schnitt')
    await q.waitFor(await q.enqueue('schnitt-export', 'Export', { projekt: 'p1' }))
    await warte((x) => x.spalte === 'thumbnail' && !!x.texte)
    const auftrag = await q.enqueue('thumbnail', 'Thumbnail', {})
    const { aendereKarte } = await import('../../src/main/planung/karten')
    await aendereKarte(daten, k.id, { thumbnail: { auftrag, bild: null, gewaehlt: false } }, 'PC')
    await q.waitFor(auftrag)
    await warte((x) => x.thumbnail?.bild === 'thumbnails/a/variante-1.png')
    const fertig = (await ladeKarten(daten)).find((y) => y.id === k.id)!
    expect(fertig.texte).toEqual({ plattform: 'youtube', titel: 'Brot backen wie beim Bäcker', beschreibung: 'Mein Rezept.', kapitel: '0:00 Start\n1:00 Teig\n2:00 Backen' })
    // Thumbnail gewählt und exportiert → Upload (so wie planungThumbWaehlen es rechnet)
    expect(naechsteSpalte({ ...fertig, thumbnail: { ...fertig.thumbnail!, gewaehlt: true } }, 'thumbnail-gewaehlt', true)).toBe('upload')
    expect(meldungen).toBeGreaterThanOrEqual(3)
  })
})
