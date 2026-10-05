import fsp from 'node:fs/promises'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installiereCloudGeduld, mitGeduld, setzeDatenordner } from '../../src/main/data/cloud-geduld'

const sperre = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code })

describe('Cloud-Sperren im Datenordner abwarten (aus MoinStudio v0.48.0)', () => {
  it('wiederholt vorübergehende Fehler und gibt dann das Ergebnis', async () => {
    let n = 0
    const r = await mitGeduld(async () => {
      if (n++ < 3) throw sperre('EBUSY')
      return 'ok'
    }, async () => undefined)
    expect(r).toBe('ok')
    expect(n).toBe(4)
  })

  it('gibt echte Fehler sofort weiter', async () => {
    let n = 0
    await expect(mitGeduld(async () => { n++; throw sperre('ENOENT') }, async () => undefined)).rejects.toThrow('ENOENT')
    expect(n).toBe(1)
  })

  it('gibt nach allen Versuchen auf', async () => {
    await expect(mitGeduld(async () => { throw sperre('EPERM') }, async () => undefined)).rejects.toThrow('EPERM')
  })

  it('greift beim Lesen im Datenordner, außerhalb nicht', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-geduld-'))
    await writeFile(join(daten, 'a.json'), '{}')
    setzeDatenordner(daten)
    installiereCloudGeduld()
    expect(await fsp.readFile(join(daten, 'a.json'), 'utf8')).toBe('{}')
    await expect(fsp.readFile(join(tmpdir(), 'gibt-es-nicht-xyz.json'))).rejects.toThrow()
    setzeDatenordner(null)
  })
})
