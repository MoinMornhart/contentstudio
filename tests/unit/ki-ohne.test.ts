import { mkdtemp, writeFile } from 'node:fs/promises'
import { kodierePng } from '../../src/main/bild/rohbild'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KiSchicht } from '../../src/main/ki/schicht'
import type { JobContext } from '../../src/main/jobs/queue'
import { planungKiJob } from '../../src/main/planung/ideen'
import { wunschJob } from '../../src/main/schnitt/bearbeiten'
import { aenderungJob } from '../../src/main/thumbnail/aenderung'
import { kiPruefung } from '../../src/main/thumbnail/pruefung'
import { stilbuchAus } from '../../src/main/thumbnail/vorbilder'
import { sieheAuftragsVorbilder } from '../../src/main/thumbnail/job'
import { leeresProfil } from '../../src/shared/profil'
import { fakeKi } from '../ki-fake'

/**
 * Jede KI-Funktion ohne KI (ROADMAP 8.3): Hinweis statt Absturz, oder ein Rückfall ohne KI. Die Rückfälle von Rohschnitt,
 * Export-Texten, Höhepunkten und Thumbnail-Plan prüfen die echten Tests (tests/echt/schnitt.test.ts mit ki: null,
 * tests/echt/thumbnail.test.ts); hier die übrigen.
 */

const ohne = new KiSchicht(new Map(), async () => [])
const nurText = fakeKi(() => ({}), { bilder: false }).schicht

function ctx(): JobContext<never> {
  return {
    id: 't',
    checkpoint: undefined as never,
    save: async () => undefined,
    progress: () => undefined,
    yield: async () => undefined,
    signal: new AbortController().signal,
    track: () => undefined,
    waitUntil: () => {
      throw new Error('limit')
    }
  } as unknown as JobContext<never>
}

describe('KI-Funktionen ohne KI (ROADMAP 8.3)', () => {
  it('Planung: Ideen, Titel, Wochenplan sagen, dass eine KI fehlt', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-ohne-'))
    const profil = { ...leeresProfil(), konten: [{ ...leeresProfil().konten[0], id: 'k', plattform: 'youtube' as const, name: 'x', sprache: 'de', richtungen: [], spiele: [], formate: [], rhythmus: [], link: null, metadaten: null, darstellung: [], vorbildKanaele: [], vorbildBilder: [] }] }
    for (const art of ['ideen', 'woche'] as const) await expect(planungKiJob({ art, daten, kontoId: 'k' }, ctx(), { ki: ohne, profil: async () => profil })).rejects.toThrow('KI-Wege')
  })

  it('Schnitt-Wünsche und Thumbnail-Änderungen in Worten sagen, wo man eine KI einrichtet', async () => {
    await expect(wunschJob({ daten: 'x', projekt: 'p', wunsch: 'mehr Tempo' } as Parameters<typeof wunschJob>[0], ctx(), { ki: null })).rejects.toThrow('Einstellungen → KI')
    await expect(wunschJob({ daten: 'x', projekt: 'p', wunsch: 'mehr Tempo' } as Parameters<typeof wunschJob>[0], ctx(), { ki: ohne })).rejects.toThrow('Einstellungen → KI')
    await expect(aenderungJob({ quelle: 'x', wunsch: 'mehr Rot' } as Parameters<typeof aenderungJob>[0], ctx() as never, { ki: null } as Parameters<typeof aenderungJob>[2])).rejects.toThrow('Einstellungen → KI')
  })

  it('Bildbewertung und Vorbild-Beschreibung laufen ohne Bild-KI weiter (nur lokale Messung)', async () => {
    expect(await kiPruefung(null, 'x.png', { beschreibung: 'x', sprache: 'de' })).toBeNull()
    expect(await kiPruefung(nurText, 'x.png', { beschreibung: 'x', sprache: 'de' })).toBeNull()
    const bild = join(await mkdtemp(join(tmpdir(), 'cs-ohne-')), 'vorbild.png')
    await writeFile(bild, kodierePng({ width: 64, height: 36, data: new Uint8Array(64 * 36 * 4).fill(200) }))
    const vorbild = [{ pfad: bild, uebernehmen: ['farben'] }] as unknown as Parameters<typeof sieheAuftragsVorbilder>[0]
    for (const ki of [null, nurText]) {
      const [a] = await sieheAuftragsVorbilder(vorbild, ki)
      expect(a!.beschreibung).toBeTruthy() // Beschreibung aus der lokalen Messung
    }
  })

  it('Stilbuch entsteht ohne KI aus den Messungen der Vorbilder', async () => {
    const s = await stilbuchAus([], { ki: null, beispiel: null })
    expect(s).toBeTruthy()
  })
})
