import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from '../../src/main/data/jsonfile'
import {
  DATA_LAYOUT,
  MARKER_FILE,
  conflictOriginal,
  ensureDataLayout,
  findSyncConflicts,
  isDataDir,
  resolveDataDir
} from '../../src/main/data/datadir'
import { SettingsStore } from '../../src/main/data/settings'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cs-test-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('writeJsonAtomic / readJson', () => {
  const Schema = z.object({ a: z.number() })

  it('schreibt, überschreibt und hinterlässt keine temporären Dateien', async () => {
    const file = join(dir, 'sub', 'x.json')
    await writeJsonAtomic(file, { a: 1 })
    await writeJsonAtomic(file, { a: 2 })
    expect(await readJson(file, Schema)).toEqual({ ok: true, value: { a: 2 } })
    expect(await readdir(join(dir, 'sub'))).toEqual(['x.json'])
  })

  it('übersteht viele gleichzeitige Schreibvorgänge auf dieselbe Datei', async () => {
    const file = join(dir, 'race.json')
    await Promise.all(Array.from({ length: 25 }, (_, i) => writeJsonAtomic(file, { a: i })))
    const res = await readJson(file, Schema)
    expect(res.ok).toBe(true)
    expect(await readdir(dir)).toEqual(['race.json'])
  })

  it('meldet fehlende, kaputte und schemawidrige Dateien ohne zu werfen', async () => {
    expect(await readJson(join(dir, 'fehlt.json'), Schema)).toEqual({ ok: false, reason: 'missing' })
    await writeFile(join(dir, 'kaputt.json'), '{ nicht json', 'utf8')
    expect((await readJson(join(dir, 'kaputt.json'), Schema)).ok).toBe(false)
    await writeFile(join(dir, 'falsch.json'), '{"a":"text"}', 'utf8')
    const res = await readJson(join(dir, 'falsch.json'), Schema)
    expect(res.ok === false && res.reason).toBe('invalid-schema')
  })

  it('liest Dateien mit UTF-8-BOM (z. B. aus dem Windows-Editor)', async () => {
    await writeFile(join(dir, 'bom.json'), '\uFEFF{"a":5}', 'utf8')
    expect(await readJson(join(dir, 'bom.json'), Schema)).toEqual({ ok: true, value: { a: 5 } })
  })
})

describe('Datenordner', () => {
  it('nutzt einen leeren Ordner direkt und legt den Aufbau an', async () => {
    const target = await resolveDataDir(dir)
    expect(target).toBe(dir)
    await ensureDataLayout(target)
    expect(await isDataDir(target)).toBe(true)
    const entries = await readdir(target)
    expect(entries).toContain(MARKER_FILE)
    for (const sub of DATA_LAYOUT) expect(entries).toContain(sub.split('/')[0])
  })

  it('nutzt in einem Ordner mit fremden Dateien einen Unterordner „ContentStudio“', async () => {
    await writeFile(join(dir, 'Urlaub.jpg'), 'x')
    expect(await resolveDataDir(dir)).toBe(join(dir, 'ContentStudio'))
  })

  it('erkennt einen bestehenden Datenordner wieder (zweites Gerät)', async () => {
    await ensureDataLayout(dir)
    await writeFile(join(dir, 'avatare', 'ich.png'), 'x')
    expect(await resolveDataDir(dir)).toBe(dir)
  })

  it('ist beim zweiten Anlegen idempotent und behält die Markierung', async () => {
    await ensureDataLayout(dir)
    const first = await readFile(join(dir, MARKER_FILE), 'utf8')
    await ensureDataLayout(dir)
    expect(await readFile(join(dir, MARKER_FILE), 'utf8')).toBe(first)
  })
})

