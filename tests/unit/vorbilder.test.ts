import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { leeresProfil } from '../../src/shared/profil'
import type { KiAnalyse } from '../../src/shared/thumbnail'
import { analysiere } from '../../src/main/bild/analyse'
import { kodierePng, type RohBild } from '../../src/main/bild/rohbild'
import { SettingsStore } from '../../src/main/data/settings'
import { ProfilStore } from '../../src/main/profil/store'
import { beispielFuer, ladeBeispiele, VorbildStore, waehleVorbilder, youtubeId } from '../../src/main/thumbnail/vorbilder'
import { fakeKi } from '../ki-fake'

/** Testbild: Hintergrund in `grund`, ein heller Block als Blickfang bei `u` (0–1) */
function testbild(grund: [number, number, number], u: number, w = 320, h = 180): RohBild {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const imBlock = Math.abs(x / w - u) < 0.12 && Math.abs(y / h - 0.5) < 0.25
      const c = imBlock ? [255, 240, 60] : grund
      data.set([c[0]!, c[1]!, c[2]!, 255], i)
    }
  return { width: w, height: h, data }
}

const analyse = (typ: string): KiAnalyse => ({
  typ,
  zeigt: 'Person mit Thema',
  bildaufbau: 'Person links, Thema rechts',
  figur: { anzahl: 1, position: 'links', kopfAnteil: 0.4, pose: 'zeigt', blick: 'zum Thema', ausdruck: 'überrascht' },
  kamera: 'nah, leicht von unten',
  farben: 'kräftig',
  licht: 'hell',
  text: { vorhanden: false, woerter: 0, stil: '', position: '' },
  objekte: 'ein großes Objekt rechts',
  stimmung: 'aufgeregt',
  rezept: 'Person groß links, Thema rechts'
})

describe('Lokale Bildanalyse', () => {
  it('misst Farben, Sättigung und Schwerpunkt', () => {
    const rot = analysiere(testbild([220, 30, 30], 0.2))
    expect(rot.saettigung).toBeGreaterThan(0.6)
    expect(rot.farben[0]!.farbe).toBe('#dc1e1e')
    expect(rot.schwerpunkt[0]).toBeLessThan(0.4)
    const grau = analysiere(testbild([120, 120, 120], 0.8))
    expect(grau.saettigung).toBeLessThan(0.3)
    expect(grau.schwerpunkt[0]).toBeGreaterThan(0.6)
  })
})

