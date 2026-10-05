import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aufbauAehnlichkeit, farbAbstand, uebertrageFarben } from '../../src/main/bild/analyse'
import { kodierePng, liesBild, type RohBild } from '../../src/main/bild/rohbild'
import { setzeLogo } from '../../src/main/bild/komposit'
import { engineFuer, schriftPfad } from '../../src/main/thumbnail/auftrag'
import { ausschnitt, berichtImAusschnitt, fokus, imFormat } from '../../src/main/thumbnail/export'
import { kontextTexte, stilKontext, type AuftragsVorbildDaten } from '../../src/main/thumbnail/kontext'
import { findeInstallation, McFehlt, sichereMcAssets } from '../../src/main/thumbnail/minecraft/assets'
import { wendeVorbilderAn } from '../../src/main/thumbnail/nachbearbeitung'
import { allgemeinOhneKi, pruefeAllgemein, type AllgemeinPlan } from '../../src/main/thumbnail/planung/allgemein'
import { ernsteWarnungen, pruefePlan, pruefeSzene, type McPlan, type Szene } from '../../src/main/thumbnail/planung/minecraft'
import { streifenSzene } from '../../src/main/thumbnail/job'
import { autoKorrektur, technischePruefung } from '../../src/main/thumbnail/pruefung'
import { gefuehlAus, naechstePose, seiteFuer } from '../../src/main/thumbnail/reaktion'
import { szenenAus, waehleMomente, zeit } from '../../src/main/thumbnail/video'
import { groesserBeiLuecke, kopfAnteil, titelArgumente } from '../../src/main/thumbnail/vorlage'
import type { Katalog } from '../../src/main/thumbnail/minecraft/katalog'
import type { Bericht } from '../../src/main/thumbnail/render'

/** Testbild: Verlauf in zwei Farben, dazu ein Block mit Kanten (Aufbau) */
function bild(a: [number, number, number], b: [number, number, number], block = 0.3, w = 320, h = 180): RohBild {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = x / w
      const inBlock = Math.abs(x / w - block) < 0.1 && Math.abs(y / h - 0.5) < 0.2
      const c = inBlock ? [240, 240, 240] : [0, 1, 2].map((k) => a[k]! * (1 - t) + b[k]! * t)
      data.set([c[0]!, c[1]!, c[2]!, 255], (y * w + x) * 4)
    }
  return { width: w, height: h, data }
}

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cs-thumb-'))
}

describe('Auftrags-Vorbild (ROADMAP 4.2)', () => {
  it('„nur die Farben“ ändert die Farben, nicht den Aufbau', async () => {
    const d = await tmp()
    const render = bild([30, 60, 200], [20, 30, 90], 0.3)
    const vorbild = bild([240, 120, 20], [200, 30, 30], 0.75)
    await writeFile(join(d, 'render.png'), kodierePng(render))
    await writeFile(join(d, 'vorbild.png'), kodierePng(vorbild))
    const a: AuftragsVorbildDaten = { datei: 'x', uebernehmen: ['farben'], hinweis: 'nur die Farben', pfad: join(d, 'vorbild.png'), beschreibung: 'orange', lokal: null, seite: null }
    expect(await wendeVorbilderAn(join(d, 'render.png'), [a], join(d, 'neu.png'))).toBe(true)
    const neu = await liesBild(join(d, 'neu.png'))
    // Farben deutlich näher am Vorbild …
    expect(farbAbstand(neu, vorbild)).toBeLessThan(farbAbstand(render, vorbild) * 0.5)
    // … Aufbau (Kanten) unverändert: Block bleibt links, nicht rechts wie im Vorbild
    expect(aufbauAehnlichkeit(neu, render)).toBeGreaterThan(0.9)
    expect(aufbauAehnlichkeit(neu, vorbild)).toBeLessThan(0.5)
    // Ohne „Farben“ oder „Licht“ bleibt das Bild, wie es ist
    expect(await wendeVorbilderAn(join(d, 'render.png'), [{ ...a, uebernehmen: ['aufbau'] }], join(d, 'x.png'))).toBe(false)
  })

  it('der Planungs-Text nennt nur das Gewünschte und verbietet Logos, Texte, Figuren', () => {
    const a: AuftragsVorbildDaten = { datei: 'x', uebernehmen: ['farben'], hinweis: 'nur die knalligen Farben', pfad: 'x', beschreibung: 'Bild mit Orange und Rot', lokal: null, seite: null }
    const t = kontextTexte(stilKontext({ vorbilder: [], stilbuch: null, beispiel: null, auftrag: [a], farben: [] })).auftragsvorbilder
    expect(t).toMatch(/Vorrang/)
    expect(t).toMatch(/NUR die Farben/)
    expect(t).not.toMatch(/Bildaufbau/)
    expect(t).toMatch(/Nie Logos, Texte, Figuren oder Bildteile/)
    expect(t).toMatch(/knalligen Farben/)
  })

  it('Farbübertragung lässt Alpha und Größe unverändert', () => {
    const r = uebertrageFarben(bild([0, 0, 255], [0, 0, 128]), bild([255, 0, 0], [128, 0, 0]))
    expect(r.width).toBe(320)
    expect(r.data[3]).toBe(255)
  })
})

