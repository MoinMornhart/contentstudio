import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { jsonAusText } from '../../src/main/ki/json'
import { KeineKiFehler, KiSchicht, KostenAbgelehnt, mitZustimmung } from '../../src/main/ki/schicht'
import { KiLimitFehler, type KiAnbieter, type RohAnfrage, type RohAntwort } from '../../src/main/ki/typen'
import { LimitWait, type JobContext } from '../../src/main/jobs/queue'

const Ideen = z.object({ ideen: z.array(z.object({ titel: z.string().min(3) })).min(1) })
const auftrag = { name: 'test', system: 'Du bist ein Test.', prompt: 'Gib Ideen.', schema: Ideen }

/** Test-Anbieter: liefert der Reihe nach die vorgegebenen Antworten und merkt sich die Anfragen */
function anbieter(id: string, antworten: (string | Error)[], opt: Partial<KiAnbieter> & { bereit?: boolean; schema?: boolean; bilder?: boolean; verzoegerung?: number } = {}) {
  const anfragen: RohAnfrage[] = []
  const a: KiAnbieter & { anfragen: RohAnfrage[] } = {
    id,
    art: 'lokal',
    faehigkeiten: { text: true, bilderSehen: opt.bilder ?? false, werkzeuge: false, jsonSchema: opt.schema ?? false, lange: true },
    anfragen,
    pruefe: async () => ({ installiert: true, bereit: opt.bereit ?? true, hinweis: opt.bereit === false ? 'nicht angemeldet' : null }),
    frage: async (r: RohAnfrage): Promise<RohAntwort> => {
      anfragen.push(r)
      if (opt.verzoegerung) await new Promise((res) => setTimeout(res, opt.verzoegerung))
      const x = antworten.shift()
      if (x === undefined) throw new Error('keine Antwort mehr')
      if (x instanceof Error) throw x
      return { text: x, modell: `${id}-modell`, nutzung: { eingabe: 10, ausgabe: 5 } }
    },
    preis: opt.preis
  }
  return a
}

const schicht = (liste: KiAnbieter[], extra: { freigabe?: (i: { usd: number | null }) => Promise<boolean>; buchen?: (usd: number) => Promise<void> } = {}) =>
  new KiSchicht(new Map(liste.map((a) => [a.id, a])), async () => liste.map((a) => ({ id: a.id, aktiv: true })), extra.freigabe, extra.buchen)

describe('JSON aus KI-Antworten', () => {
  it('liest reines JSON, Codeblöcke und JSON mit Text drumherum', () => {
    expect(jsonAusText('{"a":1}')).toEqual({ a: 1 })
    expect(jsonAusText('Hier:\n```json\n{"a":[1,2]}\n```\nViel Spaß')).toEqual({ a: [1, 2] })
    expect(jsonAusText('Klar! {"t":"mit } Klammer im Text"} und fertig')).toEqual({ t: 'mit } Klammer im Text' })
    expect(() => jsonAusText('gar kein JSON')).toThrow()
  })
})

