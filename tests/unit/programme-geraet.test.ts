import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { programmeAuffrischen, quelleFuerProgramme, verlinktePfade } from '../../src/main/programme/geraet'
import { dateiAufDiesemGeraet } from '../../src/main/schnitt/projekt'

describe('Rohvideo für Schnittprogramme auf jedem Gerät (aus MoinStudio v0.47.1–v0.48.3)', () => {
  it('kopiert ein Video von außerhalb des Datenordners ins Projekt und nimmt danach die Kopie', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-daten-'))
    const aussen = await mkdtemp(join(tmpdir(), 'cs-aussen-'))
    const ordner = join(daten, 'schnitt', 'p1')
    await mkdir(ordner, { recursive: true })
    const video = join(aussen, 'aufnahme.MP4')
    await writeFile(video, 'x'.repeat(100))
    const erst = await quelleFuerProgramme(daten, ordner, video, 100)
    expect(erst).toBe(join(ordner, 'quelle', 'video.mp4'))
    // anderes Gerät: Originalpfad gibt es nicht, die Kopie im Projektordner schon
    expect(await quelleFuerProgramme(daten, ordner, 'C:/Users/Anders/Videos/aufnahme.MP4', 100)).toBe(erst)
  })

  it('kopiert nicht, wenn das Video schon in einem geteilten Ordner liegt', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-daten-'))
    const geteilt = join(await mkdtemp(join(tmpdir(), 'cs-heim-')), 'Dropbox', 'Aufnahmen')
    await mkdir(geteilt, { recursive: true })
    const video = join(geteilt, 'roh.mp4')
    await writeFile(video, 'd'.repeat(20))
    expect(await quelleFuerProgramme(daten, join(daten, 'schnitt', 'p'), video, 20)).toBe(video)
    expect(existsSync(join(daten, 'schnitt', 'p', 'quelle'))).toBe(false)
  })

  it('übersetzt Pfade im Datenordner eines anderen Geräts und meldet verständlich, wenn nichts da ist', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-daten-'))
    const ordner = join(daten, 'schnitt', 'p2')
    await mkdir(ordner, { recursive: true })
    await writeFile(join(ordner, 'roh.mp4'), 'y'.repeat(50))
    expect(await quelleFuerProgramme(daten, ordner, 'C:/Users/Laptop/OneDrive/ContentStudio/schnitt/p2/roh.mp4', 50)).toBe(join(daten, 'schnitt', 'p2', 'roh.mp4'))
    await expect(quelleFuerProgramme(daten, join(daten, 'schnitt', 'p3'), 'D:/weg/clip.mp4', 10)).rejects.toThrow(/clip\.mp4/)
  })

  it('überträgt C:\\Users\\<anderer>\\… auf den Benutzerordner dieses Geräts', async () => {
    const heim = await mkdtemp(join(tmpdir(), 'cs-heim-'))
    await mkdir(join(heim, 'iCloudDrive', 'Aufnahmen'), { recursive: true })
    await writeFile(join(heim, 'iCloudDrive', 'Aufnahmen', 'folge 1.mkv'), 'z'.repeat(30))
    expect(dateiAufDiesemGeraet('C:\\Users\\laptop\\iCloudDrive\\Aufnahmen\\folge 1.mkv', { heim, groesse: 30 })).toBe(join(heim, 'iCloudDrive', 'Aufnahmen', 'folge 1.mkv'))
    // falsche Größe: nicht nehmen
    expect(dateiAufDiesemGeraet('C:\\Users\\laptop\\iCloudDrive\\Aufnahmen\\folge 1.mkv', { heim, groesse: 31 })).toBe('C:\\Users\\laptop\\iCloudDrive\\Aufnahmen\\folge 1.mkv')
    // Kopie im Projektordner
    const ordner = await mkdtemp(join(tmpdir(), 'cs-proj-'))
    await mkdir(join(ordner, 'quelle'))
    await writeFile(join(ordner, 'quelle', 'video.mkv'), 'q'.repeat(12))
    expect(dateiAufDiesemGeraet('D:\\Aufnahmen\\roh.MKV', { ordner, groesse: 12 })).toBe(join(ordner, 'quelle', 'video.mkv'))
  })
})

describe('Programmdateien beim Start auffrischen', () => {
  it('liest verlinkte Pfade aus Premiere-XML, FCPXML und After-Effects-Skript', () => {
    expect(verlinktePfade('<pathurl>file://localhost/C:/A%20B/v.mp4</pathurl><pathurl>file://localhost/D:/x&amp;y.png</pathurl>')).toEqual(['C:/A B/v.mp4', 'D:/x&y.png'])
    expect(verlinktePfade('<asset src="file:///C:/A%20B/v.mp4"/>')).toEqual(['C:/A B/v.mp4'])
    expect(verlinktePfade('  var QUELLE = "C:/Videos/\\"roh\\".mp4";')).toEqual(['C:/Videos/"roh".mp4'])
  })

  it('schreibt nur Dateien mit fremden Pfaden neu und räumt alte Namen weg', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-daten-'))
    const prog = join(daten, 'schnitt', 'p1', 'programme')
    await mkdir(prog, { recursive: true })
    const da = join(daten, 'da.mp4')
    await writeFile(da, 'v')
    await writeFile(join(prog, 'gut.fcpxml'), `<asset src="file:///${da.replace(/\\/g, '/')}"/>`)
    await writeFile(join(prog, 'alt.xml'), '<pathurl>file://localhost/C:/Users/Laptop/weg.mp4</pathurl>')
    await writeFile(join(prog, 'alt.srt'), 'srt')
    const aufrufe: string[] = []
    const n = await programmeAuffrischen(daten, async (_d, id, ziel) => {
      aufrufe.push(`${id}:${ziel}`)
      const datei = join(prog, 'Neu.xml')
      await writeFile(datei, '<pathurl>file://localhost/neu</pathurl>')
      return { datei, weitere: [] }
    })
    expect(n).toBe(1)
    expect(aufrufe).toEqual(['p1:premiere'])
    expect(existsSync(join(prog, 'alt.xml'))).toBe(false)
    expect(await readFile(join(prog, 'gut.fcpxml'), 'utf8')).toContain('da.mp4')
  })
})
