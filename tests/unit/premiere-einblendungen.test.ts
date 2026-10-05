import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { premiereXml } from '../../src/main/programme/premiere'
import { premiereMedien } from '../../src/main/programme/premiere-medien'

const basis = { name: 'Test', quelle: { pfad: 'C:/v/a.mp4', dauer: 20, breite: 1920, hoehe: 1080, fps: 30, audio: true }, liste: { version: 1 as const, dauer: 20, behalten: [{ start: 0, ende: 20 }], entfernt: [] }, zooms: [], kapitel: [] }

describe('Premiere: Bibliotheks-Effekte als echte Clips (aus MoinStudio v0.55.0)', () => {
  it('legt Einblendungen auf eine eigene Videospur und Töne auf A2, mit Größe, Lage und Lautstärke', () => {
    const xml = premiereXml({
      ...basis,
      einblendungen: [
        { datei: 'C:/daten/effekte/abo/video.mov', start: 5, dauer: 10.5, breite: 1920, hoehe: 1080, groesse: 1, lage: 'unten', standbild: false },
        { datei: 'C:/daten/effekte/logo/bild.png', start: 2, dauer: 3, breite: 400, hoehe: 200, groesse: 0.2, lage: 'oben-rechts', standbild: true }
      ],
      toene: [{ datei: 'C:/daten/schnitt/x/programme/medien/boom.wav', start: 7, dauer: 1.2, lautstaerke: 1.5 }],
      effekte: [{ art: 'geraeusch', bei: 7, klang: 'boom' }]
    })
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml.match(/<track>/g)).toHaveLength(4) // V1 Schnitt, Einblendungen, A1 Original, A2 Töne
    expect(xml.indexOf('clipitem-e0')).toBeLessThan(xml.indexOf('<audio><numOutputChannels>'))
    expect(xml).toMatch(/clipitem-e0[\s\S]*?<start>150<\/start><end>465<\/end>/)
    expect(xml).toMatch(/clipitem-e1[\s\S]*?<value>96<\/value>/) // 1920 · 0,2 / 400 = 96 %
    expect(xml).toContain('file://localhost/C:/daten/effekte/abo/video.mov')
    expect(xml.indexOf('clipitem-g0')).toBeGreaterThan(xml.indexOf('<audio><numOutputChannels>'))
    expect(xml).toMatch(/clipitem-g0[\s\S]*?<start>210<\/start>[\s\S]*?<value>1.5<\/value>/)
    // das Geräusch liegt schon in der Sequenz: der Marker sagt nicht mehr „von Hand setzen“
    expect(xml).toContain('in der Sequenz enthalten')
  })

  it('ohne Ton im Original kommen die Töne trotzdem auf eine eigene Spur', () => {
    const xml = premiereXml({ ...basis, quelle: { ...basis.quelle, audio: false }, toene: [{ datei: 'C:/m/ding.wav', start: 1, dauer: 1, lautstaerke: 1 }] })
    expect(xml).toMatch(/<audio><numOutputChannels>2<\/numOutputChannels><track><clipitem id="clipitem-g0">/)
    expect(XMLValidator.validate(xml)).toBe(true)
  })

  it('ohne FFmpeg bleibt es bei den Markern', async () => {
    const r = await premiereMedien('C:/gibt-es-nicht', 'C:/gibt-es-nicht/medien', [{ art: 'geraeusch', bei: 1, klang: 'boom' }], null)
    expect(r).toEqual({ einblendungen: [], toene: [] })
  })

  // echter Lauf nur, wenn FFmpeg im Werkzeug-Ordner liegt (CONTENTSTUDIO_TOOLS_DIR)
  const werkzeuge = process.env['CONTENTSTUDIO_TOOLS_DIR']
  const ffOrdner = werkzeuge && existsSync(join(werkzeuge, 'ffmpeg')) ? readdirSync(join(werkzeuge, 'ffmpeg')) : []
  const ff = ffOrdner.map((v) => join(werkzeuge!, 'ffmpeg', v, 'bin', 'ffmpeg.exe')).find((f) => existsSync(f)) ?? ''
  it.runIf(!!ff && existsSync(ff))('legt Standard-Geräusche als Kopie ins Projekt', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-premiere-'))
    const r = await premiereMedien(d, join(d, 'medien'), [{ art: 'geraeusch', bei: 3, klang: 'boom', lautstaerke: 0.8 }], { ffmpeg: ff, klaenge: join(d, 'klaenge') })
    expect(r.toene).toHaveLength(1)
    expect(r.toene[0]!.datei).toBe(join(d, 'medien', 'boom.wav'))
    expect(existsSync(r.toene[0]!.datei)).toBe(true)
    expect(r.toene[0]).toMatchObject({ start: 3, lautstaerke: 0.8 })
  }, 60_000)

  it.runIf(!!ff && existsSync(ff))('wandelt ein Greenscreen-Video einmal in ProRes 4444 mit Alpha und nimmt seinen Ton mit', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cs-premiere-'))
    const gruen = join(d, 'abo.mp4')
    execFileSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x00ff00:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', gruen])
    const effekt = { art: 'video' as const, bei: 4, datei: gruen, lage: 'unten-rechts' as const, groesse: 0.3, ton: true, chroma: { farbe: '#00ff00', toleranz: 0.3, weichheit: 0.1, spill: 0.5 } }
    const r = await premiereMedien(d, join(d, 'medien'), [effekt], { ffmpeg: ff, klaenge: join(d, 'klaenge') })
    expect(r.einblendungen).toHaveLength(1)
    const mov = r.einblendungen[0]!.datei
    expect(mov.endsWith('.mov')).toBe(true)
    expect(r.einblendungen[0]).toMatchObject({ start: 4, breite: 320, hoehe: 180, groesse: 0.3, lage: 'unten-rechts' })
    expect(r.toene).toEqual([expect.objectContaining({ datei: mov, start: 4 })])
    const probe = join(ff, '..', 'ffprobe.exe')
    expect(execFileSync(probe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt', '-of', 'csv=p=0', mov]).toString().trim()).toMatch(/^prores,yuva444p/)
    // zweiter Lauf: dieselbe Wandlung wird wiederverwendet
    const nochmal = await premiereMedien(d, join(d, 'medien'), [effekt], { ffmpeg: ff, klaenge: join(d, 'klaenge') })
    expect(nochmal.einblendungen[0]!.datei).toBe(mov)
  }, 120_000)
})
