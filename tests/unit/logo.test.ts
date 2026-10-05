import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { leeresProfil, type Profil } from '../../src/shared/profil'
import { ThumbStartSchema } from '../../src/shared/thumbnail'
import { aendereLogo, ladeLogos, logoFuerAuftrag, neuesLogo } from '../../src/main/logo/bibliothek'
import { aufQuadrat, exportGroesse, freistellen, hatTransparenz, zuschneiden } from '../../src/main/logo/bild'
import { findeName, LEERER_VORRAT, LogoPlanZ, logosOhneKi, planPrompt, pruefeLogoSpec, type Vorrat } from '../../src/main/logo/job'
import { logoAusWunsch, logoBox, platzHinweise, waehleLogoPlatz, ZEITSTEMPEL } from '../../src/main/logo/platz'
import { setzeLogoIn, ueberlappung } from '../../src/main/bild/komposit'
import type { RohBild } from '../../src/main/bild/rohbild'
import type { ProfilStore } from '../../src/main/profil/store'

// Logo-Reiter, Logo-Bibliothek und Logo im Thumbnail (aus MoinStudio v0.38.0)

/** Einfarbiges Bild mit einem Quadrat in der Mitte */
function bild(w: number, h: number, grund: [number, number, number, number], innen: [number, number, number, number]): RohBild {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(Math.abs(x - w / 2) < w / 4 && Math.abs(y - h / 2) < h / 4 ? innen : grund, (y * w + x) * 4)
  return { width: w, height: h, data }
}

/** Profil-Speicher im Arbeitsspeicher, Dateien in einem Temp-Ordner */
async function speicher(): Promise<ProfilStore & { profil: Profil }> {
  const dir = await mkdtemp(join(tmpdir(), 'cs-logo-'))
  const s = {
    profil: { ...leeresProfil(), konten: [{ id: 'k1' }, { id: 'k2' }] as Profil['konten'] },
    datenordner: async () => dir,
    laden: async () => s.profil,
    aendern: async (fn: (p: Profil) => Profil) => (s.profil = fn(structuredClone(s.profil))),
    bytesAblegen: async (daten: Buffer, unter: string, name: string) => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(dir, unter), { recursive: true })
      await writeFile(join(dir, unter, name), daten)
      return `${unter}/${name}`
    },
    absolut: async (rel: string) => join(dir, rel)
  }
  return s as unknown as ProfilStore & { profil: Profil }
}

describe('Logo-Platz im Thumbnail', () => {
  it('freie Ecke der Reihe nach, nie über Gesichtern, unten rechts nur auf Wunsch (Videolänge)', () => {
    const frei = waehleLogoPlatz({ sperren: [], logoVerhaeltnis: 3, groesse: 'mittel', position: 'auto' })
    expect(frei).toMatchObject({ ecke: 'unten_links', frei: true, verkleinert: false })
    // unten links ist ein Gesicht → nächste Ecke
    const gesicht = waehleLogoPlatz({ sperren: [[0, 0.6, 0.4, 1]], logoVerhaeltnis: 3, groesse: 'mittel', position: 'auto' })
    expect(gesicht.ecke).toBe('oben_rechts')
    expect(ueberlappung(gesicht.box, [0, 0.6, 0.4, 1])).toBe(0)
    // alles außer unten rechts belegt: automatisch nie über der Videolänge, ausdrücklich gewünscht schon
    const voll: [number, number, number, number][] = [[0, 0, 1, 0.8], [0, 0, 0.6, 1]]
    expect(ueberlappung(waehleLogoPlatz({ sperren: voll, logoVerhaeltnis: 1, groesse: 'klein', position: 'auto' }).box, ZEITSTEMPEL)).toBe(0)
    expect(waehleLogoPlatz({ sperren: voll, logoVerhaeltnis: 1, groesse: 'klein', position: 'unten_rechts' })).toMatchObject({ ecke: 'unten_rechts', frei: true })
  })

  it('gewünschte Ecke belegt → weicht aus und sagt es; größer heißt größer', () => {
    const p = waehleLogoPlatz({ sperren: [[0.5, 0, 1, 0.5]], logoVerhaeltnis: 2, groesse: 'gross', position: 'oben_rechts' })
    expect(p.ausgewichen).toBe(true)
    expect(p.ecke).not.toBe('oben_rechts')
    expect(platzHinweise(p, 'oben_rechts')[0]).toMatch(/oben rechts/)
    const flaeche = (b: number[]): number => (b[2]! - b[0]!) * (b[3]! - b[1]!)
    expect(flaeche(logoBox('oben_links', 0.04, 2, 16 / 9))).toBeGreaterThan(flaeche(logoBox('oben_links', 0.012, 2, 16 / 9)))
  })

  it('Logo genau in die Box gesetzt, Seitenverhältnis bleibt', () => {
    const grund = bild(200, 100, [0, 0, 0, 255], [0, 0, 0, 255])
    const logo = bild(40, 10, [255, 0, 0, 255], [255, 0, 0, 255])
    const r = setzeLogoIn(grund, logo, [0.1, 0.1, 0.5, 0.5])
    // 40×10 in 80×50 → 80×20, senkrecht mittig
    const rot = (x: number, y: number): boolean => r.bild.data[(y * 200 + x) * 4] === 255
    expect(rot(25, 30)).toBe(true)
    expect(rot(25, 12)).toBe(false)
    expect(rot(105, 30)).toBe(false)
  })

  it('Änderung in Worten: kleiner, größer, Ecke, weg – Deutsch und Englisch; ohne „Logo“ unberührt', () => {
    const b = { position: 'auto' as const, groesse: 'mittel' as const }
    expect(logoAusWunsch('Logo kleiner bitte', b)).toEqual({ position: 'auto', groesse: 'klein' })
    expect(logoAusWunsch('make the logo much bigger', b)).toEqual({ position: 'auto', groesse: 'riesig' })
    expect(logoAusWunsch('Logo nach oben', { position: 'unten_rechts', groesse: 'mittel' })).toEqual({ position: 'oben_rechts', groesse: 'mittel' })
    expect(logoAusWunsch('logo to the right', b)).toEqual({ position: 'unten_rechts', groesse: 'mittel' })
    expect(logoAusWunsch('Logo weg', b)).toBeNull()
    expect(logoAusWunsch('ohne Logo', b)).toBeNull()
    expect(logoAusWunsch('remove the logo', b)).toBeNull()
    expect(logoAusWunsch('Text größer', b)).toBeUndefined()
  })
})

