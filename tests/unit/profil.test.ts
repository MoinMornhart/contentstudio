import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { brauchtDreiD, brauchtFreistellen, leeresProfil, MIGRATIONEN, PROFIL_DATEI, profilAus, ProfilFehler, type Profil } from '../../src/shared/profil'
import { SettingsStore } from '../../src/main/data/settings'
import { ProfilStore } from '../../src/main/profil/store'
import { noetigeWerkzeuge, zielOrdner } from '../../src/main/profil/ipc'

const mitKonto = (darstellung: Profil['konten'][number]['darstellung']): Profil => {
  const p = leeresProfil()
  return profilAus({ ...p, konten: [{ id: 'konto-1', plattform: 'youtube', name: '@test', darstellung }] })
}

describe('Creator-Profil: Schema', () => {
  it('ein leeres Profil ist gültig und hat Standards für alles', () => {
    const p = leeresProfil()
    expect(p.version).toBe(1)
    expect(p.konten).toEqual([])
    expect(p.einstellungen).toEqual({ vorbildHinweise: false, autoUpload: false })
    expect(p.marke).toEqual({ logos: [], farben: [], schrift: null, wasserzeichen: false })
    expect(profilAus(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('füllt fehlende Felder eines Kontos mit Standards', () => {
    const p = profilAus({ version: 1, erstellt: 'x', geaendert: 'x', konten: [{ id: 'k', plattform: 'tiktok' }] })
    expect(p.konten[0]).toMatchObject({ name: '', sprache: 'de', richtungen: [], formate: [], rhythmus: [], darstellung: [], metadaten: null })
  })

  it('akzeptiert freie Richtungen und jede Darstellungsart', () => {
    const p = profilAus({
      ...leeresProfil(),
      konten: [
        {
          id: 'k',
          plattform: 'youtube',
          richtungen: ['kochen', 'Vegane Backstube'],
          darstellung: [{ art: 'foto', fotos: ['avatare/fotos/a.png'] }, { art: 'spielavatar', spiel: 'Roblox', bilder: ['avatare/bilder/r.png'] }, { art: 'modell3d', datei: 'avatare/modelle/v.vrm', format: 'vrm' }, { art: 'maskottchen' }]
        }
      ]
    })
    expect(p.konten[0]!.richtungen).toContain('Vegane Backstube')
    expect(p.konten[0]!.darstellung.map((d) => d.art)).toEqual(['foto', 'spielavatar', 'modell3d', 'maskottchen'])
  })

  it('lehnt ungültige Werte ab, statt sie still zu übernehmen', () => {
    const basis = leeresProfil()
    expect(() => profilAus({ ...basis, konten: [{ id: 'k', plattform: 'myspace' }] })).toThrow(ProfilFehler)
    expect(() => profilAus({ ...basis, marke: { farben: ['rot'] } })).toThrow(/farben/)
    expect(() => profilAus({ ...basis, konten: [{ id: 'k', plattform: 'youtube', rhythmus: [{ tag: 9, zeit: '17:00' }] }] })).toThrow(ProfilFehler)
    expect(() => profilAus('kein Objekt')).toThrow(ProfilFehler)
  })

  it('lässt Profile einer neueren Version unangetastet', () => {
    expect(() => profilAus({ ...leeresProfil(), version: 99 })).toThrow(/neueren/)
  })

  it('migriert ältere Versionen Schritt für Schritt (Mechanik mit einer Test-Migration)', () => {
    MIGRATIONEN[0] = (alt) => ({ ...alt, version: 1, person: { name: String(alt['kuenstlername'] ?? '') } })
    try {
      const p = profilAus({ erstellt: 'x', geaendert: 'x', kuenstlername: 'Kim' })
      expect(p.version).toBe(1)
      expect(p.person.name).toBe('Kim')
    } finally {
      delete MIGRATIONEN[0]
    }
    expect(() => profilAus({ erstellt: 'x', geaendert: 'x' })).toThrow(/Migration/)
  })

  it('erkennt, ob 3D (Blender) oder Freistellen gebraucht wird', () => {
    expect(brauchtDreiD(mitKonto([{ art: 'foto', fotos: [] }]))).toBe(false)
    expect(brauchtFreistellen(mitKonto([{ art: 'foto', fotos: [] }]))).toBe(true)
    expect(brauchtDreiD(mitKonto([{ art: 'spielavatar', spiel: 'minecraft', skin: null, accountName: null, slim: null, bilder: [], modell: null }]))).toBe(true)
    expect(brauchtDreiD(mitKonto([{ art: 'modell3d', datei: null, format: null }]))).toBe(true)
    const freund = profilAus({ ...leeresProfil(), freunde: [{ id: 'freund-1', name: 'Alex', darstellung: [{ art: 'spielavatar' }] }] })
    expect(brauchtDreiD(freund)).toBe(true)
  })

  it('Werkzeuge nach Profil: ohne 3D kein Blender', () => {
    expect(noetigeWerkzeuge(mitKonto([{ art: 'keine' }]))).toEqual(['ffmpeg', 'uv'])
    expect(noetigeWerkzeuge(mitKonto([{ art: 'modell3d', datei: null, format: null }]))).toEqual(['ffmpeg', 'uv', 'blender'])
  })
})

describe('Creator-Profil: Speicher im Datenordner', () => {
  let ordner: string
  let store: ProfilStore
  beforeEach(async () => {
    ordner = await mkdtemp(join(tmpdir(), 'cs-profil-'))
    const settings = new SettingsStore(join(ordner, 'ud'))
    await settings.update({ dataDir: join(ordner, 'daten') })
    store = new ProfilStore(settings)
  })

  it('fehlt die Datei, gilt ein leeres Profil; Speichern schreibt atomar und meldet die Änderung', async () => {
    expect((await store.laden()).konten).toEqual([])
    let gemeldet: Profil | null = null
    store.on('change', (p: Profil) => (gemeldet = p))
    const neu = await store.aendern((p) => ({ ...p, person: { ...p.person, name: 'Kim', sprachen: ['de'] } }))
    expect(neu.person.name).toBe('Kim')
    expect(gemeldet).not.toBeNull()
    const datei = JSON.parse(await readFile(join(ordner, 'daten', PROFIL_DATEI), 'utf8')) as Profil
    expect(datei.person).toMatchObject({ name: 'Kim', sprachen: ['de'] })
    await expect(new ProfilStore(new SettingsStore(join(ordner, 'ud'))).laden()).resolves.toMatchObject({ person: { name: 'Kim' } })
  })

  it('repariert eine iCloud-Konfliktkopie beim Lesen (neueste gültige Fassung gewinnt)', async () => {
    await store.aendern((p) => ({ ...p, person: { ...p.person, name: 'Alt' } }))
    const kopie = { ...leeresProfil(), person: { name: 'Neu', sprachen: [], team: 'allein', mitglieder: [] } }
    await new Promise((r) => setTimeout(r, 20))
    await writeFile(join(ordner, 'daten', 'creator-profile 2.json'), JSON.stringify(kopie))
    const frisch = new ProfilStore(new SettingsStore(join(ordner, 'ud')))
    expect((await frisch.laden()).person.name).toBe('Neu')
  })

  it('eine kaputte Datei führt zu einem Fehler und bleibt unverändert', async () => {
    const pfad = join(ordner, 'daten', PROFIL_DATEI)
    await store.aendern((p) => p)
    await writeFile(pfad, '{"version":1,"konten":[{"id":"k","plattform":"myspace"}]}')
    const frisch = new ProfilStore(new SettingsStore(join(ordner, 'ud')))
    await expect(frisch.laden()).rejects.toThrow(ProfilFehler)
    expect(await readFile(pfad, 'utf8')).toContain('myspace')
  })

  it('legt Dateien des Nutzers im Datenordner ab, ohne vorhandene zu überschreiben', async () => {
    const quelle = join(ordner, 'Mein Foto!.png')
    await writeFile(quelle, 'bild')
    const a = await store.dateiAblegen(quelle, zielOrdner('foto'))
    const b = await store.dateiAblegen(quelle, zielOrdner('foto'))
    expect(a).toBe('avatare/fotos/Mein-Foto-.png')
    expect(b).toBe('avatare/fotos/Mein-Foto--2.png')
    expect(await readFile(await store.absolut(a), 'utf8')).toBe('bild')
    await expect(store.absolut('../ud/settings.json')).rejects.toThrow(/außerhalb/)
  })

  it('Zielordner: Freunde, Vorbilder je Konto, Marke', () => {
    expect(zielOrdner('skin', 'freund-abc')).toBe('freunde/freund-abc/skins')
    expect(zielOrdner('vorbild', 'konto-1')).toBe('vorbilder/konto-1')
    expect(zielOrdner('vorbild', '../boese')).toBe('vorbilder/boese')
    expect(zielOrdner('logo')).toBe('marke/logos')
    expect(zielOrdner('modell', 'konto-1')).toBe('avatare/modelle')
  })
})

describe('YouTube-Richtlinie: 30 Tage', () => {
  it('entfernt öffentliche Kanal-Daten nach 30 Tagen, jüngere bleiben', async () => {
    const { ohneAlteMetadaten } = await import('../../src/shared/profil')
    const video = { id: 'v', titel: 't', thumbnail: 'https://i.ytimg.com/x.jpg', veroeffentlicht: '', dauer: null }
    const p = profilAus({
      ...leeresProfil(),
      konten: [
        { id: 'alt', plattform: 'youtube', metadaten: { zustimmung: true, abgerufen: '2026-08-01T00:00:00Z', videos: [video] } },
        { id: 'neu', plattform: 'youtube', metadaten: { zustimmung: true, abgerufen: '2026-09-25T00:00:00Z', videos: [video] } }
      ]
    })
    const q = ohneAlteMetadaten(p, Date.parse('2026-09-30T00:00:00Z'))
    expect(q.konten[0]!.metadaten).toEqual({ zustimmung: true, abgerufen: null, videos: [] })
    expect(q.konten[1]!.metadaten!.videos).toHaveLength(1)
    expect(ohneAlteMetadaten(q, Date.parse('2026-09-30T00:00:00Z'))).toBe(q)
  })
})
