import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script } from 'node:vm'
import { initializeCanvas, readPsd } from 'ag-psd'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { afterEffectsSkript } from '../../src/main/programme/aftereffects'
import { capcutListe, clipName } from '../../src/main/programme/capcut'
import type { PremiereOptionen } from '../../src/main/programme/premiere'
import { fcpUrl, fcpZeit, resolveEdl, resolveFcpxml, timecode } from '../../src/main/programme/resolve'
import { probeBilder, PROBE, selbsttest } from '../../src/main/programme/selbsttest'
import { exportierePsd, feinschliff, uebereinander } from '../../src/main/thumbnail/export'
import { kodierePng, type RohBild } from '../../src/main/bild/rohbild'
import type { ProgrammId } from '../../src/main/programme/erkennung'

const OPTIONEN: PremiereOptionen = {
  name: 'Brot <backen> & Co',
  quelle: { pfad: 'D:\\Aufnahmen\\roh 1.mp4', dauer: 60, breite: 1920, hoehe: 1080, fps: 30, audio: true },
  liste: { version: 1, dauer: 60, behalten: [{ start: 0, ende: 10 }, { start: 15, ende: 30 }, { start: 40, ende: 60 }], entfernt: [] },
  zooms: [{ start: 12, ende: 16 }],
  kapitel: [{ zeit: 0, titel: 'Start' }, { zeit: 25, titel: 'Der Teig' }],
  effekte: [
    { art: 'text', von: 5, bis: 7, text: 'WAS?!', lage: 'oben' },
    { art: 'tempo', von: 12, bis: 14, faktor: 0.5 }
  ]
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })
const liste = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])
const sek = (z: string): number => {
  if (z === '0s') return 0
  const [a, b] = z.replace(/s$/, '').split('/').map(Number)
  return a! / (b ?? 1)
}

describe('DaVinci Resolve: FCPXML und EDL (ROADMAP 7.2, ungetestet in Resolve)', () => {
  it('schreibt rationale Zeiten und Datei-URLs', () => {
    expect(fcpZeit(0, 30)).toBe('0s')
    expect(fcpZeit(300, 30)).toBe('300/30s')
    expect(fcpZeit(1, 29.97)).toBe('1001/30000s')
    expect(fcpUrl('D:\\Aufnahmen\\roh 1.mp4')).toBe('file:///D:/Aufnahmen/roh%201.mp4')
    expect(timecode(3 * 3600 * 30 + 61 * 30 + 7, 30)).toBe('03:01:01:07')
  })

  it('baut eine gültige FCPXML-Zeitleiste ohne Lücken, mit Kapiteln und Effekten als Marker', () => {
    const xml = resolveFcpxml(OPTIONEN)
    expect(XMLValidator.validate(xml)).toBe(true)
    const d = parser.parse(xml) as { fcpxml: { '@version': string; resources: { format: Record<string, string>; asset: Record<string, unknown> }; library: { event: { project: { '@name': string; sequence: { '@duration': string; spine: { 'asset-clip': Record<string, unknown>[] } } } } } } }
    expect(d.fcpxml['@version']).toBe('1.10')
    expect(d.fcpxml.resources.format['@frameDuration']).toBe('1/30s')
    expect((d.fcpxml.resources.asset['media-rep'] as Record<string, string>)['@src']).toBe('file:///D:/Aufnahmen/roh%201.mp4')
    const p = d.fcpxml.library.event.project
    expect(p['@name']).toBe('Brot <backen> & Co')
    const clips = liste(p.sequence.spine['asset-clip'])
    expect(clips).toHaveLength(3)
    // lückenlos: jeder Clip beginnt, wo der vorige endet; Quelle wie im Schnitt
    let pos = 0
    for (const [i, c] of clips.entries()) {
      expect(sek(c['@offset'] as string)).toBeCloseTo(pos, 5)
      expect(sek(c['@start'] as string)).toBeCloseTo(OPTIONEN.liste.behalten[i]!.start, 5)
      pos += sek(c['@duration'] as string)
    }
    expect(pos).toBeCloseTo(45, 5)
    expect(sek(p.sequence['@duration'])).toBeCloseTo(45, 5)
    const marker = clips.flatMap((c) => liste(c['marker'] as Record<string, string>[]))
    expect(marker.map((m) => m['@value'])).toEqual(['Start', 'Effekt: Text „WAS?!“', 'Effekt: Zeitlupe (×0.5)', 'Der Teig'])
    // Kapitel „Der Teig“ bei 25 s im Schnitt = 30 s Quelle? Nein: 25 s im Schnitt liegt im zweiten Stück (10–25) am Ende → drittes Stück, Quelle 40 s
    expect(sek(liste(clips[2]!['marker'] as Record<string, string>[])[0]!['@start'])).toBeCloseTo(40, 5)
  })

  it('schreibt eine EDL mit einem Ereignis je Stück, Bild und Ton', () => {
    const edl = resolveEdl(OPTIONEN).split('\r\n')
    expect(edl[0]).toBe('TITLE: Brot <backen> & Co')
    const ereignisse = edl.filter((z) => /^\d{3} {2}AX/.test(z))
    expect(ereignisse).toHaveLength(3)
    expect(ereignisse[1]).toBe('002  AX       AA/V  C        00:00:15:00 00:00:30:00 00:00:10:00 00:00:25:00')
    expect(edl).toContain('* FROM CLIP NAME: roh 1.mp4')
    expect(edl.some((z) => z.includes('Der Teig'))).toBe(true)
  })
})

