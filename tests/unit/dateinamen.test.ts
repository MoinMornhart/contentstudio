import { describe, expect, it } from 'vitest'
import { clipDateiname, sichererName, thumbnailDateiname, videoDateiname, videoName, zeitStempel } from '../../src/main/dateinamen'
import type { JobQueue } from '../../src/main/jobs/queue'
import { thumbDateiname } from '../../src/main/thumbnail/dateiname'

/** Aufgabenliste mit Aufträgen: id → Art, Zeit, Payload, Anzahl Varianten */
function queue(jobs: Record<string, { kind: string; zeit: Date; payload: unknown; varianten: number }>): JobQueue {
  const liste = Object.entries(jobs).map(([id, j]) => ({ id, kind: j.kind, createdAt: j.zeit.toISOString() }))
  return {
    get: (id: string) => liste.find((j) => j.id === id),
    state: () => ({ paused: false, jobs: liste }),
    payload: (id: string) => jobs[id]?.payload,
    result: (id: string) => (jobs[id] ? { varianten: Array.from({ length: jobs[id].varianten }) } : undefined)
  } as unknown as JobQueue
}

describe('Thumbnail speichern (aus MoinStudio v0.38.0)', () => {
  const q = queue({
    a: { kind: 'video', zeit: new Date(2026, 8, 30, 19, 5), payload: { titel: 'Riesen-Creeper?' }, varianten: 3 },
    b: { kind: 'thumbnail', zeit: new Date(2026, 8, 30, 20, 0), payload: {}, varianten: 1 },
    c: { kind: 'aenderung', zeit: new Date(2026, 8, 30, 21, 30), payload: { basis: {} }, varianten: 1 }
  })
  it('Datum und Uhrzeit des Auftrags, Variante, Videoname, Format', async () => {
    expect(await thumbDateiname(q, null, 'a', 1, 'png')).toBe('Riesen-Creeper_Thumbnail_2026-09-30_19-05_V2.png')
    expect(await thumbDateiname(q, null, 'b', 0, 'psd')).toBe('Thumbnail_2026-09-30_20-00.psd')
    expect(await thumbDateiname(q, null, 'b', 0, 'jpg', '9:16')).toBe('Thumbnail_2026-09-30_20-00_9x16.jpg')
    expect(await thumbDateiname(q, null, 'c', 0, 'png')).toBe('Thumbnail_2026-09-30_21-30_Aenderung1.png')
  })
})

const zeit = new Date(2026, 8, 30, 19, 5, 42)

describe('sichererName', () => {
  it('entfernt verbotene Zeichen und Emojis, Umlaute bleiben', () => {
    expect(sichererName('Wer überlebt?? 100 Tage: Hardcore 🔥')).toBe('Wer überlebt 100 Tage Hardcore')
    expect(sichererName('a/b\\c*d"e<f>g|h')).toBe('a b c d e f g h')
  })
  it('kein Punkt oder Leerzeichen am Ende, Ersatz bei leerem Namen', () => {
    expect(sichererName('Ende...  ')).toBe('Ende')
    expect(sichererName('???')).toBe('Video')
    expect(sichererName('🔥', 'Thumbnail')).toBe('Thumbnail')
  })
  it('reservierte Windows-Namen werden entschärft', () => {
    expect(sichererName('CON')).toBe('CON_')
    expect(sichererName('Lpt1')).toBe('Lpt1_')
    expect(sichererName('Console')).toBe('Console')
  })
  it('kürzt lange Namen an einer Wortgrenze', () => {
    const n = sichererName('Ich habe Minecraft durchgespielt aber jeder Block gibt mir zufällige Items und das ist verrückt', 'Video', 40)
    expect(n.length).toBeLessThanOrEqual(40)
    expect(n).toBe('Ich habe Minecraft durchgespielt aber')
  })
})

describe('Dateinamen', () => {
  it('Zeitstempel in lokaler Zeit', () => {
    expect(zeitStempel(zeit)).toBe('2026-09-30_19-05')
  })
  it('Thumbnail mit Datum, Variante und Änderung', () => {
    expect(thumbnailDateiname({ zeit, variante: 0, varianten: 1, endung: 'png' })).toBe('Thumbnail_2026-09-30_19-05.png')
    expect(thumbnailDateiname({ zeit, variante: 1, varianten: 3, endung: '.psd' })).toBe('Thumbnail_2026-09-30_19-05_V2.psd')
    expect(thumbnailDateiname({ zeit, variante: 0, varianten: 1, aenderung: 3, endung: 'png' })).toBe('Thumbnail_2026-09-30_19-05_Aenderung3.png')
    expect(thumbnailDateiname({ video: '100 Tage: Hardcore!', zeit, variante: 0, varianten: 2, endung: 'png' })).toBe('100 Tage Hardcore!_Thumbnail_2026-09-30_19-05_V1.png')
  })
  it('Video, Clip und Short', () => {
    expect(videoDateiname('Mein Video?', 'mp4')).toBe('Mein Video.mp4')
    expect(clipDateiname('Stream 12', 'short', 1)).toBe('Stream 12_Short_1.mp4')
    expect(clipDateiname('Stream 12', 'clip', 4)).toBe('Stream 12_Clip_4.mp4')
  })
  it('Videoname: Projektname, sonst Originaldatei ohne Endung', () => {
    expect(videoName({ name: '  Bester Titel ', quelle: 'C:\\a\\roh.mp4' })).toBe('Bester Titel')
    expect(videoName({ name: '', quelle: 'C:\\Aufnahmen\\2026-09-30 19-00-01.mkv' })).toBe('2026-09-30 19-00-01')
    expect(videoName({})).toBe('Video')
  })
})