describe('Logo-Bilder', () => {
  it('ohne Transparenz: Hintergrund vom Rand her entfernt, zugeschnitten, aufs Quadrat', () => {
    const b = bild(40, 20, [255, 255, 255, 255], [200, 30, 30, 255])
    expect(hatTransparenz(b)).toBe(false)
    const f = freistellen(b)
    expect(hatTransparenz(f)).toBe(true)
    expect(f.data[3]).toBe(0)
    expect(f.data[(10 * 40 + 20) * 4 + 3]).toBe(255)
    const z = zuschneiden(f)
    expect(z.width).toBeLessThanOrEqual(22)
    expect(z.height).toBeLessThanOrEqual(12)
    const q = aufQuadrat(z)
    expect(q.width).toBe(q.height)
    expect(exportGroesse(400, 100, 2048)).toEqual({ breite: 2048, hoehe: 512 })
  })
})

describe('Logo-Bibliothek', () => {
  it('nutzt die Logos der Marke, neu, umbenennen, Standard je Konto, löschen', async () => {
    const s = await speicher()
    s.profil.marke.logos = ['marke/logos/alt-logo.png']
    expect((await ladeLogos(s)).map((l) => l.name)).toEqual(['alt logo'])
    let liste = await neuesLogo(s, Buffer.from('png'), { name: 'Kochmütze', quelle: 'erstellt' })
    expect(liste).toHaveLength(2)
    const neu = liste[1]!
    expect(neu).toMatchObject({ name: 'Kochmütze', quelle: 'erstellt' })
    expect(s.profil.marke.logos).toContain(neu.datei)
    expect(existsSync(await s.absolut(neu.datei))).toBe(true)
    liste = await aendereLogo(s, neu.id, { name: 'Haube', standard: { konto: 'k2', an: true } })
    expect(liste[1]).toMatchObject({ name: 'Haube', standard: ['k2'] })
    // Standard: k2 → das eigene, k1 → das erste der Marke; „kein Logo“ und Unbekanntes → keins
    expect((await logoFuerAuftrag(s, { id: 'standard', position: 'oben_links', groesse: 'klein' }, 'k2'))?.name).toBe('Haube')
    expect((await logoFuerAuftrag(s, undefined, 'k1'))?.name).toBe('alt logo')
    expect(await logoFuerAuftrag(s, { id: null, position: 'auto', groesse: 'mittel' }, 'k1')).toBeNull()
    expect(await logoFuerAuftrag(s, { id: 'marke/logos/../../geheim.png', position: 'auto', groesse: 'mittel' }, 'k1')).toBeNull()
    const pfad = await s.absolut(neu.datei)
    liste = await aendereLogo(s, neu.id, { entfernen: true })
    expect(liste).toHaveLength(1)
    expect(existsSync(pfad)).toBe(false)
    expect(JSON.parse(await readFile(join(await s.datenordner(), 'marke/logos/bibliothek.json'), 'utf8')).standard).toEqual({})
  })

  it('Thumbnail-Auftrag: ohne Angabe Standard-Logo, frei wählbar', () => {
    expect(ThumbStartSchema.parse({ kontoId: 'k' }).logo).toEqual({ id: 'standard', position: 'auto', groesse: 'mittel' })
    expect(ThumbStartSchema.parse({ kontoId: 'k', logo: { id: null } }).logo.id).toBeNull()
  })
})

