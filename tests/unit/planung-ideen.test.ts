import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KontoSchema, leeresProfil, type Konto, type Profil } from '../../src/shared/profil'
import { PLATTFORMEN } from '../../src/shared/profil'
import { pruefeTitel, TEXT_REGELN, titelFuer, hashtagsFuer } from '../../src/shared/planung'
import type { JobContext } from '../../src/main/jobs/queue'
import { aehnlichkeit, ideenPrompt, kontoBeschreibung, ohneWiederholung, planungKiJob, pruefeWoche, titelPrompt, wochenPrompt } from '../../src/main/planung/ideen'
import { neueKarte, type Karte } from '../../src/main/planung/karten'
import { fakeKi } from '../ki-fake'

const karte = (x: Partial<Karte>): Karte => ({
  id: 'k1',
  kontoId: 'k1',
  spalte: 'idee',
  ordnung: 1,
  titel: 'Titel',
  notizen: '',
  checkliste: [],
  termin: null,
  thumbnail: null,
  schnitt: null,
  texte: null,
  crossposting: [],
  erstellt: '',
  rev: 1,
  updatedAt: '',
  updatedBy: 'PC',
  felder: {},
  ...x
})

const konto = (x: Partial<Konto>): Konto => KontoSchema.parse({ id: 'k1', plattform: 'youtube', name: '@kochmitkim', sprache: 'de', richtungen: ['kochen'], ...x })

function ctx(): JobContext<unknown> {
  let cp: unknown
  return {
    id: 'test',
    get checkpoint() {
      return cp
    },
    save: async (c: unknown) => void (cp = c),
    progress: () => undefined,
    yield: async () => undefined,
    signal: new AbortController().signal,
    track: () => undefined,
    waitUntil: () => {
      throw new Error('Limit')
    }
  } as unknown as JobContext<unknown>
}

// Fünf Test-Konten verschiedener Richtungen und Plattformen (ROADMAP 6.3: 10 Ideen je Test-Konto)
const KONTEN: Konto[] = [
  konto({ id: 'kochen', plattform: 'youtube', name: '@kochmitkim', richtungen: ['kochen'] }),
  konto({ id: 'gaming', plattform: 'twitch', name: 'PixelPaul', richtungen: ['gaming', 'streams'], spiele: ['Minecraft', 'Fortnite'] }),
  konto({ id: 'fitness', plattform: 'tiktok', name: '@fitmitfrida', richtungen: ['fitness'], sprache: 'en' }),
  konto({ id: 'tech', plattform: 'youtube-shorts', name: 'TechTom', richtungen: ['tech'] }),
  konto({ id: 'beauty', plattform: 'instagram-reels', name: '@glowbylea', richtungen: ['beauty'] })
]

/** Antwort einer KI, die sich nicht an alles hält: zu lange Titel, Hashtags im Titel, doppelte Ideen */
function kiIdeen(k: Konto): { ideen: { titel: string; idee: string; warum: string }[] } {
  const thema = k.richtungen[0]
  return {
    ideen: [
      ...Array.from({ length: 11 }, (_, i) => ({
        // eigene Wörter je Idee; jede dritte viel zu lang, jede zweite mit Hashtags im Titel
        titel: `${i + 1}. ${['Test', 'Challenge', 'Vergleich', 'Anleitung', 'Geschichte', 'Reaktion', 'Mythos', 'Experiment', 'Tagebuch', 'Wettkampf', 'Rückblick'][i]} ${thema}${i % 3 === 0 ? ' ' + Array.from({ length: 16 }, (_, j) => `teil${i}x${j}`).join(' ') : ''}${i % 2 ? ' #viral #fyp #trend #neu' : ''}`,
        idee: 'Was passiert.',
        warum: 'Weil.'
      })),
      { titel: '1. Test ' + thema, idee: 'doppelt', warum: 'doppelt' }
    ]
  }
}