describe('After Effects: Skript (ROADMAP 7.1, ungetestet in After Effects)', () => {
  it('ist gültiges JavaScript und enthält Stücke, Zooms, Texte und Marken', () => {
    const js = afterEffectsSkript({ ...OPTIONEN, ergebnis: 'C:\\Test\\ergebnis.json' })
    expect(() => new Script(js)).not.toThrow()
    expect(js).toContain('var QUELLE = "D:/Aufnahmen/roh 1.mp4"')
    expect(js).toContain('var ERGEBNIS = "C:/Test/ergebnis.json"')
    // Stück 2: Start 10 s in der Komposition, Quelle 15–30 s, Zoom-Keyframes bei 12–16 s Schnittzeit
    expect(js).toMatch(/\[10,15,30,\[\[10,100\],\[12,100\],\[12\.35,112\]/)
    expect(js).toContain('["WAS?!",5,7,"oben"]')
    expect(js).toContain('[25,"Der Teig"]')
    expect(js).toContain('LAENGE = 45')
  })

  it('führt das Skript mit einer nachgebauten After-Effects-Umgebung aus', () => {
    const angelegt: { layers: { inPoint?: number; outPoint?: number; startTime?: number; keys: number }[]; marken: number; text: string[] } = { layers: [], marken: 0, text: [] }
    const eigenschaft = (): unknown => ({ property: () => eigenschaft(), setValueAtTime: () => undefined, setValue: () => undefined })
    const comp = {
      name: 'Brot backen & Co',
      width: 1920,
      height: 1080,
      duration: 45,
      layers: {
        add: () => {
          const l = { keys: 0, property: () => ({ property: () => ({ setValueAtTime: () => void l.keys++ }) }) } as { keys: number; property: () => unknown }
          angelegt.layers.push(l)
          return l
        },
        addText: (t: string) => {
          angelegt.text.push(t)
          return { property: () => eigenschaft() }
        }
      },
      markerProperty: { setValueAtTime: () => void angelegt.marken++, numKeys: 0 },
      openInViewer: () => undefined,
      get numLayers() {
        return angelegt.layers.length + angelegt.text.length
      }
    }
    const umgebung = {
      File: function (this: { exists: boolean }) {
        this.exists = true
      },
      ImportOptions: function () {},
      MarkerValue: function () {},
      alert: () => undefined,
      app: { beginUndoGroup: () => undefined, endUndoGroup: () => undefined, project: { importFile: () => ({}), items: { addComp: () => comp } } }
    }
    new Script(afterEffectsSkript(OPTIONEN)).runInNewContext(umgebung)
    expect(angelegt.layers).toHaveLength(3)
    expect(angelegt.layers[1]!.keys).toBeGreaterThan(2)
    expect(angelegt.text).toEqual(['WAS?!'])
    expect(angelegt.marken).toBe(4)
  })
})

describe('CapCut: Projektordner (ROADMAP 7.3)', () => {
  it('nummeriert die Clips und listet Zeiten, Kapitel und Effekte', () => {
    expect(clipName(0)).toBe('001.mp4')
    expect(clipName(11)).toBe('012.mp4')
    const l = capcutListe({ quelle: 'D:\\roh.mp4', behalten: OPTIONEN.liste.behalten, kapitel: OPTIONEN.kapitel, effekte: OPTIONEN.effekte!, titel: 'Brot' })
    expect(l).toContain('001.mp4  0:00–0:10')
    expect(l).toContain('002.mp4  0:10–0:25')
    expect(l).toContain('003.mp4  0:25–0:45')
    expect(l).toContain('0:25  Der Teig')
    expect(l).toContain('0:12  Zeitlupe (×0.5)')
  })
})

describe('Photoshop: PSD mit Ebenen (ROADMAP 7.4)', () => {
  it('legt Ebenen normal übereinander und findet abweichende Pixel', () => {
    const rot: RohBild = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255]) }
    const halb: RohBild = { width: 2, height: 1, data: new Uint8Array([0, 0, 255, 128, 0, 0, 0, 0]) }
    const z = uebereinander([rot, halb], 2, 1)
    expect([...z.data]).toEqual([127, 0, 128, 255, 255, 0, 0, 255])
    expect(feinschliff(z, z)).toBeNull()
    const f = feinschliff({ width: 2, height: 1, data: new Uint8Array([127, 0, 128, 255, 250, 0, 0, 255]) }, z)!
    expect([...f.data]).toEqual([0, 0, 0, 0, 250, 0, 0, 255])
  })

  it('Ebenen übereinander ergeben genau das PNG (Abweichung 0), auch mit Farbangleich nach dem Zusammensetzen', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'cs-psd-'))
    const { ebenen, fertig } = probeBilder(PROBE.psd.breite, PROBE.psd.hoehe)
    await mkdir(join(ordner, 'ebenen'))
    for (const [name, bild] of Object.entries(ebenen)) await writeFile(join(ordner, 'ebenen', name), kodierePng(bild))
    await writeFile(join(ordner, 'fertig.png'), kodierePng(fertig))
    const anzahl = await exportierePsd(join(ordner, 'fertig.png'), join(ordner, 'ebenen'), join(ordner, 'x.psd'))
    // Lesen ohne Canvas: Bilddaten als einfache Puffer
    initializeCanvas(
      () => {
        throw new Error('kein Canvas')
      },
      (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' }) as never
    )
    const psd = readPsd(await readFile(join(ordner, 'x.psd')), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true })
    expect(psd.children!.map((c) => c.name)).toEqual([...PROBE.psd.ebenen])
    expect(anzahl).toBe(4) // drei Ebenen aus dem Ordner und der Feinschliff
    const bilder = psd.children!.map((c) => {
      const d = c.imageData!
      // Ebenen können kleiner als das Bild sein (ag-psd schneidet leere Ränder ab): an ihre Stelle setzen
      const voll = new Uint8Array(PROBE.psd.breite * PROBE.psd.hoehe * 4)
      for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) voll.set(d.data.subarray((y * d.width + x) * 4, (y * d.width + x) * 4 + 4), ((y + (c.top ?? 0)) * PROBE.psd.breite + x + (c.left ?? 0)) * 4)
      return { width: PROBE.psd.breite, height: PROBE.psd.hoehe, data: voll }
    })
    const zusammen = uebereinander(bilder, PROBE.psd.breite, PROBE.psd.hoehe)
    let abweichung = 0
    for (let i = 0; i < zusammen.data.length; i++) abweichung += Math.abs(zusammen.data[i]! - fertig.data[i]!)
    expect(abweichung).toBe(0)
  })
})

describe('Selbsttests (ROADMAP 7.5)', () => {
  it('meldet „übersprungen“, wenn ein Programm fehlt, ohne Proben zu erzeugen', async () => {
    let proben = 0
    for (const id of ['premiere', 'aftereffects', 'resolve', 'capcut', 'photoshop'] as ProgrammId[]) {
      const e = await selbsttest(id, [], async () => {
        proben++
        throw new Error('nicht gebraucht')
      })
      expect(e).toMatchObject({ id, status: 'übersprungen', datei: null })
    }
    expect(proben).toBe(0)
  })
})
