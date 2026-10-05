// Herkunft: MoinStudio src/main/logo/job.ts (MIT), v0.38.0 – KI-Schicht statt Claude-CLI, Minecraft als Richtungsmodul,
// für alle anderen Richtungen ein Schrift-Logo in der Schrift der Marke.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Sprache } from '@shared/i18n'
import { runBlender } from '../jobs/blender'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { emojiBild } from '../thumbnail/bildelemente'
import { sprachName } from '../thumbnail/job'
import { sichereMcAssets } from '../thumbnail/minecraft/assets'
import { liesJson, py, sichereGrafikPython, type ThumbUmgebung } from '../thumbnail/umgebung'

/**
 * Logo erstellen: Die KI plant Text, Stil, Farben, Kontur und ein Symbol, gebaut wird ohne Bildgenerator – bei
 * Minecraft-Konten aus der echten Spieldatei (blender/logo_bauen.py: Minecraft-Schrift, Blocktexturen, Items, Köpfe),
 * sonst in der Schrift der Marke mit einem Fluent-Emoji als Symbol (blender/bild/logo_schrift.py). Immer mit
 * transparentem Hintergrund. Änderungen in Worten stehen wie beim Thumbnail als Verlauf unter dem Auftrag.
 */

export type Bauart = 'minecraft' | 'schrift'

export interface LogoSpec {
  titel: string
  text: string
  untertitel?: string
  untertitel_farbe?: string
  /** nur Minecraft: flache Blockschrift oder echter 3D-Blocktext */
  stil: '2d' | '3d'
  fuellung: { art: 'textur'; block: string } | { art: 'verlauf'; oben: string; unten: string }
  kontur: string
  kontur_dicke: 'keine' | 'duenn' | 'mittel' | 'dick'
  schatten: boolean
  /** Minecraft: Kopf, Block oder Item; sonst ein Emoji (englischer CLDR-Name) */
  symbol?: { art: 'kopf' | 'block' | 'item' | 'emoji'; name: string; platz: 'links' | 'rechts' | 'oben'; datei?: string }
  neigung: number
}

export interface LogoVariante {
  titel: string
  bild: string | null
  /** Bauplan (JSON), für Änderungen */
  szene: string
  warnungen: string[]
  fehler?: string
  bauart: Bauart
}

interface Gemeinsam {
  kanal: { id: string; name: string; plattform: string; richtungen: string[]; sprache: string }
  bauart: Bauart
  /** Minecraft: Köpfe des Creators und seiner Freunde (Skin-Dateien, absolut), der Creator zuerst */
  koepfe: { name: string; datei: string }[]
  /** Schrift der Marke (absolut) */
  schrift: string | null
  farben: string[]
  umgebung: ThumbUmgebung
  ausgabe: string
  sprache: Sprache
}

export interface LogoPayload extends Gemeinsam {
  beschreibung: string
  anzahl: number
}

export interface LogoAenderungPayload extends Gemeinsam {
  wunsch: string
  /** Ursprungsauftrag (der Verlauf hängt an ihm) und geänderte Variante */
  eltern: string
  basis: { job: string; variante: number }
  bild: string
  szene: string
}

export interface LogoDienste {
  ki: KiSchicht | null
}

/** Mob-Köpfe mit dem gleichen Kopf-Layout wie ein Skin (8×8×8 bei 0,0) */
export const MOB_KOEPFE: Record<string, string> = {
  creeper: 'entity/creeper/creeper.png',
  zombie: 'entity/zombie/zombie.png',
  husk: 'entity/zombie/husk.png',
  drowned: 'entity/zombie/drowned.png',
  skeleton: 'entity/skeleton/skeleton.png',
  wither_skeleton: 'entity/skeleton/wither_skeleton.png',
  stray: 'entity/skeleton/stray.png',
  enderman: 'entity/enderman/enderman.png',
  steve: 'entity/player/wide/steve.png',
  alex: 'entity/player/slim/alex.png'
}