describe('Selbstprüfung (ROADMAP 4.8)', () => {
  const figur = { figuren: { ich: { box: [0.05, 0.2, 0.45, 1] as [number, number, number, number], kopf_box: [0.15, 0.25, 0.35, 0.55] as [number, number, number, number] } } }

  it('erkennt absichtlich fehlerhafte Bilder', async () => {
    const d = await tmp()
    const leer = { width: 200, height: 112, data: new Uint8Array(200 * 112 * 4).fill(128) }
    const weiss = { width: 200, height: 112, data: new Uint8Array(200 * 112 * 4).fill(255) }
    const gut = bild([30, 60, 200], [220, 60, 30])
    await writeFile(join(d, 'leer.png'), kodierePng(leer))
    await writeFile(join(d, 'weiss.png'), kodierePng(weiss))
    await writeFile(join(d, 'gut.png'), kodierePng(gut))
    const p = (datei: string, textBoxen: [number, number, number, number][] = [], b: Bericht = figur) => technischePruefung(join(d, datei), b, { textBoxen, logoBox: null, engineWarnungen: [] })
    expect((await p('leer.png')).map((x) => x.art)).toContain('technik')
    expect((await p('weiss.png')).some((x) => /überstrahlt/.test(x.text))).toBe(true)
    expect(await p('gut.png')).toEqual([])
    // Text über dem Gesicht
    const text = await p('gut.png', [[0.2, 0.3, 0.6, 0.45]])
    expect(text.some((x) => x.art === 'text' && x.ernst)).toBe(true)
    // Gesicht angeschnitten und zu klein
    const ange = await p('gut.png', [], { figuren: { ich: { kopf_box: [-0.1, 0.2, 0.1, 0.5] } } })
    expect(ange.some((x) => /angeschnitten/.test(x.text))).toBe(true)
    const klein = await p('gut.png', [], { figuren: { ich: { kopf_box: [0.2, 0.2, 0.23, 0.24] } } })
    expect(klein.some((x) => /klein/.test(x.text))).toBe(true)
  })

  it('korrigiert ohne KI: Größe, Text, Belichtung', () => {
    const plan = allgemeinOhneKi({ engine: 'foto', figurIds: ['ich'], vorbild: 'frei', farben: ['#101010', '#202020'], hintergrund: false })
    const v = { ...plan.varianten[0]!, text: [{ text: 'VIEL ZU LANGER TEXT' }] }
    const k1 = autoKorrektur(v, [{ art: 'gesicht', text: 'Gesicht von ich ist angeschnitten', ernst: true }])!
    expect(k1.personen[0]!.kopf_anteil).toBeLessThan(v.personen[0]!.kopf_anteil)
    const k2 = autoKorrektur(v, [{ art: 'text', text: 'Text liegt über dem Gesicht von ich', ernst: true }])!
    expect(k2.text![0]!.text.split(' ')).toHaveLength(3)
    const k3 = autoKorrektur(v, [{ art: 'technik', text: 'Bild zu dunkel', ernst: true }])!
    expect(k3.hintergrund.farben[0]).not.toBe('#101010')
    expect(autoKorrektur(v, [{ art: 'sonstiges', text: 'egal', ernst: false }])).toBeNull()
  })

  it('Minecraft: nur ernste Engine-Warnungen lösen eine Korrektur aus', () => {
    expect(ernsteWarnungen(['Kamera trifft das Thema mit Abweichung 0.2', 'Kamera trifft das Thema mit Abweichung 0.8', 'Gesicht von ich verdeckt', 'Hinweis'])).toEqual(['Kamera trifft das Thema mit Abweichung 0.8', 'Gesicht von ich verdeckt'])
  })
})

