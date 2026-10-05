import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLATTFORM_VORGABEN } from '../../src/shared/schnitt'
import { plattformPruefung, textPrompt } from '../../src/main/schnitt/export'
import { filterGraph, renderArgs, verfolgungsAusdruck } from '../../src/main/schnitt/render'
import { laenge, regelSchnitt, rohschnittPrompt, schnittliste } from '../../src/main/schnitt/rohschnitt'
import { findeVersatz, huellkurve, normiere, RATE } from '../../src/main/schnitt/spuren'
import { stilFuer, stilText } from '../../src/main/schnitt/stil'
import { liesAbschnitte } from '../../src/main/schnitt/transkript'

const abschnitte = liesAbschnitte(readFileSync('tests/fixtures/sprache-transkript.jsonl', 'utf8'))
const DAUER = 53.52

describe('Schnitt: Stil je Richtung (ROADMAP 5.3)', () => {
  it('ordnet Vorschläge und freie Richtungen einem Stil zu', () => {
    expect(stilFuer(['gaming']).name).toBe('schnell')
    expect(stilFuer(['Comedy-Sketche']).name).toBe('schnell')
    expect(stilFuer(['kochen']).name).toBe('ruhig')
    expect(stilFuer(['Holzarbeiten & DIY']).name).toBe('ruhig')
    expect(stilFuer(['tech']).name).toBe('normal')
    expect(stilFuer(['etwas ganz Eigenes']).name).toBe('normal')
    expect(stilFuer([]).name).toBe('normal')
  })

  it('schneidet dasselbe Video je nach Richtung verschieden', () => {
    const schnell = schnittliste(DAUER, regelSchnitt(abschnitte, DAUER, null, stilFuer(['gaming'])))
    const ruhig = schnittliste(DAUER, regelSchnitt(abschnitte, DAUER, null, stilFuer(['kochen'])))
    expect(laenge(schnell.behalten)).toBeLessThan(laenge(ruhig.behalten))
    expect(JSON.stringify(schnell.entfernt)).not.toBe(JSON.stringify(ruhig.entfernt))
    // beide schneiden nie mitten in ein Wort (außer Füllwort und abgebrochenem Satz)
    const woerter = abschnitte.flatMap((a) => a.woerter)
    for (const liste of [schnell, ruhig])
      for (const x of liste.entfernt.filter((e) => e.grund === 'pause')) for (const w of woerter) expect(x.ende <= w.start || x.start >= w.ende).toBe(true)
  })

  it('schneidet Hochformat enger und mit kürzeren Untertiteln', () => {
    const quer = stilFuer(['vlog'], '16:9')
    const hoch = stilFuer(['vlog'], '9:16')
    expect(hoch.maxPause).toBeLessThan(quer.maxPause)
    expect(hoch.untertitelWoerter).toBeLessThanOrEqual(4)
    expect(hoch.zoomAbstand).toBeLessThan(quer.zoomAbstand)
  })

  it('gibt der KI Stil, Plattform und Sprache mit', () => {
    const s = stilFuer(['bildung'])
    const p = rohschnittPrompt(abschnitte.slice(0, 2), { kanal: 'Testkanal', plattform: 'YouTube', sprache: 'English', stil: stilText(s, ['bildung']) })
    expect(p).toContain('YouTube, Sprache English')
    expect(p).toContain(stilText(s, ['bildung']))
    expect(stilText(stilFuer(['gaming']), ['gaming'])).not.toBe(stilText(s, ['bildung']))
  })

  it('Regeln aus der Recherche: Reaction mit 0,5 s Pausen, Gaming-Regeln, Hochformat eigene Regeln (aus MoinStudio v0.49.0)', () => {
    const r = stilFuer(['Reactions'])
    expect(r.name).toBe('reaction')
    expect(r.maxPause).toBe(0.5)
    expect(stilFuer(['gaming']).maxPause).toBe(0.6)
    expect(stilText(r, ['Reactions'])).toMatch(/15–30 s Original/)
    expect(stilText(stilFuer(['minecraft']), ['minecraft'])).toMatch(/Zoom-Punch/)
    expect(stilText(stilFuer(['kochen']), ['kochen'])).toMatch(/Hook 0–15 s/)
    expect(stilText(stilFuer(['kochen']), ['kochen'])).not.toMatch(/Zoom-Punch|Original/)
    expect(stilText(stilFuer(['vlog'], '9:16'), ['vlog'], '9:16')).toMatch(/erste Sekunde/)
    expect(stilText(r, ['Reactions'], '16:9', false)).not.toMatch(/Hook/)
  })
})