const BEISPIEL_BLOECKE = ['gold_block', 'diamond_block', 'emerald_block', 'iron_block', 'redstone_block', 'lapis_block', 'netherite_block', 'amethyst_block', 'copper_block', 'stone', 'cobblestone', 'deepslate', 'obsidian', 'netherrack', 'oak_planks', 'grass_block', 'tnt', 'crafting_table', 'sand', 'snow_block', 'glowstone']
const BEISPIEL_ITEMS = ['diamond_sword', 'netherite_sword', 'diamond_pickaxe', 'golden_apple', 'ender_pearl', 'totem_of_undying', 'iron_chain', 'compass', 'clock', 'bow', 'trident', 'mace', 'fishing_rod', 'emerald', 'diamond']

const HEX = /^#[0-9a-f]{6}$/i

/** Plan einer Variante, wie die KI ihn liefert (locker; pruefeLogoSpec macht daraus immer einen baubaren Plan) */
const VarianteZ = z.object({
  titel: z.string(),
  text: z.string(),
  untertitel: z.string().optional(),
  untertitel_farbe: z.string().optional(),
  stil: z.enum(['2d', '3d']).optional(),
  fuellung: z.object({ art: z.enum(['textur', 'verlauf']), block: z.string().optional(), oben: z.string().optional(), unten: z.string().optional() }).optional(),
  kontur: z.string().optional(),
  kontur_dicke: z.enum(['keine', 'duenn', 'mittel', 'dick']).optional(),
  schatten: z.boolean().optional(),
  symbol: z.object({ art: z.enum(['kopf', 'block', 'item', 'emoji']), name: z.string(), platz: z.enum(['links', 'rechts', 'oben']).optional() }).optional(),
  neigung: z.number().optional()
})
export const LogoPlanZ = z.object({ varianten: z.array(VarianteZ).min(1).max(4) })
const AenderungZ = z.object({ logo: VarianteZ })

/** Was zum Bauen da ist: Blöcke, Items und Köpfe der Spieldatei (nur Minecraft) */
export interface Vorrat {
  bloecke: Set<string>
  items: Set<string>
  /** Mob-Köpfe, deren Textur es gibt → Datei */
  mobs: Record<string, string>
  koepfe: { name: string; datei: string }[]
}

export const LEERER_VORRAT: Vorrat = { bloecke: new Set(), items: new Set(), mobs: {}, koepfe: [] }

/** Name → vorhandener Name: genau, sonst „…_name“ (chain → iron_chain), sonst enthält den Namen. */
export function findeName(name: string, vorhanden: Set<string>): string | null {
  const n = name.trim().toLowerCase().replace(/^minecraft:/, '').replace(/[\s-]+/g, '_')
  if (!n) return null
  if (vorhanden.has(n)) return n
  const liste = [...vorhanden].sort((a, b) => a.length - b.length || a.localeCompare(b))
  return liste.find((x) => x.endsWith(`_${n}`)) ?? liste.find((x) => x.startsWith(`${n}_`)) ?? liste.find((x) => x.includes(n)) ?? null
}

/**
 * Plan der KI prüfen und vervollständigen: Text kürzen, Farben prüfen, Blocktextur, Item oder Kopf in der Spieldatei
 * finden (sonst Verlauf bzw. ohne Symbol, mit Hinweis). Schrift-Logos kennen nur Verläufe und Emoji-Symbole. Liefert
 * immer einen baubaren Plan.
 */