describe('Planung prüfen (ROADMAP 4.6)', () => {
  const k: Katalog = { posen: [{ name: 'zeigen', hinweis: '' }, { name: 'neutral', hinweis: '' }], mimiken: ['neutral', 'froh'], kameraModi: ['nah', 'mob'], himmel: ['tag'], welten: [{ name: 'wiese', hinweis: '' }], mobs: ['zombie'], bloecke: ['stone'] }

  it('Minecraft-Szene: repariert Kleinigkeiten, meldet Unbekanntes', () => {
    const s = { welt: { art: 'wiese' }, himmel: 'regenbogen', figuren: [{ id: 'ich', pose: 'zeigen', mimik: 'irre', item: { name: 'diamond_sword', hand: 'x' } }], kamera: { modus: 'quatsch' } } as Szene
    expect(pruefeSzene(s, k, ['ich'])).toEqual([])
    expect(s.himmel).toBe('tag')
    expect(s.figuren[0]!['mimik']).toBe('neutral')
    expect(s.figuren[0]!.item!.hand).toBe('l')
    expect(s.kamera.modus).toBe('nah')
    const f = pruefeSzene({ welt: { art: 'mond' }, figuren: [{ id: 'fremd', pose: 'fliegen' }], mobs: [{ art: 'drache' }], kamera: { thema: 'mob:3' } } as Szene, k, ['ich'])
    expect(f.join('|')).toMatch(/Welt.*mond.*Figur.*fremd.*Pose.*fliegen.*erste Figur.*Mob.*drache.*Kamera-Thema/)
  })

  it('Minecraft: Teilbild eines geteilten Bilds darf mit einem Freund beginnen (aus MoinStudio v0.40.0)', () => {
    const nurFreund = { welt: { art: 'wiese' }, figuren: [{ id: 'freund', pose: 'zeigen' }], mobs: [{ art: 'zombie' }], kamera: { thema: 'mob:0' } } as Szene
    expect(pruefeSzene(structuredClone(nurFreund), k, ['ich', 'freund']).join()).toMatch(/erste Figur/)
    expect(pruefeSzene(structuredClone(nurFreund), k, ['ich', 'freund'], true)).toEqual([])
    expect(pruefeSzene({ ...structuredClone(nurFreund), figuren: [{ id: 'fremd', pose: 'zeigen' }] }, k, ['ich', 'freund'], true).join()).toMatch(/erste Figur/)
  })

  it('Minecraft: nur bekannte Grafik-Elemente (höchstens drei), geteiltes Bild mit 2–3 Teilen (aus MoinStudio v0.39.0)', () => {
    const szene = (id = 'ich'): Szene => ({ welt: { art: 'wiese' }, figuren: [{ id, pose: 'zeigen' }], kamera: { modus: 'nah' } })
    const plan: McPlan = {
      varianten: [
        { titel: 'a', vorbild: 'v1', warum: '', szene: szene(), grafik: [{ art: 'level', zahl: 19 }, { art: 'feuerwerk' }, { art: 'hud', items: ['torch'] }, { art: 'lupe', ziel: 'ich' }, { art: 'abzeichen', typ: 'haken' }] },
        { titel: 'b', vorbild: 'v1', warum: '', szene: szene(), split: { teile: [{ szene: szene(), etikett: '10€ und mehr Text' }, { szene: szene('freund'), etikett: '1000€' }] } },
        { titel: 'c', vorbild: 'v1', warum: '', szene: szene(), split: { teile: [{ szene: szene() }] } }
      ]
    }
    expect(pruefePlan(plan, k, ['ich', 'freund'], [{ id: 'v1', kanal: '', titel: '', zeigt: '', rezept: '', link: null }])).toEqual([])
    expect(plan.varianten[0]!.grafik!.map((g) => g.art)).toEqual(['level', 'hud', 'lupe'])
    expect(plan.varianten[1]!.split!.teile.map((t) => t.etikett)).toEqual(['10€ und mehr', '1000€'])
    expect(plan.varianten[2]!.split).toBeUndefined()
  })

  it('Minecraft: Teilbilder werden im Format ihres Streifens gerendert, Bauwerke mit ganzer Figur', () => {
    const s = streifenSzene({ welt: { art: 'wiese' }, figuren: [{ id: 'ich', pose: 'zeigen' }], kamera: { modus: 'nah', thema: [4, 4, 1] }, render: { hoehe: 720 } }, 3)
    expect(s['render']).toEqual({ hoehe: 720, breite: Math.round(1280 / 3 + 720 * 0.16) })
    expect(s.kamera.modus).toBe('ganz')
    expect(streifenSzene({ welt: { art: 'wiese' }, figuren: [{ id: 'ich', pose: 'zeigen' }], kamera: { modus: 'nah', thema: 'mob:0' } }, 2).kamera.modus).toBe('nah')
  })

  it('Foto-Plan: Vorbild, Hintergrund, Personen und Seiten werden geprüft', () => {
    const plan: AllgemeinPlan = {
      varianten: [
        { titel: 'a', vorbild: 'erfunden', warum: '', hintergrund: { art: 'bild', farben: ['#000000'] }, personen: [{ id: 'ich', ausdruck: 'froh', seite: 'links', kopf_anteil: 0.3 }, { id: 'freund', ausdruck: 'froh', seite: 'links', kopf_anteil: 0.3 }], text: [{ text: 'eins zwei drei vier fünf' }] },
        { titel: 'b', vorbild: 'v1', warum: '', hintergrund: { art: 'verlauf', farben: ['#000000'] }, personen: [{ id: 'freund', ausdruck: 'froh', seite: 'rechts', kopf_anteil: 0.3 }] }
      ]
    }
    const fehler = pruefeAllgemein(plan, { engine: 'foto', figurIds: ['ich', 'freund'], vorbilder: [{ id: 'v1', kanal: '', titel: '', zeigt: '', rezept: '', link: null }], hintergrund: false })
    expect(plan.varianten[0]!.vorbild).toBe('v1')
    expect(plan.varianten[0]!.hintergrund.art).toBe('verlauf')
    expect(plan.varianten[0]!.personen[1]!.seite).toBe('rechts')
    expect(plan.varianten[0]!.text![0]!.text).toBe('eins zwei drei vier')
    expect(fehler).toEqual(['Variante 2: Die erste Person muss „ich“ sein'])
  })

  it('Engine aus der Darstellung', () => {
    expect(engineFuer([{ art: 'spielavatar', spiel: 'minecraft', skin: null, accountName: 'x', slim: null, bilder: [], modell: null }])).toBe('minecraft')
    expect(engineFuer([{ art: 'spielavatar', spiel: 'Roblox', skin: null, accountName: null, slim: null, bilder: [], modell: 'a.glb' }])).toBe('modell3d')
    expect(engineFuer([{ art: 'foto', fotos: ['a.png'] }])).toBe('foto')
    expect(engineFuer([{ art: 'keine' }])).toBe('grafik')
    expect(engineFuer([])).toBe('grafik')
  })

  it('Schrift der Marke: eigene Datei oder installierte Schrift', async () => {
    const d = await tmp()
    await writeFile(join(d, 'meine.ttf'), 'x')
    await writeFile(join(d, 'impact.ttf'), 'x')
    expect(schriftPfad(null, join(d, 'meine.ttf'), d)).toBe(join(d, 'meine.ttf'))
    expect(schriftPfad('Impact', null, d)).toBe(join(d, 'impact.ttf'))
    expect(schriftPfad('Gibtsnicht', null, d)).toBeNull()
  })
})