describe('Schnitt: Hochformat folgt dem Motiv (ROADMAP 5.5)', () => {
  it('baut einen stückweise linearen Ausdruck in Schnittzeit und lässt entfernte Stellen weg', () => {
    const behalten = [
      { start: 0, ende: 10 },
      { start: 20, ende: 30 }
    ]
    const x = verfolgungsAusdruck(
      [
        { t: 0, x: 0.2 },
        { t: 5, x: 0.8 },
        { t: 15, x: 0.1 },
        { t: 25, x: 0.5 }
      ],
      behalten
    )
    expect(x).toContain('0.200*lt(t\\,0.000)')
    expect(x).toContain('(0.800+-0.300*(t-5.000)/10.000)') // 5 s → 15 s Schnittzeit (25 s Original), 15 s fällt weg
    expect(x).not.toContain('0.100')
    // ausgewertet: Mitte bei t=10 Schnittzeit zwischen 0.8 und 0.5
    const wert = (t: number): number => Function('t', 'lt', 'gte', `return ${x.replace(/\\,/g, ',')}`)(t, (a: number, b: number) => (a < b ? 1 : 0), (a: number, b: number) => (a >= b ? 1 : 0)) as number
    expect(wert(2.5)).toBeCloseTo(0.5, 2)
    expect(wert(10)).toBeCloseTo(0.65, 2)
    expect(wert(18)).toBeCloseTo(0.5, 2)
    expect(verfolgungsAusdruck([], behalten)).toBe('0.5')
  })

  it('dünnt lange Verfolgungen aus, damit der Ausdruck kurz bleibt', () => {
    const punkte = Array.from({ length: 2000 }, (_, i) => ({ t: i * 0.5, x: 0.5 + 0.4 * Math.sin(i / 30) }))
    const x = verfolgungsAusdruck(punkte, [{ start: 0, ende: 1000 }], 150)
    expect(x.split('gte(').length - 1).toBeLessThanOrEqual(150)
  })

  it('setzt den Ausschnitt ins Hochformat-Bild, ohne Zooms', () => {
    const liste = { version: 1 as const, dauer: 30, behalten: [{ start: 0, ende: 10 }], entfernt: [] }
    const g = filterGraph({ quelle: 'a.mp4', liste, zooms: [{ start: 1, ende: 2 }], untertitel: null, breite: 1080, hoehe: 1920, fps: 30, audio: true, encoder: [], ausgabe: 'o.mp4', hoch: { cam: null, verfolgung: [{ t: 0, x: 0.3 }, { t: 9, x: 0.7 }] } })
    expect(g).toContain("crop=1080:1920:x='clip((0.300*lt(t\\,0.000)+")
    expect(g).not.toContain('eval=frame')
  })
})