describe('Vorbilder und Stilbuch (ROADMAP 4.1)', () => {
  let ordner: string
  let profil: ProfilStore
  let store: VorbildStore
  beforeEach(async () => {
    ordner = await mkdtemp(join(tmpdir(), 'cs-vorbild-'))
    const settings = new SettingsStore(join(ordner, 'ud'))
    await settings.update({ dataDir: join(ordner, 'daten') })
    profil = new ProfilStore(settings)
    await profil.speichern({ ...leeresProfil(), konten: [{ id: 'konto-1', plattform: 'youtube', name: '@test' }] })
    const bildAusLink = kodierePng(testbild([30, 60, 220], 0.5))
    store = new VorbildStore(profil, (async (url: string) => {
      if (url.includes('oembed')) return new Response(JSON.stringify({ title: 'Mein Video', author_name: 'Kanal X' }))
      if (url.includes('maxresdefault')) return new Response('', { status: 404 })
      return new Response(bildAusLink)
    }) as typeof fetch)
  })

  it('10 Vorbilder hinzufügen → Stilbuch mit Regeln und Belegen; Gewichtung ändert die Auswahl', async () => {
    // 7 kräftig rote mit Blickfang links, 3 graue mit Blickfang rechts
    const ids: string[] = []
    for (let i = 0; i < 10; i++) {
      const pfad = join(ordner, `v${i}.png`)
      await writeFile(pfad, kodierePng(i < 7 ? testbild([200 + i * 3, 25, 30], 0.2) : testbild([110, 112, 115], 0.8)))
      ids.push((await store.hinzu('konto-1', { art: i % 2 ? 'ablegen' : 'datei', pfad })).id)
    }
    const liste = await store.liste('konto-1')
    expect(liste).toHaveLength(10)
    expect(liste.every((v) => v.lokal)).toBe(true)
    // Im Profil eingetragen (Assistent und Reiter sehen dieselben Bilder)
    expect((await profil.laden()).konten[0]!.vorbildBilder).toHaveLength(10)

    const buch = await store.erstelleStilbuch('konto-1', { ki: null, beispiel: null })
    expect(buch.quelle).toBe('lokal')
    const satt = buch.regeln.find((r) => r.text === 'Kräftige, satte Farben')!
    expect(satt.belege).toEqual(ids.slice(0, 7))
    expect(buch.regeln.find((r) => r.text === 'Blickfang in der linken Bildhälfte')).toBeDefined()
    expect(buch.regeln.find((r) => r.text === 'Gedeckte, ruhige Farben')).toBeUndefined()
    expect(buch.werte!.farben[0]).toMatch(/^#[c-d]/)

    // Graue Vorbilder sehr wichtig, rote unwichtig: Auswahl und Regeln drehen sich
    for (const id of ids.slice(0, 3)) await store.aendere('konto-1', id, { gewicht: 5 })
    expect(waehleVorbilder(await store.liste('konto-1'), 3).map((v) => v.id).sort()).toEqual(ids.slice(0, 3).sort())
    for (const id of ids.slice(7)) await store.aendere('konto-1', id, { gewicht: 5 })
    for (const id of ids.slice(0, 7)) await store.aendere('konto-1', id, { gewicht: 1 })
    const neu = await store.liste('konto-1')
    expect(waehleVorbilder(neu, 3).map((v) => v.id).sort()).toEqual(ids.slice(7).sort())
    const buch2 = await store.erstelleStilbuch('konto-1', { ki: null, beispiel: null })
    expect(buch2.regeln.find((r) => r.text === 'Gedeckte, ruhige Farben')?.belege).toEqual(ids.slice(7))
    expect(buch2.regeln.find((r) => r.text === 'Kräftige, satte Farben')).toBeUndefined()
    expect(buch2.regeln.find((r) => r.text === 'Gedeckte, ruhige Farben')?.staerke).toBe(15)

    // Deaktivieren und Löschen
    await store.aendere('konto-1', ids[9]!, { aktiv: false })
    expect(waehleVorbilder(await store.liste('konto-1'), 10)).toHaveLength(9)
    const pfad = await profil.absolut(liste[0]!.datei!)
    await store.loesche('konto-1', ids[0]!)
    expect(await store.liste('konto-1')).toHaveLength(9)
    await expect(readFile(pfad)).rejects.toThrow()
    expect((await profil.laden()).konten[0]!.vorbildBilder).toHaveLength(9)
  }, 30_000)

  it('mit Bild-KI: Beschreibung je Vorbild und Regeln mit geprüften Belegen', async () => {
    const pfade: string[] = []
    for (let i = 0; i < 3; i++) {
      pfade.push(join(ordner, `k${i}.png`))
      await writeFile(pfade[i]!, kodierePng(testbild([200, 40, 40], 0.3)))
    }
    const v = await Promise.all([0, 1, 2].map(async (i) => store.hinzu('konto-1', { art: 'datei', pfad: pfade[i]! })))
    const { schicht, anfragen } = fakeKi((a) =>
      a.prompt.includes('Fasse sie')
        ? { regeln: [
            { kategorie: 'figur', text: 'Person groß links, Kopf etwa 40 % der Bildhöhe', belege: [v[0]!.id, v[1]!.id] },
            { kategorie: 'text', text: 'Kein Text', belege: [v[2]!.id, 'erfunden'] },
            { kategorie: 'farbe', text: 'Nur erfundene Belege', belege: ['gibt-es-nicht'] }
          ] }
        : analyse('Nahaufnahme')
    )
    await store.kiAnalyse('konto-1', schicht)
    expect(anfragen.filter((a) => a.bilder.length === 1)).toHaveLength(3)
    const buch = await store.erstelleStilbuch('konto-1', { ki: schicht, beispiel: null })
    expect(buch.quelle).toBe('ki')
    expect(buch.regeln.find((r) => r.text.startsWith('Person groß'))?.belege).toHaveLength(2)
    expect(buch.regeln.find((r) => r.text === 'Kein Text')?.belege).toEqual([v[2]!.id])
    expect(buch.regeln.find((r) => r.text === 'Nur erfundene Belege')).toBeUndefined()
  })

  it('Video-Link: nur das öffentliche Thumbnail und der Titel', async () => {
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk')
    expect(youtubeId('https://example.com/watch?v=abcdefghijk')).toBeNull()
    const v = await store.hinzu('konto-1', { art: 'link', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x' })
    expect(v).toMatchObject({ quelle: 'link', titel: 'Mein Video', kanal: 'Kanal X', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    expect(v.datei).toBe('vorbilder/konto-1/video-dQw4w9WgXcQ.jpg')
  })

  it('Zwischenablage und unlesbare Dateien', async () => {
    const v = await store.hinzu('konto-1', { art: 'zwischenablage', png: kodierePng(testbild([0, 200, 0], 0.5)) })
    expect(v.lokal?.farben[0]?.farbe).toBe('#00c800')
    const kaputt = join(ordner, 'kaputt.png')
    await writeFile(kaputt, 'kein Bild')
    await expect(store.hinzu('konto-1', { art: 'datei', pfad: kaputt })).rejects.toThrow()
  })

  it('Beispiel-Stilbuch Minecraft: nur Regeln und öffentliche Titel, passt nur zu Minecraft', async () => {
    const [mc] = await ladeBeispiele(join(__dirname, '..', '..', 'resources', 'stilbuecher'))
    expect(mc!.regeln.length).toBeGreaterThanOrEqual(10)
    expect(mc!.vorbilder.every((v) => /^[\w-]{11}$/.test(v.video))).toBe(true)
    const konto = { ...leeresProfil(), konten: [] }.konten
    void konto
    const basis = { id: 'k', plattform: 'youtube' as const, name: '', sprache: 'de', richtungen: [] as string[], spiele: [] as string[], formate: [], rhythmus: [], link: null, metadaten: null, darstellung: [], vorbildKanaele: [], vorbildBilder: [] }
    expect(beispielFuer({ ...basis, richtungen: ['gaming'] }, [mc!])).toBeNull()
    expect(beispielFuer({ ...basis, richtungen: ['gaming'], spiele: ['Minecraft'] }, [mc!])?.id).toBe('minecraft')
    // Wenige eigene Vorbilder: Beispiel-Regeln füllen auf
    const buch = await store.erstelleStilbuch('konto-1', { ki: null, beispiel: mc! })
    expect(buch.quelle).toBe('beispiel')
    expect(buch.regeln.length).toBe(mc!.regeln.length)
  })
})
