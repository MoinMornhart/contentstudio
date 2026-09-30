import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { whenReady: () => new Promise(() => {}) }, protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} } }))

import { WellenSammler, wellenAufloesung } from '../../src/main/schnitt/import'
import { bereich, medienUrl } from '../../src/main/schnitt/medien'
import { quellInfoAus } from '../../src/main/schnitt/projekt'

describe('Schnitt: Import (ROADMAP M5, MoinStudio 6.2)', () => {
  it('liest Videodaten aus ffprobe', () => {
    const info = quellInfoAus({
      format: { duration: '53.52' },
      streams: [
        { codec_type: 'video', width: 1280, height: 720, avg_frame_rate: '30000/1001' },
        { codec_type: 'audio' }
      ]
    })
    expect(info).toEqual({ dauer: 53.52, breite: 1280, hoehe: 720, fps: 29.97, audio: true })
    expect(quellInfoAus({ format: {}, streams: [{ codec_type: 'video', avg_frame_rate: '0/0', r_frame_rate: '60/1' }] }).fps).toBe(60)
  })

  it('beantwortet Range-Anfragen fürs Springen im Video', () => {
    expect(bereich('bytes=0-99', 1000)).toEqual([0, 99])
    expect(bereich('bytes=500-', 1000)).toEqual([500, 999])
    expect(bereich('bytes=-100', 1000)).toEqual([900, 999])
    expect(bereich('bytes=900-5000', 1000)).toEqual([900, 999])
    expect(bereich(null, 1000)).toBeNull()
    expect(bereich('bytes=700-600', 1000)).toBeNull()
    expect(medienUrl('C:\\Daten\\schnitt\\a b\\proxy.mp4')).toBe('cs-media://datei/C%3A%5CDaten%5Cschnitt%5Ca%20b%5Cproxy.mp4')
  })

  it('verdichtet Samples zu Spitzenwerten, auch über Puffergrenzen', () => {
    const s = new WellenSammler(4)
    const puffer = Buffer.alloc(16)
    ;[0, 16384, -32768, 0, 100, 200, 300, 400].forEach((v, i) => puffer.writeInt16LE(v, i * 2))
    s.schiebe(puffer.subarray(0, 5)) // ungerade Grenze: halbes Sample wird aufgehoben
    s.schiebe(puffer.subarray(5))
    s.abschliessen()
    expect(s.werte).toEqual([100, 1])
  })

  it('hält die Wellenform auch bei Stunden-Streams klein', () => {
    expect(wellenAufloesung(60)).toBe(0.05)
    expect(3 * 3600 / wellenAufloesung(3 * 3600)).toBeCloseTo(20000)
  })
})

describe('Schnitt: Projektdatei unter gleichzeitigen Änderungen', () => {
  it('verliert keine Änderung, wenn Import und Oberfläche gleichzeitig schreiben', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { aendereProjekt, ladeProjekt, speichereProjekt } = await import('../../src/main/schnitt/projekt')
    const daten = await mkdtemp(join(tmpdir(), 'cs-schnitt-'))
    try {
      await speichereProjekt(daten, { id: 'p1', name: 'Test', kontoId: 'k', kanal: 'Testkanal', plattform: 'youtube', sprache: 'de', richtung: '', erstellt: '', quelle: null, proxy: false, wellenform: false, leiste: false, auftraege: [] })
      await Promise.all([
        aendereProjekt(daten, 'p1', () => ({ proxy: true })),
        aendereProjekt(daten, 'p1', (p) => ({ auftraege: [...(p.auftraege ?? []), 'a'] })),
        aendereProjekt(daten, 'p1', () => ({ leiste: true })),
        aendereProjekt(daten, 'p1', (p) => ({ auftraege: [...(p.auftraege ?? []), 'b'] }))
      ])
      const p = await ladeProjekt(daten, 'p1')
      expect(p).toMatchObject({ proxy: true, leiste: true, auftraege: ['a', 'b'] })
    } finally {
      await rm(daten, { recursive: true, force: true })
    }
  })
})