describe('Schnitt: mehrere Spuren (ROADMAP 5.6)', () => {
  // Ton mit Silben: zufällige Lautstärke-Blöcke, reproduzierbar
  const kurve = (sek: number, saat: number): Float32Array => {
    let s = saat
    const zufall = (): number => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const x = new Float32Array(sek * RATE)
    let wert = 0
    for (let i = 0; i < x.length; i++) {
      if (i % 17 === 0) wert = zufall() < 0.35 ? 0.02 : zufall()
      x[i] = wert
    }
    return x
  }

  it('findet den Versatz einer später gestarteten Spur', () => {
    const haupt = kurve(90, 7)
    const spur = haupt.slice(12.5 * RATE) // Spur beginnt 12,5 s nach der Hauptspur
    const r = findeVersatz(normiere(haupt), normiere(spur))
    expect(r.versatz).toBeCloseTo(12.5, 1)
    expect(r.sicherheit).toBeGreaterThan(0.8)
  })

  it('findet den Versatz einer früher gestarteten Spur, auch mit Rauschen und anderer Lautstärke', () => {
    const haupt = kurve(90, 11)
    const vorlauf = kurve(8, 3)
    const spur = new Float32Array(vorlauf.length + haupt.length)
    spur.set(vorlauf)
    spur.set(
      haupt.map((v, i) => v * 0.3 + 0.05 * Math.sin(i)),
      vorlauf.length
    )
    const r = findeVersatz(normiere(haupt), normiere(spur))
    expect(r.versatz).toBeCloseTo(-8, 1)
    expect(r.sicherheit).toBeGreaterThan(0.6)
  })

  it('meldet geringe Sicherheit, wenn die Spuren nichts gemeinsam haben', () => {
    const r = findeVersatz(normiere(kurve(60, 5)), normiere(kurve(60, 99)))
    expect(r.sicherheit).toBeLessThan(0.4)
  })

  it('rechnet aus Samples eine Hüllkurve mit 100 Werten je Sekunde', () => {
    const samples = new Int16Array(8000 * 2)
    for (let i = 8000; i < samples.length; i++) samples[i] = i % 2 ? 16000 : -16000
    const h = huellkurve(samples)
    expect(h.length).toBe(200)
    expect(h[50]).toBe(0)
    expect(h[150]).toBeCloseTo(16000 / 32768, 3)
  })

  it('legt Facecam-Datei und getrennten Ton mit Versatz in den Render', () => {
    const liste = { version: 1 as const, dauer: 30, behalten: [{ start: 0, ende: 10 }], entfernt: [] }
    const o = { quelle: 'a.mp4', liste, zooms: [], untertitel: null, breite: 1920, hoehe: 1080, fps: 30, audio: true, encoder: [], ausgabe: 'o.mp4', spuren: { facecam: { datei: 'cam.mp4', versatz: 2 }, ton: { datei: 'ton.wav', versatz: -1.5 } } }
    const g = filterGraph(o)
    expect(g).toContain('[1:v]select=')
    expect(g).toContain('overlay=x=W-w-W*0.03')
    expect(g).toContain("[2:a]aselect='")
    const a = renderArgs(o, 'f.txt')
    expect(a.slice(0, 8)).toEqual(['-i', 'a.mp4', '-itsoffset', '2.000', '-i', 'cam.mp4', '-ss', '1.500'])
    // Hochformat mit Facecam-Datei: oben Facecam, unten Bild
    const hoch = filterGraph({ ...o, breite: 1080, hoehe: 1920, hoch: { cam: null } })
    expect(hoch).toContain('[fc]scale=1080:640')
    expect(hoch).toContain('vstack')
  })
})