describe('KI-Schicht', () => {
  it('gibt gültiges JSON sofort zurück', async () => {
    const a = anbieter('a', ['{"ideen":[{"titel":"Pasta"}]}'])
    const e = await schicht([a]).frage(auftrag)
    expect(e).toMatchObject({ daten: { ideen: [{ titel: 'Pasta' }] }, anbieter: 'a', reparaturen: 0 })
    // Anbieter ohne JSON-Schema bekommt „nur JSON“ samt Schema in die Anweisung
    expect(a.anfragen[0]!.system).toMatch(/JSON Schema/)
  })

  it('repariert kaputtes und ungültiges JSON mit den Zod-Fehlern', async () => {
    const a = anbieter('a', ['Ideen: {"ideen": [', '{"ideen":[{"titel":"x"}]}', '{"ideen":[{"titel":"Brot backen"}]}'])
    const e = await schicht([a]).frage(auftrag)
    expect(e.reparaturen).toBe(2)
    expect(a.anfragen[2]!.prompt).toMatch(/ideen\.0\.titel/)
  })

  it('gibt nach zwei erfolglosen Reparaturen auf und weicht auf den nächsten Weg aus', async () => {
    const a = anbieter('a', ['nein', 'nein', 'nein'])
    const b = anbieter('b', ['{"ideen":[{"titel":"Rückfall"}]}'])
    const e = await schicht([a, b]).frage(auftrag)
    expect(e.anbieter).toBe('b')
    expect(a.anfragen).toHaveLength(3)
  })

  it('überspringt Wege, die nicht bereit sind oder keine Bilder sehen, wenn Bilder nötig sind', async () => {
    const aus = anbieter('aus', [], { bereit: false })
    const blind = anbieter('blind', ['{"ideen":[{"titel":"blind"}]}'])
    const sehend = anbieter('sehend', ['{"ideen":[{"titel":"sieht"}]}'], { bilder: true })
    expect((await schicht([aus, blind, sehend]).frage(auftrag)).anbieter).toBe('blind')
    expect((await schicht([aus, blind, sehend]).frage({ ...auftrag, brauchtBilder: true, bilder: ['x.png'] })).anbieter).toBe('sehend')
  })

  it('ohne passenden Weg ein verständlicher Fehler statt Absturz', async () => {
    await expect(schicht([]).frage(auftrag)).rejects.toBeInstanceOf(KeineKiFehler)
    await expect(schicht([anbieter('blind', [])]).frage({ ...auftrag, brauchtBilder: true })).rejects.toBeInstanceOf(KeineKiFehler)
  })

  it('führt immer nur einen Auftrag gleichzeitig aus', async () => {
    let gleichzeitig = 0
    let maximal = 0
    const a = anbieter('a', ['{"ideen":[{"titel":"eins"}]}', '{"ideen":[{"titel":"zwei"}]}', '{"ideen":[{"titel":"drei"}]}'])
    const frage = a.frage
    a.frage = async (r) => {
      maximal = Math.max(maximal, ++gleichzeitig)
      await new Promise((res) => setTimeout(res, 20))
      const x = await frage(r)
      gleichzeitig--
      return x
    }
    const s = schicht([a])
    const titel = (await Promise.all([s.frage(auftrag), s.frage(auftrag), s.frage(auftrag)])).map((e) => e.daten.ideen[0]!.titel)
    expect(maximal).toBe(1)
    expect(titel).toEqual(['eins', 'zwei', 'drei'])
  })

  it('Limit: weicht aus; sind alle am Limit, wartet die Aufgabe bis zum frühesten Reset', async () => {
    const reset = new Date(Date.now() + 30 * 60_000)
    const voll = anbieter('voll', [new KiLimitFehler('voll', reset, 'Limit erreicht')])
    const frei = anbieter('frei', ['{"ideen":[{"titel":"frei"}]}'])
    expect((await schicht([voll, frei]).frage(auftrag)).anbieter).toBe('frei')

    const ctx = {
      yield: async () => undefined,
      signal: new AbortController().signal,
      waitUntil: (d: Date) => {
        throw new LimitWait(d)
      }
    } as unknown as JobContext<unknown>
    const nurVoll = anbieter('voll', [new KiLimitFehler('voll', reset, 'Limit erreicht')])
    const fehler = await schicht([nurVoll]).frage(auftrag, ctx).catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(LimitWait)
    expect((fehler as LimitWait).resumeAt.getTime()).toBe(reset.getTime() + 60_000)
  })

  it('fragt vor kostenpflichtigen Aufrufen und bucht nur freigegebene', async () => {
    const gebucht: number[] = []
    const teuer = () => {
      const a = anbieter('api', ['{"ideen":[{"titel":"bezahlt"}]}'], { preis: async () => ({ eingabe: 4, ausgabe: 20 }) })
      a.art = 'api'
      return a
    }
    await expect(schicht([teuer()], { freigabe: async () => false }).frage(auftrag)).rejects.toBeInstanceOf(KostenAbgelehnt)
    let gefragt: number | null = null
    await schicht([teuer()], {
      freigabe: async (i) => {
        gefragt = i.usd
        return true
      },
      buchen: async (usd) => void gebucht.push(usd)
    }).frage(auftrag)
    // Schätzung vorher (Eingabe + halbe Ausgabe), gebucht wird die echte Nutzung (10 Tokens rein, 5 raus)
    expect(gefragt).toBeGreaterThan(0)
    expect(gebucht).toEqual([0.0001])
  })
})

describe('Zustimmung vor dem ersten Senden (ROADMAP 3.8)', () => {
  it('ohne Zustimmung wird nichts gesendet, mit Zustimmung schon', async () => {
    const a = anbieter('extern', ['{"ideen":[{"titel":"gesendet"}]}'])
    const nein = mitZustimmung(a, async () => false)
    await expect(schicht([nein]).frage(auftrag)).rejects.toThrow(/keine Zustimmung|no consent/)
    expect(a.anfragen).toHaveLength(0)
    const ja = mitZustimmung(a, async () => true)
    expect((await schicht([ja]).frage(auftrag)).daten.ideen[0]!.titel).toBe('gesendet')
  })

  it('reicht die aktuellen Fähigkeiten durch', () => {
    const a = anbieter('lokal', [])
    const h = mitZustimmung(a, async () => true)
    a.faehigkeiten = { ...a.faehigkeiten, bilderSehen: true }
    expect(h.faehigkeiten.bilderSehen).toBe(true)
  })
})