describe('Logo erstellen', () => {
  const vorrat: Vorrat = { bloecke: new Set(['gold_block', 'stone']), items: new Set(['iron_chain', 'diamond_sword']), mobs: { creeper: 'c.png' }, koepfe: [{ name: 'Testkanal', datei: 'skin.png' }] }

  it('Namen in der Spieldatei finden', () => {
    expect(findeName('chain', vorrat.items)).toBe('iron_chain')
    expect(findeName('minecraft:Gold Block', vorrat.bloecke)).toBe('gold_block')
    expect(findeName('', vorrat.bloecke)).toBeNull()
  })

  it('Minecraft: Plan der KI wird geprüft und vervollständigt', () => {
    const { spec, warnungen } = pruefeLogoSpec({ titel: 'Gold', text: '  sehr   langer kanalname über vierundzwanzig  ', stil: '3d', fuellung: { art: 'textur', block: 'gold' }, symbol: { art: 'kopf', name: 'ich' }, neigung: 30, kontur: 'rot' }, vorrat, 'minecraft')
    expect(spec.text.length).toBeLessThanOrEqual(24)
    expect(spec).toMatchObject({ stil: '3d', fuellung: { art: 'textur', block: 'gold_block' }, neigung: 10, kontur: '#16161c', symbol: { art: 'kopf', name: 'Testkanal', datei: 'skin.png' } })
    expect(warnungen).toEqual([])
    const fehlt = pruefeLogoSpec({ text: 'X', fuellung: { art: 'textur', block: 'unbekannt' }, symbol: { art: 'item', name: 'laserschwert' } }, vorrat, 'minecraft')
    expect(fehlt.spec.fuellung.art).toBe('verlauf')
    expect(fehlt.spec.symbol).toBeUndefined()
    expect(fehlt.warnungen).toHaveLength(2)
  })

  it('Schrift-Logo: nur Verlauf, 2D und Emoji-Symbol, Farben der Marke als Rückfall', () => {
    const { spec } = pruefeLogoSpec({ text: 'Koch mit Kim', stil: '3d', fuellung: { art: 'textur', block: 'gold_block' }, symbol: { art: 'item', name: 'Hot_Pepper!' } }, LEERER_VORRAT, 'schrift', ['#ff0000', '#00ff00'])
    expect(spec).toMatchObject({ stil: '2d', fuellung: { art: 'verlauf', oben: '#ff0000', unten: '#00ff00' }, symbol: { art: 'emoji', name: 'hot pepper', platz: 'links' } })
  })

  it('ohne KI brauchbare Varianten, Plan-Schema für jeden Anbieter, neutraler Prompt', () => {
    const ohne = logosOhneKi({ beschreibung: 'Logo', kanal: { id: 'k', name: '@kochmitkim', plattform: 'YouTube', richtungen: ['kochen'], sprache: 'de' }, anzahl: 3, farben: ['#123456'], bauart: 'schrift' })
    expect(ohne).toHaveLength(3)
    expect(LogoPlanZ.safeParse({ varianten: ohne }).success).toBe(true)
    expect(JSON.stringify(z.toJSONSchema(LogoPlanZ))).toContain('emoji')
    const p = planPrompt({ beschreibung: 'Kanal-Logo', anzahl: 2, kanal: { id: 'k', name: '@kochmitkim', plattform: 'YouTube', richtungen: ['kochen'], sprache: 'de' }, bauart: 'schrift', koepfe: [], schrift: null, farben: ['#123456'], umgebung: {} as never, ausgabe: '', sprache: 'de' }, LEERER_VORRAT)
    expect(p).toContain('#123456')
    expect(p).toContain('emoji')
    expect(p).not.toMatch(/Minecraft-Schrift/)
  })
})