describe('Export (ROADMAP 4.10)', () => {
  const bericht = { figuren: { ich: { kopf_box: [0.1, 0.2, 0.3, 0.5] as [number, number, number, number] } } }
  it('schneidet Hoch- und Quadratformat um die Gesichter zu', () => {
    expect(fokus(bericht)).toEqual([0.2, 0.35])
    const a = ausschnitt(1920, 1080, 9 / 16, fokus(bericht))
    expect(a.h).toBe(1080)
    expect(a.w).toBe(608)
    expect(a.x).toBe(80) // Gesicht bei 20 % der Breite: Ausschnitt so weit links wie nötig
    const b = berichtImAusschnitt(bericht, a, 1920, 1080)
    const k = b.figuren!['ich']!.kopf_box!
    expect(k[0]).toBeGreaterThan(0)
    expect(k[2]).toBeLessThan(1)
    const f = imFormat(bild([0, 0, 0], [255, 255, 255], 0.3, 320, 180), '1:1', bericht)
    expect([f.width, f.height]).toEqual([1080, 1080])
  })

  it('Logo in eine freie Ecke, nie über Wichtiges', () => {
    const b = bild([0, 0, 0], [0, 0, 0])
    const logo = { width: 40, height: 20, data: new Uint8Array(40 * 20 * 4).fill(255) }
    const r = setzeLogo(b, logo, [[0.6, 0.6, 1, 1]])
    expect(r.frei).toBe(true)
    expect(r.box[0]).toBeLessThan(0.5) // unten rechts belegt → unten links
    expect(r.box[1]).toBeGreaterThan(0.5)
  })
})

