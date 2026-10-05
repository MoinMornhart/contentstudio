// Echter Test des Skin-Stings (aus MoinStudio v0.45.0): Blender rendert die Figur mit einem Standard-Skin aus der
// Spieldatei, FFmpeg macht daraus ein Video mit Alphakanal. Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/sting.test.ts
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderSting } from '../../src/main/animation/sting'
import { BLENDER, FFMPEG, FFPROBE, MC_VERSION, mcSkin, ROOT, SKRIPTE, TEST_ECHT } from './hilfen'

describe.runIf(!!BLENDER)('Skin-Sting (echt)', () => {
  it('Sprung ins Bild: Video mit Alphakanal in der gewünschten Länge, beim zweiten Mal aus dem Zwischenspeicher', async () => {
    const cache = join(TEST_ECHT, 'sting')
    rmSync(cache, { recursive: true, force: true })
    const texturen = join(ROOT, 'mc', MC_VERSION, 'extracted', 'assets', 'minecraft', 'textures')
    const r = { blender: { exe: BLENDER!, mesa: true, geraet: 'CPU' }, blenderDir: SKRIPTE, texturen, ffmpeg: FFMPEG, cache }
    const o = { dauer: 2, breite: 640, hoehe: 360, fps: 24, samples: 8 }
    const video = await renderSting('sprung', { skin: mcSkin('alex'), slim: true }, o, r)
    expect(existsSync(video)).toBe(true)
    const info = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,width,height:format=duration', '-of', 'json', video]).toString()
    const j = JSON.parse(info) as { streams: { pix_fmt: string; width: number; height: number }[]; format: { duration: string } }
    console.log(`  → ${video} · ${info.replace(/\s+/g, ' ')}`)
    expect(j.streams[0]!.pix_fmt).toMatch(/yuva/)
    expect(j.streams[0]!.width).toBe(640)
    expect(Math.abs(Number(j.format.duration) - 2)).toBeLessThan(0.15)
    // gleicher Sting → kein neuer Render
    const start = Date.now()
    expect(await renderSting('sprung', { skin: mcSkin('alex'), slim: true }, o, r)).toBe(video)
    expect(Date.now() - start).toBeLessThan(1000)
    // ein Standbild aus der Mitte zum Ansehen
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', '1.2', '-i', video, '-frames:v', '1', join(cache, 'mitte.png')])
  })
})