export function pruefeLogoSpec(roh: unknown, vorrat: Vorrat, bauart: Bauart, farben: string[] = []): { spec: LogoSpec; warnungen: string[] } {
  const r = (roh ?? {}) as Record<string, unknown>
  const warnungen: string[] = []
  const text = String(r['text'] ?? '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'LOGO'
  const farbe = (x: unknown, standard: string): string => (typeof x === 'string' && HEX.test(x) ? x : standard)
  const marke = farben.filter((f) => HEX.test(f))
  const f = (r['fuellung'] ?? {}) as Record<string, unknown>
  let fuellung: LogoSpec['fuellung'] = { art: 'verlauf', oben: farbe(f['oben'], marke[0] ?? '#ffd83a'), unten: farbe(f['unten'], marke[1] ?? '#ff8a00') }
  if (f['art'] === 'textur' && bauart === 'minecraft') {
    const block = typeof f['block'] === 'string' ? findeName(f['block'], vorrat.bloecke) : null
    if (block) fuellung = { art: 'textur', block }
    else warnungen.push(t('logo.warn.block', { name: String(f['block'] ?? '') }))
  }
  const s = r['symbol'] as Record<string, unknown> | undefined
  let symbol: LogoSpec['symbol']
  if (s && typeof s === 'object' && typeof s['name'] === 'string' && s['name'].trim()) {
    const platz = s['platz'] === 'rechts' || s['platz'] === 'oben' ? s['platz'] : 'links'
    const name = s['name'].trim()
    if (bauart === 'schrift') {
      // Emoji-Namen nach CLDR auf Englisch, z. B. „hot pepper“; ob es ihn gibt, zeigt erst der Download
      const emoji = name.toLowerCase().replace(/[_]+/g, ' ').replace(/[^a-z0-9 -]/g, '').trim()
      if (emoji) symbol = { art: 'emoji', name: emoji, platz }
    } else if (s['art'] === 'kopf') {
      const k = name.toLowerCase()
      const eigen = vorrat.koepfe.find((x) => x.name.toLowerCase() === k || (['ich', 'me', 'creator', 'spieler', 'player'].includes(k) && x === vorrat.koepfe[0]))
      const mob = findeName(k, new Set(Object.keys(vorrat.mobs)))
      if (eigen) symbol = { art: 'kopf', name: eigen.name, platz, datei: eigen.datei }
      else if (mob) symbol = { art: 'kopf', name: mob, platz, datei: vorrat.mobs[mob] }
    } else if (s['art'] === 'item') {
      const item = findeName(name, vorrat.items)
      if (item) symbol = { art: 'item', name: item, platz }
    } else if (s['art'] === 'block') {
      const block = findeName(name, vorrat.bloecke)
      if (block) symbol = { art: 'block', name: block, platz }
    }
    if (!symbol) warnungen.push(t('logo.warn.symbol', { name }))
  }
  const dicken = ['keine', 'duenn', 'mittel', 'dick'] as const
  const untertitel = typeof r['untertitel'] === 'string' ? r['untertitel'].replace(/\s+/g, ' ').trim().slice(0, 32) : ''
  const neigung = typeof r['neigung'] === 'number' && Number.isFinite(r['neigung']) ? Math.max(-10, Math.min(10, r['neigung'])) : 0
  return {
    spec: {
      titel: String(r['titel'] ?? text).slice(0, 80),
      text,
      ...(untertitel ? { untertitel, untertitel_farbe: farbe(r['untertitel_farbe'], '#ffffff') } : {}),
      stil: bauart === 'minecraft' && r['stil'] === '3d' ? '3d' : '2d',
      fuellung,
      kontur: farbe(r['kontur'], '#16161c'),
      kontur_dicke: dicken.includes(r['kontur_dicke'] as (typeof dicken)[number]) ? (r['kontur_dicke'] as LogoSpec['kontur_dicke']) : 'mittel',
      schatten: r['schatten'] !== false,
      ...(symbol ? { symbol } : {}),
      neigung
    },
    warnungen
  }
}

/** Bauplan für die KI: ohne Dateipfade */
export function specFuerKi(spec: LogoSpec): Record<string, unknown> {
  const { symbol, ...rest } = spec
  return { ...rest, ...(symbol ? { symbol: { art: symbol.art, name: symbol.name, platz: symbol.platz } } : {}) }
}

/** Ohne KI: Varianten aus Kontoname bzw. Beschreibung in den Farben der Marke – schlicht, aber brauchbar */
export function logosOhneKi(p: Pick<LogoPayload, 'beschreibung' | 'kanal' | 'anzahl' | 'farben' | 'bauart'>): unknown[] {
  const text = (p.kanal.name.replace(/^@/, '') || p.beschreibung).slice(0, 24)
  const paare: [string, string][] = [
    [p.farben[0] ?? '#ffd83a', p.farben[1] ?? '#ff8a00'],
    ['#ffffff', '#cfd8e3'],
    ['#7cff4f', '#00b35a'],
    ['#00e5ff', '#2962ff']
  ]
  return paare.slice(0, p.anzahl).map(([oben, unten], i) => ({ titel: `${text} ${i + 1}`, text, fuellung: { art: 'verlauf', oben, unten }, kontur: '#16161c', kontur_dicke: 'dick', schatten: true, neigung: i % 2 ? -4 : 0, stil: p.bauart === 'minecraft' && i === 1 ? '3d' : '2d' }))
}

const FELDER = `- titel: kurze Beschreibung der Idee (für den Creator)
- text: der Schriftzug (höchstens 24 Zeichen, wird groß geschrieben); untertitel: optional eine kleine zweite Zeile
  (höchstens 32 Zeichen), untertitel_farbe als #rrggbb
- kontur: #rrggbb, kontur_dicke: keine, duenn, mittel, dick; schatten: true/false; neigung: -8 bis 8 Grad (0 = gerade)`

function regeln(p: Gemeinsam, vorrat: Vorrat): string {
  if (p.bauart === 'minecraft')
    return `Stil wie bei großen Minecraft-Kanälen: kurze, fette Blockschrift in der echten Minecraft-Schrift, dicke dunkle
Kontur, harter Schatten, kräftige Farben – gut lesbar, auch klein als Wasserzeichen. Kein Fließtext, keine Emojis.
Felder je Logo:
${FELDER}
- stil: "3d" (echte 3D-Blockbuchstaben aus Würfeln, gerendert) oder "2d" (flache Blockschrift mit Tiefe)
- fuellung: {"art": "textur", "block": <Blockname>} – die Buchstaben bekommen die echte Blocktextur – oder
  {"art": "verlauf", "oben": "#rrggbb", "unten": "#rrggbb"}. Gute Blöcke: ${BEISPIEL_BLOECKE.join(', ')} (jeder Block der
  Spieldatei geht)
- symbol (optional): {"art": "kopf" | "block" | "item", "name": …, "platz": "links" | "rechts" | "oben"}
  Köpfe: ${[...vorrat.koepfe.map((k) => k.name), ...Object.keys(vorrat.mobs)].join(', ')}${vorrat.koepfe[0] ? ` (${vorrat.koepfe[0].name} = der eigene Skin des Creators)` : ''}
  Items z. B.: ${BEISPIEL_ITEMS.join(', ')} (jedes Item der Spieldatei geht); Blöcke wie oben.`
  return `Stil passend zur Richtung des Kanals (${p.kanal.richtungen.join(', ') || 'allgemein'}): kurzer, fetter Schriftzug in der Schrift der
Marke, kräftige Kontur und Schatten, gut lesbar – auch klein als Wasserzeichen. Kein Fließtext.${p.farben.length ? ` Farben der Marke (bevorzugt): ${p.farben.join(', ')}.` : ''}
Felder je Logo:
${FELDER}
- fuellung: {"art": "verlauf", "oben": "#rrggbb", "unten": "#rrggbb"} (Farbverlauf der Buchstaben)
- symbol (optional): {"art": "emoji", "name": <englischer Emoji-Name nach Unicode/CLDR, z. B. "hot pepper",
  "video game", "camera", "flexed biceps", "books">, "platz": "links" | "rechts" | "oben"} – erscheint als 3D-Sticker`
}

export function planPrompt(p: Pick<LogoPayload, 'beschreibung' | 'anzahl'> & Gemeinsam, vorrat: Vorrat): string {
  return `Du gestaltest ein Logo für den Kanal ${p.kanal.name || '(ohne Namen)'} auf ${p.kanal.plattform}. Wunsch: „${p.beschreibung}“

Plane ${p.anzahl} deutlich verschiedene Logo-Varianten (verschiedene Stile, Füllungen und Symbole${p.bauart === 'minecraft' ? '; mindestens eine "3d", falls mehr als eine Variante' : ''}).
Ist es ein Kanal-Logo, passt ${p.bauart === 'minecraft' ? 'der eigene Kopf des Creators' : 'ein Symbol für das Thema des Kanals'} gut; bei einer Serie ein Symbol, das zur Serie passt.
${regeln(p, vorrat)}

Titel auf ${sprachName(p.sprache)}. Antworte nur mit JSON nach dem Schema: {"varianten": [ … ]}.`
}

export function aenderungPrompt(wunsch: string, spec: LogoSpec, p: Gemeinsam, vorrat: Vorrat): string {
  return `Der Creator möchte an seinem Logo etwas ändern. Das Bild zeigt das aktuelle Logo.

Wunsch: „${wunsch}“

So ist das Logo gerade gebaut (JSON):
${JSON.stringify(specFuerKi(spec), null, 1)}

${regeln(p, vorrat)}

Ändere nur, was der Wunsch verlangt, alles andere bleibt genau so. Antworte nur mit {"logo": <das vollständige geänderte Logo>}.`
}

/** Blöcke, Items und Mob-Köpfe der entpackten Spieldatei */
async function ladeVorrat(assets: string, koepfe: Gemeinsam['koepfe']): Promise<Vorrat> {
  const namen = async (ordner: string, endung: string): Promise<string[]> =>
    (await readdir(join(assets, ordner)).catch(() => [] as string[])).filter((d) => d.endsWith(endung)).map((d) => d.slice(0, -endung.length))
  const bloecke = new Set([...(await namen('blockstates', '.json')), ...(await namen(join('textures', 'block'), '.png'))])
  const items = new Set(await namen(join('textures', 'item'), '.png'))
  const mobs: Record<string, string> = {}
  for (const [name, rel] of Object.entries(MOB_KOEPFE)) {
    const pfad = join(assets, 'textures', ...rel.split('/'))
    if (await readFile(pfad).then(() => true, () => false)) mobs[name] = pfad
  }
  return { bloecke, items, mobs, koepfe }
}

interface Werkstatt {
  vorrat: Vorrat
  assets: string | null
}

async function werkstatt(p: Gemeinsam, ctx: JobContext<unknown>): Promise<Werkstatt> {
  if (p.bauart !== 'minecraft') return { vorrat: LEERER_VORRAT, assets: null }
  ctx.progress(2, t('thumb.schritt.minecraft'))
  const mc = await sichereMcAssets(join(p.umgebung.werkzeugRoot, 'mc'), { mojangErlaubt: p.umgebung.mojangErlaubt, onProgress: (x) => ctx.progress(null, x) })
  return { vorrat: await ladeVorrat(mc.assets, p.koepfe), assets: mc.assets }
}

async function baue(spec: LogoSpec, basis: string, w: Werkstatt, p: Gemeinsam, ctx: JobContext<unknown>): Promise<{ bild: string | null; fehler?: string; warnungen: string[] }> {
  const u = p.umgebung
  const warnungen: string[] = []
  let symbol: Record<string, unknown> | undefined = spec.symbol ? { ...spec.symbol } : undefined
  if (spec.symbol?.art === 'item' && w.assets) symbol = { ...symbol, datei: join(w.assets, 'textures', 'item', `${spec.symbol.name}.png`) }
  if (spec.symbol?.art === 'emoji') {
    const datei = await emojiBild(join(u.werkzeugRoot, 'bilder', 'emoji'), spec.symbol.name).catch(() => null)
    if (datei) symbol = { ...symbol, datei }
    else {
      symbol = undefined
      warnungen.push(t('logo.warn.symbol', { name: spec.symbol.name }))
    }
  }
  if (p.bauart === 'minecraft') {
    if (!u.blender || !w.assets) return { bild: null, fehler: t('thumb.fehlt.blender'), warnungen }
    await writeFile(`${basis}.logo.json`, JSON.stringify({ ...spec, symbol, samples: u.blender.samples, geraet: u.blender.geraet }, null, 1))
    const r = await runBlender({ exe: u.blender.exe, mesa: u.blender.mesa, script: join(u.skripte, 'logo_bauen.py'), args: [`${basis}.logo.json`, w.assets, `${basis}.png`, `${basis}.bericht.json`] }, ctx)
    const bericht = await liesJson<{ fehler?: string; warnungen?: string[] }>(`${basis}.bericht.json`, {})
    if (r.code !== 0 || bericht.fehler) return { bild: null, fehler: bericht.fehler ?? `Blender ${r.code}`, warnungen }
    return { bild: `${basis}.png`, warnungen: [...warnungen, ...(bericht.warnungen ?? [])] }
  }
  await writeFile(`${basis}.logo.json`, JSON.stringify({ ...spec, symbol, schrift: p.schrift }, null, 1))
  const pyU = await sichereGrafikPython(u, ctx)
  try {
    await py(pyU, join(u.skripte, 'bild', 'logo_schrift.py'), [`${basis}.logo.json`, `${basis}.png`, `${basis}.bericht.json`], ctx)
  } catch {
    // Der Bericht sagt, was schiefging
  }
  const bericht = await liesJson<{ fehler?: string; warnungen?: string[] }>(`${basis}.bericht.json`, {})
  if (bericht.fehler) return { bild: null, fehler: bericht.fehler, warnungen }
  return { bild: `${basis}.png`, warnungen: [...warnungen, ...(bericht.warnungen ?? [])] }
}

export async function logoJob(p: LogoPayload, ctx: JobContext<{ plan?: unknown[]; fertig?: LogoVariante[] }>, d: LogoDienste): Promise<{ varianten: LogoVariante[] }> {
  const c = ctx as JobContext<unknown>
  await mkdir(p.ausgabe, { recursive: true })
  const w = await werkstatt(p, c)
  let plan = ctx.checkpoint?.plan
  const hinweise: string[] = []
  if (!plan) {
    ctx.progress(5, t('logo.schritt.plan'))
    if (d.ki && (await d.ki.verfuegbar())) {
      const e = await d.ki.frage({ name: 'logo-plan', system: 'You design bold, readable channel logos and answer with JSON only.', prompt: planPrompt(p, w.vorrat), schema: LogoPlanZ, stufe: 'stark', maxAusgabe: 3000 }, c)
      plan = e.daten.varianten.slice(0, p.anzahl)
    } else {
      plan = logosOhneKi(p)
      hinweise.push(t('logo.ohneKi'))
    }
    await ctx.save({ ...(ctx.checkpoint ?? {}), plan })
  }
  const fertig: LogoVariante[] = [...(ctx.checkpoint?.fertig ?? [])]
  for (let i = fertig.length; i < plan.length; i++) {
    await ctx.yield()
    const { spec, warnungen } = pruefeLogoSpec(plan[i], w.vorrat, p.bauart, p.farben)
    ctx.progress(Math.round(10 + (i / plan.length) * 88), t('logo.schritt.variante', { nr: i + 1, von: plan.length, titel: spec.titel }))
    const basis = join(p.ausgabe, `logo-${i + 1}`)
    const r = await baue(spec, basis, w, p, c)
    fertig.push({ titel: spec.titel, bild: r.bild, szene: `${basis}.logo.json`, warnungen: [...hinweise, ...warnungen, ...r.warnungen], bauart: p.bauart, ...(r.fehler ? { fehler: r.fehler } : {}) })
    await ctx.save({ ...(ctx.checkpoint ?? {}), plan, fertig })
  }
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { varianten: fertig }
}

export async function logoAenderungJob(p: LogoAenderungPayload, ctx: JobContext<unknown>, d: LogoDienste): Promise<{ varianten: LogoVariante[] }> {
  await mkdir(p.ausgabe, { recursive: true })
  if (!d.ki || !(await d.ki.verfuegbar())) throw new Error(t('logo.aenderungOhneKi'))
  const w = await werkstatt(p, ctx)
  const alt = pruefeLogoSpec(JSON.parse(await readFile(p.szene, 'utf8')), w.vorrat, p.bauart, p.farben).spec
  ctx.progress(5, t('logo.schritt.aenderung'))
  const bildKi = await d.ki.verfuegbar(true)
  const e = await d.ki.frage({ name: 'logo-aenderung', system: 'You change a logo exactly as asked and answer with JSON only.', prompt: aenderungPrompt(p.wunsch, alt, p, w.vorrat), bilder: bildKi ? [p.bild] : [], schema: AenderungZ, stufe: 'stark', maxAusgabe: 2000 }, ctx)
  const { spec, warnungen } = pruefeLogoSpec(e.daten.logo, w.vorrat, p.bauart, p.farben)
  await ctx.yield()
  ctx.progress(30, t('logo.schritt.variante', { nr: 1, von: 1, titel: spec.titel }))
  const basis = join(p.ausgabe, 'logo')
  const r = await baue(spec, basis, w, p, ctx)
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { varianten: [{ titel: t('logo.geaendert', { wunsch: p.wunsch }).slice(0, 90), bild: r.bild, szene: `${basis}.logo.json`, warnungen: [...warnungen, ...r.warnungen], bauart: p.bauart, ...(r.fehler ? { fehler: r.fehler } : {}) }] }
}
