// Echter Test der Weitergabe an fremde Programme (ROADMAP M7): Proben mit FFmpeg, CapCut-Clips nachgemessen, Dateien
// aus dem Schnitt-Projekt des echten Schnitt-Tests (vorher tests/echt/schnitt.test.ts laufen lassen), Erkennung und
// Selbsttest auf diesem Rechner (ohne installierte Programme: „übersprungen“).
// Aufruf: npx vitest run -c vitest.echt.config.ts tests/echt/programme.test.ts
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { findeProgramme } from '../../src/main/programme/erkennung'
import { capcutEingabe, programmDateien } from '../../src/main/programme/projekt-export'
import { capcutOrdner } from '../../src/main/programme/capcut'
import { erzeugeProben, PROBE, selbsttest, type Proben } from '../../src/main/programme/selbsttest'
import type { ProgrammId } from '../../src/main/programme/erkennung'

const ROOT = process.env['CONTENTSTUDIO_TOOLS_DIR'] ?? join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio')
const AUS = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-echt', 'programme')
const SCHNITT = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-echt', 'schnitt', 'daten')
const FF_DIR = readdirSync(join(ROOT, 'ffmpeg')).map((v) => join(ROOT, 'ffmpeg', v, 'bin')).find((d) => existsSync(join(d, 'ffmpeg.exe')))!
const FFMPEG = join(FF_DIR, 'ffmpeg.exe')
const FFPROBE = join(FF_DIR, 'ffprobe.exe')
const dauer = (datei: string): number => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei]).toString())

describe('Programme echt', () => {
  let proben: Proben
  it('erzeugt Proben für alle Programme; CapCut-Clips haben die richtige Länge', async () => {
    proben = await erzeugeProben(join(AUS, 'proben'), FFMPEG)
    for (const x of [proben.premiere, proben.resolve]) expect(XMLValidator.validate(readFileSync(x, 'utf8'))).toBe(true)
    const clips = readdirSync(join(proben.capcut, 'clips')).sort()
    expect(clips).toEqual(PROBE.behalten.map((_, i) => `${String(i + 1).padStart(3, '0')}.mp4`))
    for (const [i, c] of clips.entries()) expect(dauer(join(proben.capcut, 'clips', c))).toBeCloseTo(PROBE.behalten[i]!.ende - PROBE.behalten[i]!.start, 0)
    expect(existsSync(proben.psd)).toBe(true)
  }, 300_000)

  it('schreibt Premiere-XML, After-Effects-Skript, FCPXML/EDL und CapCut-Ordner aus einem echten Schnitt-Projekt', async () => {
    if (!existsSync(join(SCHNITT, 'schnitt', 'en', 'schnitt.json'))) throw new Error('Erst tests/echt/schnitt.test.ts laufen lassen')
    for (const ziel of ['premiere', 'aftereffects', 'resolve'] as const) {
      const r = await programmDateien(SCHNITT, 'en', ziel)
      const text = readFileSync(r.datei, 'utf8')
      if (ziel !== 'aftereffects') expect(XMLValidator.validate(text)).toBe(true)
      else expect(text).toContain('app.project.items.addComp')
      console.log(ziel, r.datei, r.weitere)
    }
    const e = await capcutEingabe(SCHNITT, 'en', join(AUS, 'capcut'), FFMPEG)
    const r = await capcutOrdner(e)
    const summe = r.clips.reduce((s, c) => s + dauer(c), 0)
    const soll = e.behalten.reduce((s, b) => s + b.ende - b.start, 0)
    console.log('CapCut', r.clips.length, 'Clips', summe.toFixed(2), 's, soll', soll.toFixed(2))
    expect(Math.abs(summe - soll)).toBeLessThan(0.1 * r.clips.length + 0.2)
    expect(existsSync(join(r.ordner, 'untertitel.srt'))).toBe(true)
  }, 600_000)

  it('Selbsttest je Programm: ohne Programm „übersprungen“, sonst geprüft oder Checkliste', async () => {
    const gefunden = await findeProgramme()
    console.log('gefunden:', gefunden.map((g) => `${g.id} ${g.version}`).join(', ') || 'keine')
    for (const id of ['premiere', 'aftereffects', 'resolve', 'capcut', 'photoshop'] as ProgrammId[]) {
      const e = await selbsttest(id, gefunden, async () => proben)
      console.log(id, e.status, e.details)
      expect(gefunden.some((g) => g.id === id) ? ['ok', 'checkliste'] : ['übersprungen']).toContain(e.status)
    }
  }, 600_000)
})
