import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { konfliktMuster, liesMitKonfliktkopien } from '../../src/main/data/jsonfile'
import { mitDateistand, type Projekt } from '../../src/main/schnitt/projekt'

// Kopien werden nach %LOCALAPPDATA%\ContentStudio\konflikt-sicherung verschoben – im Test in einen Temp-Ordner
let lokal: string
const altLokal = process.env['LOCALAPPDATA']
beforeEach(async () => {
  lokal = await mkdtemp(join(tmpdir(), 'cs-lokal-'))
  process.env['LOCALAPPDATA'] = lokal
})
afterEach(async () => {
  process.env['LOCALAPPDATA'] = altLokal
  await rm(lokal, { recursive: true, force: true })
})

describe('Konfliktkopien im geteilten Datenordner (iCloud/OneDrive)', () => {
  it('erkennt alle Formen: „ 2“, „(1)“, „ (1)“, „-GERÄT“ und Dropbox-Kopien (aus MoinStudio v0.54.0)', () => {
    const m = konfliktMuster('projekt.json')
    for (const n of ['projekt 2.json', 'projekt(1).json', 'projekt (1).json', 'projekt-LAPTOP.json', "projekt (Laptop's conflicted copy 2026-10-05).json"]) expect(m.test(n)).toBe(true)
    for (const n of ['projekt.json', 'projekte.json', 'projekt 2.jsonx', 'schnitt.json']) expect(m.test(n)).toBe(false)
  })

  it('legt die Datei zurück, wenn iCloud sie in „name 2.json“ umbenannt hat', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-kopie-'))
    await writeFile(join(d, 'projekt 2.json'), '{"id":"a","v":2}')
    expect(JSON.parse(await liesMitKonfliktkopien(join(d, 'projekt.json')))).toEqual({ id: 'a', v: 2 })
    expect(await readdir(d)).toEqual(['projekt.json'])
  })

  it('nimmt die jüngste gültige Fassung und räumt Kopien weg', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-kopie-'))
    await writeFile(join(d, 'schnitt.json'), '{"v":1}')
    await writeFile(join(d, 'schnitt-LAPTOP.json'), '{"v":3}')
    await writeFile(join(d, 'schnitt 2.json'), '{ kaputt')
    await writeFile(join(d, 'schnitt.basis.json'), '{"v":0}') // keine Kopie, andere Datei
    const alt = new Date(Date.now() - 60_000)
    await utimes(join(d, 'schnitt.json'), alt, alt)
    expect(JSON.parse(await liesMitKonfliktkopien(join(d, 'schnitt.json')))).toEqual({ v: 3 })
    expect((await readdir(d)).sort()).toEqual(['schnitt.basis.json', 'schnitt.json'])
    expect(await readFile(join(d, 'schnitt.json'), 'utf8')).toBe('{"v":3}')
  })

  it('Original fehlt: neueste Kopie gewinnt, Felder der älteren werden ergänzt, Kopien gesichert statt gelöscht', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-kopie-'))
    const aelter = join(d, 'projekt(1).json')
    const neuer = join(d, 'projekt 2.json')
    await writeFile(aelter, JSON.stringify({ id: 'c9', nurAlt: 1 }))
    await writeFile(neuer, JSON.stringify({ id: 'c9', rohschnitt: true, vorschau: 5 }))
    await utimes(aelter, new Date(1000), new Date(1000))
    await utimes(neuer, new Date(2000), new Date(2000))
    expect(JSON.parse(await liesMitKonfliktkopien(join(d, 'projekt.json')))).toEqual({ id: 'c9', rohschnitt: true, vorschau: 5, nurAlt: 1 })
    expect(JSON.parse(await readFile(join(d, 'projekt.json'), 'utf8')).nurAlt).toBe(1)
    expect(existsSync(aelter) || existsSync(neuer)).toBe(false)
    const sicherung = join(lokal, 'ContentStudio', 'konflikt-sicherung')
    const laeufe = await readdir(sicherung)
    expect(await readdir(join(sicherung, laeufe[0]!))).toHaveLength(2)
  })

  it('liest ohne Kopien ganz normal und wirft, wenn die Datei fehlt', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-kopie-'))
    await writeFile(join(d, 'effekte.json'), '[]')
    expect(await liesMitKonfliktkopien(join(d, 'effekte.json'))).toBe('[]')
    await expect(liesMitKonfliktkopien(join(d, 'fehlt.json'))).rejects.toThrow()
  })
})

describe('Schnitt-Projekt: Stand aus den Dateien (aus MoinStudio v0.54.0)', () => {
  it('erkennt Fertiges vom anderen Gerät und setzt Fehlendes zurück', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-stand-'))
    await writeFile(join(d, 'schnitt.json'), '{}')
    await writeFile(join(d, 'transkript.jsonl'), '{"start":0}\n')
    await writeFile(join(d, 'export.mp4'), 'x')
    await writeFile(join(d, 'export.json'), '{}')
    await writeFile(join(d, 'vorschau.mp4'), 'x') // wird gerade geschrieben (jünger als 1 min)
    const alt = { id: 'c9', name: 'n', proxy: false, wellenform: false, leiste: false } as unknown as Projekt
    const p = mitDateistand(alt, d)
    expect(p.rohschnitt).toBe(true)
    expect(p.transkript).toBe(true)
    expect(p.export).toBeGreaterThan(0)
    expect(p.vorschau).toBeUndefined()
    expect(mitDateistand(alt, d, Date.now() + 120_000).vorschau).toBeGreaterThan(0)
    // als fertig markiert, Datei weg → nicht mehr fertig
    await rm(join(d, 'export.mp4'))
    expect(mitDateistand({ ...alt, export: 123 }, d).export).toBeUndefined()
  })
})