describe('Planung mit der KI (ROADMAP 6.3)', () => {
  it('erkennt Wiederholungen an gemeinsamen Wortstämmen, in jeder Sprache', () => {
    expect(aehnlichkeit('Ich überlebe 100 Tage im Nether', '100 TAGE im NETHER überleben?')).toBeGreaterThanOrEqual(0.75)
    expect(aehnlichkeit('Minecraft, aber jeder Block explodiert', 'Jeder Block explodiert in Minecraft!')).toBe(1)
    expect(aehnlichkeit('I cooked every pasta shape', 'Cooking every shape of pasta')).toBeGreaterThanOrEqual(0.75)
    expect(aehnlichkeit('Ich baue eine Falle für Freunde', 'Der Warden jagt mich')).toBe(0)
    const ideen = ohneWiederholung(
      [
        { titel: ' Ich überlebe 100 Tage im Nether ', idee: 'a', warum: 'b' },
        { titel: 'Minecraft, aber jeder Block explodiert', idee: 'a', warum: 'b' },
        { titel: 'Jeder Block explodiert in Minecraft!', idee: 'a', warum: 'b' },
        { titel: '', idee: 'a', warum: 'b' }
      ],
      ['100 Tage Nether überleben']
    )
    expect(ideen.map((i) => i.titel)).toEqual(['Minecraft, aber jeder Block explodiert'])
  })

  it('beschreibt das Konto aus dem Profil statt aus festen Kanälen', () => {
    const b = kontoBeschreibung(KONTEN[1]!)
    expect(b).toContain('PixelPaul')
    expect(b).toContain('Twitch')
    expect(b).toContain('Richtung: gaming, streams')
    expect(b).toContain('Spiele: Minecraft, Fortnite')
    const p = ideenPrompt({ konto: KONTEN[0]!, karten: [karte({ titel: 'Lasagne ohne Ofen', spalte: 'upload' })], andere: [karte({ titel: 'Creeper-Challenge' })], freunde: ['Mia'], eigeneTitel: ['Mein erstes Brot'], wunsch: 'Herbst', heute: '2026-10-01', anzahl: 12 })
    expect(p).toContain('Finde 12 neue Video-Ideen')
    expect(p).toContain('Oktober 2026')
    expect(p).toContain('Wunsch des Creators dazu: Herbst')
    expect(p).toContain('- [Upload] Lasagne ohne Ofen')
    expect(p).toContain('Personen nur aus dieser Liste nennen: Mia')
    expect(p).toContain('Geplant auf anderen Konten des Creators (nicht doppeln):\n- [Idee] Creeper-Challenge')
    expect(p).toContain('- Mein erstes Brot')
    expect(p).toContain('höchstens 60 Zeichen (Plattform-Grenze 100)')
    expect(ideenPrompt({ konto: KONTEN[2]!, karten: [], andere: [], freunde: [], eigeneTitel: [], heute: '2026-10-01', anzahl: 12 })).toContain('Sprache Englisch')
    expect(titelPrompt({ konto: KONTEN[0]!, karte: karte({ titel: 'Arbeitstitel', notizen: 'Kürbis' }), transkript: 'Hallo zusammen', andere: ['Anderes Video'] })).toContain('Anfang des Transkripts:\nHallo zusammen')
    const w = wochenPrompt({ konten: [KONTEN[0]!], karten: [karte({ id: 'abc', kontoId: 'kochen', titel: 'Suppe' })], frei: [{ kanal: 'kochen', tag: '2026-10-03', zeit: '17:00' }], heute: '2026-09-29' })
    expect(w).toContain('- @kochmitkim (kochen): Sa 03.10. 17:00 → Termin "2026-10-03T17:00"')
    expect(w).toContain('- abc: kochen, Idee, Suppe')
  })

  it('lässt im Wochenplan nur freie Termine des richtigen Kontos und jede Karte einmal zu', () => {
    const karten = [karte({ id: 'a' }), karte({ id: 'b' }), karte({ id: 'c', kontoId: 'k2' })]
    const frei = [
      { kanal: 'k1', tag: '2026-10-03', zeit: '17:00' },
      { kanal: 'k1', tag: '2026-10-07', zeit: '17:00' },
      { kanal: 'k2', tag: '2026-10-02', zeit: '18:00' }
    ]
    const w = pruefeWoche(
      {
        plan: [
          { karte: 'a', termin: '2026-10-03T17:00', grund: '' },
          { karte: 'a', termin: '2026-10-07T17:00', grund: 'doppelt' },
          { karte: 'b', termin: '2026-10-03T17:00', grund: 'Termin belegt' },
          { karte: 'c', termin: '2026-10-07T17:00', grund: 'falsches Konto' },
          { karte: 'x', termin: '2026-10-02T18:00', grund: 'unbekannt' },
          { karte: 'c', termin: '2026-10-02T18:00', grund: '' },
          { karte: 'b', termin: '2026-10-04T17:00', grund: 'kein freier Termin' }
        ],
        aufnehmen: [{ karte: 'b', grund: '' }, { karte: 'b', grund: '' }, { karte: 'x', grund: '' }],
        hinweis: 'ok'
      },
      karten,
      frei
    )
    expect(w.plan.map((p) => `${p.karte}@${p.termin}`)).toEqual(['a@2026-10-03T17:00', 'c@2026-10-02T18:00'])
    expect(w.aufnehmen.map((a) => a.karte)).toEqual(['b'])
  })

  for (const k of KONTEN) {
    it(`liefert 10 Ideen für ${k.name} (${k.plattform}), Titel halten die Plattform-Regeln ein`, async () => {
      const daten = await mkdtemp(join(tmpdir(), 'cs-ideen-'))
      await neueKarte(daten, { kontoId: k.id, titel: `11. Rückblick ${k.richtungen[0]}` }, 'PC')
      const profil: Profil = { ...leeresProfil(), konten: KONTEN, freunde: [{ id: 'f', name: 'Mia', darstellung: [] }] }
      const ki = fakeKi(() => kiIdeen(k))
      const e = await planungKiJob({ art: 'ideen', daten, kontoId: k.id, heute: '2026-09-29' }, ctx(), { ki: ki.schicht, profil: async () => profil })
      expect(e.art).toBe('ideen')
      if (e.art !== 'ideen') return
      expect(e.ideen).toHaveLength(10)
      for (const i of e.ideen) expect(pruefeTitel(i.titel, k.plattform)).toMatchObject({ ok: true })
      expect(e.ideen.some((i) => i.titel.startsWith('11.'))).toBe(false) // gibt es schon als Karte
      expect(ki.anfragen[0]!.prompt).toContain(k.name)
      expect(ki.anfragen[0]!.prompt).toContain('Mia')
    })
  }

  it('Titelvorschläge und Wochenplan laufen über die KI-Schicht', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-titel-'))
    const k = await neueKarte(daten, { kontoId: 'tech', titel: 'Handy-Test' }, 'PC')
    const profil: Profil = { ...leeresProfil(), konten: KONTEN.map((x) => (x.id === 'tech' ? { ...x, rhythmus: [{ tag: 3, zeit: '18:00' }] } : x)) }
    const ki = fakeKi((a) =>
      a.prompt.includes('Schlage 5 Titel')
        ? { titel: [{ titel: 'Das teuerste Handy der Welt im Härtetest – lohnt es sich wirklich für normale Leute? #tech #handy #test #neu', warum: 'Neugier' }, { titel: 'Handy im Test', warum: 'kurz' }] }
        : { plan: [{ karte: k.id, termin: '2026-09-30T18:00', grund: 'frei' }], aufnehmen: [], hinweis: '' }
    )
    const titel = await planungKiJob({ art: 'titel', daten, karte: k.id }, ctx(), { ki: ki.schicht, profil: async () => profil })
    if (titel.art !== 'titel') throw new Error('art')
    for (const x of titel.titel) expect(pruefeTitel(x.titel, 'youtube-shorts').ok).toBe(true)
    expect(titel.titel[0]!.titel).toMatch(/…( #tech #handy #test)?$|#tech #handy #test$/)
    const woche = await planungKiJob({ art: 'woche', daten, heute: '2026-09-29' }, ctx(), { ki: ki.schicht, profil: async () => profil })
    if (woche.art !== 'woche') throw new Error('art')
    expect(woche.woche.plan).toEqual([{ karte: k.id, termin: '2026-09-30T18:00', grund: 'frei' }])
  })
})

describe('Textregeln je Plattform (ROADMAP 6.3)', () => {
  it('hat Regeln für jede Plattform', () => {
    for (const p of PLATTFORMEN) expect(TEXT_REGELN[p]).toBeDefined()
  })

  it('kürzt an einer Wortgrenze und nimmt Hashtags aus Titeln, wo sie nicht hingehören', () => {
    const lang = 'Ich habe dreißig Tage lang jeden Morgen kalt geduscht und das ist mit meinem Körper passiert #challenge'
    const yt = titelFuer(lang, 'youtube')
    expect(yt).not.toContain('#')
    expect(pruefeTitel(yt, 'youtube').ok).toBe(true)
    expect(titelFuer('Kurz und gut #shorts #kochen #lecker #schnell', 'youtube-shorts')).toBe('Kurz und gut #shorts #kochen #lecker')
    expect(titelFuer('Stream heute #live', 'twitch')).toBe('Stream heute')
    const tiktok = titelFuer(lang, 'tiktok')
    expect([...tiktok].length).toBeLessThanOrEqual(TEXT_REGELN.tiktok.titelZiel)
    expect(tiktok.endsWith('…')).toBe(true)
  })

  it('bringt Hashtags im Text auf die erlaubte Zahl', () => {
    expect(hashtagsFuer('Neues Rezept! #kochen #herbst #kürbis #suppe #lecker #vegan #einfach', 'tiktok')).toBe('Neues Rezept!\n\n#kochen #herbst #kürbis #suppe #lecker')
    expect(hashtagsFuer('Folge 12 #podcast', 'podcast')).toBe('Folge 12')
    expect(hashtagsFuer('Hallo #a #A #b', 'x')).toBe('Hallo\n\n#a #b')
  })
})