describe('Konfliktkopien der Sync-Dienste', () => {
  it('erkennt iCloud, Dropbox (englisch und deutsch) und Google Drive', () => {
    const files = new Set(['karte.json', 'karte 2.json', "karte (Laptop's conflicted copy 2026-09-30).json", 'karte (Konfliktkopie von PC 2026-09-30).json', 'karte (1).json', 'rhythmus.json'])
    expect(conflictOriginal('karte 2.json', files)).toBe('karte.json')
    expect(conflictOriginal("karte (Laptop's conflicted copy 2026-09-30).json", files)).toBe('karte.json')
    expect(conflictOriginal('karte (Konfliktkopie von PC 2026-09-30).json', files)).toBe('karte.json')
    expect(conflictOriginal('karte (1).json', files)).toBe('karte.json')
    expect(conflictOriginal('rhythmus.json', files)).toBeNull()
    // Eine Datei, die zufällig auf „ 2“ endet, ohne dass es das Original gibt, ist keine Kopie
    expect(conflictOriginal('folge 2.json', new Set(['folge 2.json']))).toBeNull()
  })

  it('lässt Download-Caches aus', async () => {
    await ensureDataLayout(dir)
    await mkdir(join(dir, 'cache'), { recursive: true })
    await writeFile(join(dir, 'cache', 'a.json'), '{}')
    await writeFile(join(dir, 'cache', 'a 2.json'), '{}')
    expect(await findSyncConflicts(dir)).toEqual([])
  })

  it('erkennt Konfliktkopien auch mit Bindestrich im Gerätenamen und Zähler', () => {
    const files = new Set(['01HX.json', '01HX-LAPTOP.json', '01HX-DESKTOP-AB12-2.json', 'contentstudio-data.json'])
    expect(conflictOriginal('01HX-LAPTOP.json', files)).toBe('01HX.json')
    expect(conflictOriginal('01HX-DESKTOP-AB12-2.json', files)).toBe('01HX.json')
    expect(conflictOriginal('contentstudio-data.json', files)).toBeNull()
    expect(conflictOriginal('Main_neu-PC.png', new Set(['Main_neu.png']))).toBeNull()
  })

  it('findet Konflikte rekursiv im Datenordner', async () => {
    await ensureDataLayout(dir)
    const cards = join(dir, 'planning', 'cards')
    await writeFile(join(cards, 'A.json'), '{}')
    await writeFile(join(cards, 'A-LAPTOP.json'), '{}')
    await writeFile(join(cards, 'B.json'), '{}')
    await mkdir(join(dir, 'projekte', 'p1'), { recursive: true })
    await writeFile(join(dir, 'projekte', 'p1', 'project.json'), '{}')
    await writeFile(join(dir, 'projekte', 'p1', 'project-PC-2.json'), '{}')
    // Fehlalarm aus der App (30.09.): eigene Cache-Dateien im Ordner „mc“ sind keine OneDrive-Kopien
    await mkdir(join(dir, 'mc', 'mobs', '1.26.60.28'), { recursive: true })
    await writeFile(join(dir, 'mc', 'mobs', '1.26.60.28', 'mobs.json'), '{}')
    await writeFile(join(dir, 'mc', 'mobs', '1.26.60.28', 'mobs-gesamt.json'), '{}')
    const conflicts = await findSyncConflicts(dir)
    expect(conflicts.map((c) => c.copy.replace(/\\/g, '/'))).toEqual([
      'planning/cards/A-LAPTOP.json',
      'projekte/p1/project-PC-2.json'
    ])
  })
})

describe('SettingsStore', () => {
  it('liefert Standardwerte, speichert Änderungen und übersteht kaputte Dateien', async () => {
    const store = new SettingsStore(dir)
    expect(await store.load()).toEqual({ format: 1, dataDir: null, setupCompleted: false, sprache: null })
    await store.update({ sprache: 'en' })
    expect((await new SettingsStore(dir).load()).sprache).toBe('en')
    await store.update({ dataDir: 'D:\\OneDrive\\ContentStudio' })
    expect((await new SettingsStore(dir).load()).dataDir).toBe('D:\\OneDrive\\ContentStudio')
    await writeFile(join(dir, 'settings.json'), 'kaputt', 'utf8')
    expect((await new SettingsStore(dir).load()).dataDir).toBeNull()
  })
})
