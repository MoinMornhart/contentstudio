import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exeVersion, findeProgramme, registryPfad } from '../../src/main/programme/erkennung'

async function exe(pfad: string): Promise<string> {
  await mkdir(dirname(pfad), { recursive: true })
  await writeFile(pfad, 'MZ')
  return pfad
}

describe('Adobe-Erkennung (ROADMAP 7.5)', () => {
  it('findet Premiere (alter und neuer Name, Beta), Photoshop und After Effects mit Version aus der exe', async () => {
    const pf = await mkdtemp(join(tmpdir(), 'cs-adobe-'))
    const versionen: Record<string, string> = {
      [await exe(join(pf, 'Adobe', 'Adobe Premiere 2026', 'Adobe Premiere.exe'))]: '26.5.0.12',
      [await exe(join(pf, 'Adobe', 'Adobe Premiere Pro (Beta)', 'Adobe Premiere Pro (Beta).exe'))]: '26.6.0.3',
      [await exe(join(pf, 'Adobe', 'Adobe Photoshop 2026', 'Photoshop.exe'))]: '27.2.0.1',
      [await exe(join(pf, 'Adobe', 'Adobe After Effects 2025', 'Support Files', 'AfterFX.exe'))]: '25.4.1.2'
    }
    await exe(join(pf, 'Adobe', 'Adobe Creative Cloud', 'Creative Cloud.exe'))
    await mkdir(join(pf, 'Adobe', 'Adobe Photoshop 2024'), { recursive: true }) // Reste einer Deinstallation ohne exe
    const liste = await findeProgramme({ lokal: null, programmOrdner: [pf], registry: async () => null, version: async (p) => versionen[p] ?? null })
    expect(liste.map((a) => [a.id, a.name, a.jahr, a.version, a.beta])).toEqual([
      ['premiere', 'Adobe Premiere 2026', '2026', '26.5.0.12', false],
      ['premiere', 'Adobe Premiere Pro (Beta)', null, '26.6.0.3', true],
      ['aftereffects', 'Adobe After Effects 2025', '2025', '25.4.1.2', false],
      ['photoshop', 'Adobe Photoshop 2026', '2026', '27.2.0.1', false]
    ])
  })

  it('findet DaVinci Resolve und CapCut (im Benutzerordner, neueste Version)', async () => {
    const pf = await mkdtemp(join(tmpdir(), 'cs-prog-'))
    const lokal = await mkdtemp(join(tmpdir(), 'cs-lokal-'))
    const resolve = await exe(join(pf, 'Blackmagic Design', 'DaVinci Resolve', 'Resolve.exe'))
    await exe(join(lokal, 'CapCut', 'Apps', '5.9.0.2200', 'CapCut.exe'))
    const capcut = await exe(join(lokal, 'CapCut', 'Apps', '6.1.0.2300', 'CapCut.exe'))
    const liste = await findeProgramme({ programmOrdner: [pf], lokal, registry: async () => null, version: async (p) => (p === resolve ? '20.2.0.9' : '6.1.0') })
    expect(liste.map((a) => [a.id, a.version, a.pfad])).toEqual([
      ['resolve', '20.2.0.9', resolve],
      ['capcut', '6.1.0', capcut]
    ])
  })

  it('findet Installationen auf einem anderen Laufwerk über die Registry', async () => {
    const anders = await mkdtemp(join(tmpdir(), 'cs-adobe-d-'))
    const ps = await exe(join(anders, 'Adobe Photoshop 2025', 'Photoshop.exe'))
    const liste = await findeProgramme({ lokal: null, programmOrdner: [join(anders, 'leer')], registry: async (e) => (e === 'Photoshop.exe' ? ps : e === 'AfterFX.exe' ? join(anders, 'fehlt.exe') : null), version: async () => '26.11.0.1' })
    expect(liste).toEqual([{ id: 'photoshop', name: 'Adobe Photoshop 2025', jahr: '2025', version: '26.11.0.1', beta: false, pfad: ps }])
  })

  it('liefert eine leere Liste ohne Adobe', async () => {
    expect(await findeProgramme({ lokal: null, programmOrdner: [join(tmpdir(), 'gibt-es-nicht-123')], registry: async () => null, version: async () => null })).toEqual([])
  })

  it('liest echte Dateiversionen und App-Paths unter Windows', async () => {
    expect(await exeVersion(process.execPath)).toMatch(/^\d+\.\d+/)
    expect(await exeVersion(join(tmpdir(), 'gibt-es-nicht.exe'))).toBeNull()
    expect(await registryPfad('contentstudio-gibt-es-nicht.exe')).toBeNull()
  }, 30_000)
})
