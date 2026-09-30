import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encoderArgs, istFaststart, kapitelText, pruefeKapitel, repariereKapitel, youtubeBitrate, technikPruefung, zielFormat } from '../../src/main/schnitt/export'

describe('Schnitt: Export für YouTube (ROADMAP M5, MoinStudio 6.7)', () => {
  it('behält die Auflösung der Aufnahme (gerade Zahlen, höchstens 4K, höchstens 60 fps)', () => {
    expect(zielFormat(1920, 1080, 59.94)).toEqual({ breite: 1920, hoehe: 1080, fps: 60 })
    expect(zielFormat(5120, 2880, 30)).toEqual({ breite: 3840, hoehe: 2160, fps: 30 })
    expect(zielFormat(1281, 721, 144)).toEqual({ breite: 1282, hoehe: 722, fps: 60 })
  })

  it('wählt Bitraten nach YouTube-Empfehlung und setzt High-Profil, 2 B-Frames, halbe-Sekunde-GOP, BT.709', () => {
    expect(youtubeBitrate(1080, 30)).toBe(8)
    expect(youtubeBitrate(1080, 60)).toBe(12)
    expect(youtubeBitrate(2160, 60)).toBe(60)
    const x = encoderArgs('libx264', 1080, 60)
    expect(x).toEqual(expect.arrayContaining(['-profile:v', 'high', '-bf', '2', '-g', '30', '-flags', '+cgop', '-b:v', '12M', '-color_primaries', 'bt709', '-pix_fmt', 'yuv420p']))
    expect(encoderArgs('h264_nvenc', 1080, 30)).toEqual(expect.arrayContaining(['-c:v', 'h264_nvenc', '-b:v', '8M']))
    expect(encoderArgs('unbekannt', 720, 30)[1]).toBe('libx264')
  })

  it('prüft und repariert YouTube-Kapitel (ab 0:00, mindestens 3, jedes mindestens 10 s)', () => {
    const k = [
      { zeit: 3, titel: 'Intro' },
      { zeit: 60, titel: 'Die Höhle' },
      { zeit: 65, titel: 'zu kurz' },
      { zeit: 200, titel: 'Der Creeper' }
    ]
    expect(pruefeKapitel(k, 300)).toEqual(expect.arrayContaining(['erstes Kapitel beginnt nicht bei 0:00', 'Kapitel „Die Höhle“ kürzer als 10 s']))
    const r = repariereKapitel(k, 300)
    expect(r.map((x) => x.zeit)).toEqual([0, 60, 200])
    expect(pruefeKapitel(r, 300)).toEqual([])
    expect(kapitelText(r)).toBe('0:00 Intro\n1:00 Die Höhle\n3:20 Der Creeper')
    expect(repariereKapitel([{ zeit: 0, titel: 'a' }, { zeit: 20, titel: 'b' }], 30)).toEqual([])
  })

  it('meldet Abweichungen von der YouTube-Empfehlung', () => {
    const p = technikPruefung({ streams: [{ codec_type: 'video', codec_name: 'hevc', profile: 'Main', pix_fmt: 'yuv420p10le' }, { codec_type: 'audio', codec_name: 'opus', sample_rate: '44100' }] }, false)
    expect(p.filter((x) => !x.ok).map((x) => x.punkt)).toEqual(['Video H.264', 'Profil High', 'Farbformat 4:2:0', 'Farbraum BT.709', 'Fast Start (sofort abspielbar)', 'Ton AAC', 'Ton 48 kHz'])
  })

  it('erkennt Fast Start am Atom-Aufbau der MP4-Datei', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-mp4-'))
    const atom = (typ: string, laenge = 16): Buffer => {
      const b = Buffer.alloc(laenge)
      b.writeUInt32BE(laenge, 0)
      b.write(typ, 4, 'latin1')
      return b
    }
    try {
      await writeFile(join(dir, 'gut.mp4'), Buffer.concat([atom('ftyp', 24), atom('moov', 32), atom('mdat', 64)]))
      await writeFile(join(dir, 'schlecht.mp4'), Buffer.concat([atom('ftyp', 24), atom('mdat', 64), atom('moov', 32)]))
      expect(await istFaststart(join(dir, 'gut.mp4'))).toBe(true)
      expect(await istFaststart(join(dir, 'schlecht.mp4'))).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
