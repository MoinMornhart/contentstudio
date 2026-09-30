import { mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { liesMitKonfliktkopien } from '../../src/main/data/jsonfile'

describe('Konfliktkopien im geteilten Datenordner (iCloud/OneDrive)', () => {
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

  it('liest ohne Kopien ganz normal und wirft, wenn die Datei fehlt', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-kopie-'))
    await writeFile(join(d, 'effekte.json'), '[]')
    expect(await liesMitKonfliktkopien(join(d, 'effekte.json'))).toBe('[]')
    await expect(liesMitKonfliktkopien(join(d, 'fehlt.json'))).rejects.toThrow()
  })
})