describe('Reaction, Vorlage, Video', () => {
  it('Gefühl aus freien Worten (Deutsch und Englisch), Seite gegenüber dem Wichtigen, Posen wechseln', () => {
    expect(gefuehlAus('bin total schockiert')).toBe('schockiert')
    expect(gefuehlAus('so funny lol')).toBe('lachend')
    expect(gefuehlAus('')).toBeNull()
    expect(seiteFuer('links', [0.8, 0.5])).toBe('links')
    expect(seiteFuer('links', [0.2, 0.5])).toBe('rechts')
    expect(seiteFuer('rechts', [0.5, 0.5])).toBe('rechts')
    expect(naechstePose(['a', 'b', 'c'], ['a'])).toBe('b')
  })

  it('Vorlage: Figur groß genug, Titel mit Farbe', () => {
    expect(kopfAnteil(0.2, { hoehe: 0.9 })).toBeGreaterThanOrEqual(0.225)
    expect(groesserBeiLuecke(0.3, 0.3)).toBeGreaterThan(0.3)
    expect(groesserBeiLuecke(0.3, 0.8)).toBe(0.3)
    expect(titelArgumente({ titel: [{ box: [0.1, 0.1, 0.5, 0.2], farbe: '#ffffff' }, { box: [0, 0, 1, 1], farbe: '#000000' }] })).toEqual(['farbe=#ffffff:0.1,0.1,0.5,0.2'])
  })

  it('Video: Momente gleichmäßig verteilt, stärkster Wechsel je Abschnitt', () => {
    const text = 'frame:0 pts:25 pts_time:12.5\nlavfi.scene_score=0.4\nframe:1 pts:28 pts_time:14\nlavfi.scene_score=0.9\nframe:2 pts:30 pts_time:15\nlavfi.scene_score=0.02\nframe:3 pts:190 pts_time:95\nlavfi.scene_score=0.5'
    const s = szenenAus(text)
    expect(s).toEqual([{ zeit: 12.5, staerke: 0.4 }, { zeit: 14, staerke: 0.9 }, { zeit: 15, staerke: 0.02 }, { zeit: 95, staerke: 0.5 }])
    const m = waehleMomente(s, 100, 4)
    expect(m).toHaveLength(4)
    expect(m[0]).toEqual({ zeit: 14.6, grund: 'szene' })
    expect(m[1]!.grund).toBe('gleichmaessig')
    expect(zeit(3725)).toBe('1:02:05')
  })
})