describe('Schnitt: Export je Plattform (ROADMAP 5.7)', () => {
  const kapitel = [
    { zeit: 0, titel: 'Start' },
    { zeit: 30, titel: 'Mitte' },
    { zeit: 70, titel: 'Ende' }
  ]
  it('prüft Länge, Format, Titel, Text und Kapitel nach den Vorgaben der Plattform', () => {
    const yt = plattformPruefung(PLATTFORM_VORGABEN.youtube, { laenge: 100, breite: 1920, hoehe: 1080, titel: ['Guter Titel'], beschreibung: 'Text', kapitel })
    expect(yt.every((x) => x.ok)).toBe(true)
    const tiktok = plattformPruefung(PLATTFORM_VORGABEN.tiktok, { laenge: 700, breite: 1920, hoehe: 1080, titel: [], beschreibung: 'x'.repeat(5000), kapitel: [] })
    expect(tiktok.filter((x) => !x.ok).length).toBe(3) // zu lang, falsches Format, Text zu lang
    expect(tiktok.some((x) => x.punkt.includes('Titel'))).toBe(false) // TikTok hat keinen eigenen Titel
    const kurz = plattformPruefung(PLATTFORM_VORGABEN['youtube-shorts'], { laenge: 60, breite: 1080, hoehe: 1920, titel: ['x'.repeat(120)], beschreibung: '', kapitel: [] })
    expect(kurz.filter((x) => !x.ok).map((x) => x.punkt)).toEqual(['Titel höchstens 100 Zeichen'])
    const podcast = plattformPruefung(PLATTFORM_VORGABEN.podcast, { laenge: 3600, breite: 0, hoehe: 0, titel: ['Folge 1'], beschreibung: 'Text', kapitel })
    expect(podcast.some((x) => x.punkt.startsWith('Format'))).toBe(false)
  })

  it('verlangt Texte passend zur Plattform', () => {
    const basis = { kanal: 'Testkanal', sprache: 'English', laenge: 300, zeilen: ['0 Hello'], stil: '' }
    const x = textPrompt({ ...basis, plattform: 'X', vorgabe: PLATTFORM_VORGABEN.x })
    expect(x).toContain('höchstens 280 Zeichen')
    expect(x).toContain('kapitel: leere Liste')
    const yt = textPrompt({ ...basis, plattform: 'YouTube', vorgabe: PLATTFORM_VORGABEN.youtube })
    expect(yt).toContain('3 Vorschläge')
    expect(yt).toContain('erstes bei 0')
    expect(yt).toContain('Sprache English')
  })

  it('hat für jede Plattform des Profils eine Vorgabe', async () => {
    const { PLATTFORMEN } = await import('../../src/shared/profil')
    for (const p of PLATTFORMEN) expect(PLATTFORM_VORGABEN[p]).toBeDefined()
  })
})

describe('Schnitt: Neuansatz auf Wortebene (ROADMAP 5.2)', () => {
  // Wörter mit gleichmäßigen Zeiten, ein Abschnitt oder zwei
  const woerter = (text: string, ab = 0): SchnittWort[] => text.split(' ').map((wort, i) => ({ start: ab + i * 0.35, ende: ab + i * 0.35 + 0.3, wort, p: 0.9 }))
  type SchnittWort = { start: number; ende: number; wort: string; p: number }
  const abschnitt = (text: string, ab = 0): { start: number; ende: number; text: string; woerter: SchnittWort[] } => {
    const w = woerter(text, ab)
    return { start: w[0]!.start, ende: w[w.length - 1]!.ende, text, woerter: w }
  }

  it('findet einen Neuansatz mitten in einem Abschnitt', () => {
    const a = [abschnitt('First we put the flour in the, first we put the flour and the salt into a bowl.')]
    const w = regelSchnitt(a, 10).filter((x) => x.grund === 'wiederholung')
    expect(w.map((x) => x.text)).toEqual(['First we put the flour in the,'])
    expect(w[0]!.ende).toBeCloseTo(7 * 0.35 - 0.03, 2)
  })

  it('findet einen Neuansatz mit Korrektur über zwei Abschnitte', () => {
    const a = [abschnitt('Zuerst kommt die Jacke in die.'), abschnitt('Zuerst kommt die Regenjacke ganz nach oben.', 2.5)]
    expect(regelSchnitt(a, 6).filter((x) => x.grund === 'wiederholung').map((x) => x.text)).toEqual(['Zuerst kommt die Jacke in die.'])
  })

  it('lässt gleich beginnende Sätze mit eigenem Inhalt stehen', () => {
    const a = [abschnitt('Ich zeige euch heute die große alte Burg am Fluss.'), abschnitt('Ich zeige euch heute auch den Garten.', 4)]
    expect(regelSchnitt(a, 8).filter((x) => x.grund === 'wiederholung')).toEqual([])
  })
})