describe('Minecraft-Spieldatei (ROADMAP 4.3)', () => {
  it('findet die zuletzt gespielte Java-Version, überspringt Mod-Profile', async () => {
    const d = await tmp()
    for (const [v, groesse] of [['1.21.4', 20_000_000], ['fabric-1.21', 1000], ['26.3', 21_000_000]] as const) {
      await mkdir(join(d, v), { recursive: true })
      await writeFile(join(d, v, `${v}.jar`), Buffer.alloc(groesse))
    }
    expect((await findeInstallation([d]))?.version).toBe('26.3')
    expect(await findeInstallation([join(d, 'fehlt')])).toBeNull()
  })

  it('ohne Installation, ohne Zustimmung und ohne Zwischenspeicher: klare Meldung statt Download', async () => {
    const d = await tmp()
    let geladen = false
    await expect(
      sichereMcAssets(join(d, 'mc'), {
        mojangErlaubt: false,
        appdata: join(d, 'appdata'),
        fetcher: (async () => {
          geladen = true
          return new Response('')
        }) as typeof fetch
      })
    ).rejects.toBeInstanceOf(McFehlt)
    expect(geladen).toBe(false)
  })
})

describe('Befunde der Render-Skripte in der Sprache der Oberfläche', () => {
  it('übersetzt bekannte Muster, lässt Unbekanntes stehen', async () => {
    const { uebersetzeWarnung } = await import('../../src/main/thumbnail/warnungen')
    expect(uebersetzeWarnung('Gesicht von ich verdeckt oder abgewandt (40 % sichtbar)', 'en')).toBe('Face of ich covered or turned away (40 % visible)')
    expect(uebersetzeWarnung('Text „TAG 100“ findet keinen freien Platz und überdeckt Wichtiges', 'en')).toBe('Text “TAG 100” finds no free space and covers something important')
    expect(uebersetzeWarnung('Gesicht von ich angeschnitten', 'de')).toBe('Gesicht von ich angeschnitten')
    expect(uebersetzeWarnung('etwas Neues', 'en')).toBe('etwas Neues')
  })
})

describe('Mob-Import: Körperlage', () => {
  it('aufrechte Wesen bleiben stehen, Vierbeiner mit hohem Körper liegen', async () => {
    const { vierbeinerKoerper } = await import('../../src/main/thumbnail/minecraft/mobimport')
    const box = (origin: [number, number, number], size: [number, number, number]) => ({ origin, size, uv: [0, 0] as [number, number], inflate: 0, mirror: false })
    const teil = (name: string, b: ReturnType<typeof box>) => ({ name, parent: null, pivot: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], boxes: [b] })
    const beine = ['a', 'b', 'c', 'd'].map((n) => teil(`${n}_leg`, box([0, 0, 0], [4, 6, 4])))
    const creeper = [teil('body', box([-4, 6, -2], [8, 12, 4])), teil('head', box([-4, 18, -4], [8, 8, 8])), ...beine]
    vierbeinerKoerper(creeper)
    expect(creeper[0]!.rotation).toEqual([0, 0, 0])
    const baer = [teil('body', box([-7, 14, 5], [14, 14, 11])), teil('head', box([-3.5, 10, -19], [7, 7, 7])), ...beine]
    vierbeinerKoerper(baer)
    expect(baer[0]!.rotation).toEqual([90, 0, 0])
  })
})

describe('Auswahl über alle Versuche (aus MoinStudio v0.46.1)', () => {
  it('gemessene Fehler wiegen dreifach, Anmerkungen der KI-Bildprüfung einfach', async () => {
    const { punkte } = await import('../../src/main/thumbnail/job')
    const gemessen = [{ ernst: true }, { ernst: false }]
    const ki = [{ ernst: true }, { ernst: true }]
    expect(punkte(gemessen, null)).toBe(3)
    expect(punkte([], ki)).toBe(2)
    expect(punkte(gemessen, ki)).toBe(5)
  })
})
