// Herkunft: MoinStudio src/main/thumbnail/mobimport.ts (MIT). Nur Laufzeit-Import, keine Mob-Tabelle im Repo.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Alle Mobs, immer die neuesten (aus MoinStudio übernommen): Import aus Mojangs offiziellen bedrock-samples, Zweig „preview“
 * (enthält auch noch nicht veröffentlichte Mobs). Für jede Client-Entity: Geometrie, Standard-Textur (PNG oder TGA,
 * beides liest Blender direkt) und die Grundhaltung aus den unbedingt laufenden Animationen. Keine Handliste – nur
 * Sonderfälle, die sich nicht aus den Daten ableiten lassen, stehen in `SONDERFAELLE`.
 *
 * Ergebnis: <lokal>/mc/mobs/<version>/mobs.json (+ textures/…) im Format, das blender/minecraft/mobs.py liest.
 */

const QUELLE = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/preview/'
/** Erhöhen, wenn sich der Import ändert (eingebaute Geometrien, Sonderfälle): dann wird neu importiert, auch ohne neue Version */
const IMPORT_FORMAT = 5
const BAUM = 'https://api.github.com/repos/Mojang/bedrock-samples/git/trees/preview?recursive=1'

type Vec = [number, number, number]
export interface Box { origin: Vec; size: Vec; uv: [number, number]; inflate: number; mirror: boolean }
export interface Part { name: string; parent: string | null; pivot: Vec; rotation: Vec; boxes: Box[] }
interface FaceUv { uv: number[]; uv_size: number[] }
interface GeoCube { origin: number[]; size: number[]; uv: number[] | Record<string, FaceUv>; inflate?: number; mirror?: boolean; pivot?: number[]; rotation?: number[] }
interface GeoBone { name: string; parent?: string; pivot?: number[]; rotation?: number[]; bind_pose_rotation?: number[]; neverRender?: boolean; mirror?: boolean; cubes?: GeoCube[] }
interface Geo { tex: [number, number]; bones: GeoBone[]; eltern?: string }
type Anim = { bones?: Record<string, { rotation?: (string | number)[] | Record<string, unknown>; position?: (string | number)[] | Record<string, unknown> }> }

export interface MobEintrag {
  texture: string
  tex_size: [number, number]
  height_px: number
  scale?: number
  quelle: string
  parts: Part[]
}

/** Sonderfälle, die im Spiel erst im Code entstehen (Lage von Einzelteilen). Ergänzungen, nie die Grenze. */
const SONDERFAELLE: Record<string, { versatz?: Record<string, Vec>; ziel?: string[]; textur?: string; nichtAnheben?: boolean }> = {
  // Standard-Boot wie in Java: Eiche (Bedrock nimmt sonst Akazie); die gedrehte Bodenplatte liegt nicht unter dem Boden
  boat: { textur: 'oak', nichtAnheben: true },
  enderman: { versatz: { head: [0, 14, 0] } },
  // Wächter: die Stachel-Animation gibt die Würfelmitte an, nicht eine Verschiebung
  guardian: { ziel: ['spikes'] },
  elder_guardian: { ziel: ['spikes'] }
}
void blazeStaebe // Blaze-Stäbe kommen jetzt aus der Animation; Java-Lage bleibt als Reserve

function blazeStaebe(): Record<string, Vec> {
  const v: Record<string, Vec> = {}
  const ring = (von: number, start: number, radius: number, y: (i: number) => number): void => {
    let f = start
    for (let i = von; i < von + 4; i++, f++) v[`upper_body_parts${i}`] = [Math.cos(f) * radius, -y(i), Math.sin(f) * radius]
  }
  ring(0, 0, 9, (i) => -2 + Math.cos(i * 2 * 0.25))
  ring(4, Math.PI / 4, 7, (i) => 2 + Math.cos(i * 2 * 0.25))
  ring(8, 0.47123894, 5, (i) => 11 + Math.cos(i * 1.5 * 0.5))
  return v
}

export function knochenName(roh: string, pivot: number[]): string {
  const s = roh
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/^rightarm$/, 'right_arm')
    .replace(/^leftarm$/, 'left_arm')
    .replace(/^rightleg$/, 'right_leg')
    .replace(/^leftleg$/, 'left_leg')
  if (/^leg\d$/.test(s)) return `${(pivot[0] ?? 0) < 0 ? 'right' : 'left'}_${(pivot[2] ?? 0) < 0 ? 'front' : 'hind'}_leg`
  return s
}

/** Alle Geometrien einer Datei (neues und altes Format, mit Vererbung „geometry.a:geometry.b“). */
export function geometrienAus(json: Record<string, unknown>): Map<string, Geo> {
  const m = new Map<string, Geo>()
  const neu = json['minecraft:geometry'] as { description: { identifier: string; texture_width?: number; texture_height?: number }; bones?: GeoBone[] }[] | undefined
  for (const g of neu ?? []) m.set(g.description.identifier, { tex: [g.description.texture_width ?? 64, g.description.texture_height ?? 64], bones: g.bones ?? [] })
  for (const [k, v] of Object.entries(json)) {
    if (!k.startsWith('geometry.')) continue
    const g = v as { texturewidth?: number; textureheight?: number; bones?: GeoBone[] }
    const [id, eltern] = k.split(':')
    m.set(id!, { tex: [g.texturewidth ?? 64, g.textureheight ?? 64], bones: g.bones ?? [], eltern })
  }
  return m
}

/** Ein Teil eines Java-Modells (y nach unten): Versatz, Drehung in Grad, Würfel [x, y, z, b, h, t] mit Texturversatz */
interface JavaTeil { name: string; versatz: Vec; drehung?: Vec; uv: [number, number]; wuerfel: [number, number, number, number, number, number][] }

/**
 * Java-Modell → Bedrock-Knochen. Der Renderer spiegelt das Java-Modell mit scale(−1, −1, 1): x und y kehren sich um,
 * Drehungen um x und y wechseln das Vorzeichen (dieselbe Umrechnung wie Blockbench). `boden`: Java-y, das auf dem Boden
 * liegt (Boot: +6, weil der Renderer 0,375 Blöcke anhebt).
 */
export function ausJava(teile: JavaTeil[], boden: number, drehung = 0): GeoBone[] {
  // Renderer-Drehung (Boot: 90° um y, damit man in Fahrtrichtung sitzt) als gemeinsamer Wurzelknochen
  const wurzel: GeoBone[] = drehung ? [{ name: 'root', pivot: [0, 0, 0], rotation: [0, drehung, 0] }] : []
  return [...wurzel, ...teile.map((t) => {
    const [px, py, pz] = t.versatz
    const [rx, ry, rz] = t.drehung ?? [0, 0, 0]
    return {
      name: t.name,
      ...(drehung ? { parent: 'root' } : {}),
      pivot: [-px || 0, boden - py, pz],
      rotation: [-rx, -ry, rz].map((w) => w || 0),
      cubes: t.wuerfel.map(([x, y, z, b, h, d]) => ({ origin: [-(px + x + b) || 0, boden - (py + y + h), pz + z], size: [b, h, d], uv: t.uv }))
    }
  })]
}

/**
 * Geometrien, die im Bedrock-Spiel fest einprogrammiert sind und in bedrock-samples fehlen. Quelle: Java-Modelle des
 * Spiels (BoatModel). Ergänzung, nie die Grenze – alles andere kommt weiter aus den Daten.
 */
export const EINGEBAUT: Record<string, Geo> = {
  'geometry.boat': {
    tex: [128, 64],
    bones: ausJava(
      [
        { name: 'bottom', versatz: [0, 3, 1], drehung: [90, 0, 0], uv: [0, 0], wuerfel: [[-14, -9, -3, 28, 16, 3]] },
        { name: 'back', versatz: [-15, 4, 4], drehung: [0, 270, 0], uv: [0, 19], wuerfel: [[-13, -7, -1, 18, 6, 2]] },
        { name: 'front', versatz: [15, 4, 0], drehung: [0, 90, 0], uv: [0, 27], wuerfel: [[-8, -7, -1, 16, 6, 2]] },
        { name: 'right', versatz: [0, 4, -9], drehung: [0, 180, 0], uv: [0, 35], wuerfel: [[-14, -7, -1, 28, 6, 2]] },
        { name: 'left', versatz: [0, 4, 9], uv: [0, 43], wuerfel: [[-14, -7, -1, 28, 6, 2]] },
        { name: 'left_paddle', versatz: [3, -5, 9], drehung: [0, 0, 11.25], uv: [62, 0], wuerfel: [[-1, 0, -5, 2, 2, 18], [-1.001, -3, 8, 1, 6, 7]] },
        { name: 'right_paddle', versatz: [3, -5, -9], drehung: [0, 180, 11.25], uv: [62, 20], wuerfel: [[-1, 0, -5, 2, 2, 18], [-1.001, -3, 8, 1, 6, 7]] }
      ],
      6,
      90
    )
  }
}

function aufgeloest(id: string, alle: Map<string, Geo>, tiefe = 0): Geo | null {
  const g = alle.get(id)
  if (!g) return null
  if (!g.eltern || tiefe > 5) return g
  const e = aufgeloest(g.eltern, alle, tiefe + 1)
  if (!e) return g
  const eigene = new Set(g.bones.map((b) => b.name.toLowerCase()))
  return { tex: g.tex, bones: [...e.bones.filter((b) => !eigene.has(b.name.toLowerCase())), ...g.bones] }
}

export function wandle(geo: { bones: GeoBone[] }): { parts: Part[]; scale: number } {
  const namen = new Map(geo.bones.map((b) => [b.name.toLowerCase(), knochenName(b.name, b.pivot ?? [0, 0, 0])]))
  const parts: Part[] = []
  let scale = 1
  for (const b of geo.bones) {
    const name = namen.get(b.name.toLowerCase())!
    const boxes: Box[] = []
    const extra: Part[] = []
    if (!b.neverRender)
      for (const c of b.cubes ?? []) {
        let uv: [number, number]
        if (Array.isArray(c.uv)) uv = [c.uv[0] ?? 0, c.uv[1] ?? 0]
        else {
          const nord = c.uv['north']
          if (!nord) continue
          const k = (c.size[0] ?? 0) > 0 && nord.uv_size[0] ? (c.size[0] ?? 0) / Math.abs(nord.uv_size[0]) : 1
          uv = [(nord.uv[0] ?? 0) - (c.size[2] ?? 0) / k, (nord.uv[1] ?? 0) - (c.size[2] ?? 0) / k]
          scale = k
        }
        const box: Box = { origin: c.origin as Vec, size: c.size as Vec, uv, inflate: c.inflate ?? 0, mirror: c.mirror ?? b.mirror ?? false }
        if (c.rotation && c.rotation.some((r) => r !== 0))
          extra.push({ name: `${name}_w${extra.length}`, parent: name, pivot: (c.pivot ?? c.origin.map((o, i) => o + (c.size[i] ?? 0) / 2)) as Vec, rotation: c.rotation as Vec, boxes: [box] })
        else boxes.push(box)
      }
    const eltern = b.parent ? (namen.get(b.parent.toLowerCase()) ?? null) : null
    parts.push({ name, parent: eltern, pivot: (b.pivot ?? [0, 0, 0]) as Vec, rotation: (b.rotation ?? b.bind_pose_rotation ?? [0, 0, 0]) as Vec, boxes }, ...extra)
  }
  const f = (v: Vec): Vec => [v[0] / scale, v[1] / scale, v[2] / scale]
  for (const p of parts) {
    p.pivot = f(p.pivot)
    for (const x of p.boxes) {
      x.origin = f(x.origin)
      x.size = f(x.size)
      x.inflate /= scale
    }
  }
  return { parts, scale }
}

/** Molang in Ruhe: query.* = 0, math.* in Grad, Variablen 0, `this` = 0. Unbekanntes → Fehler (Animation wird übersprungen). */
export function molang(e: unknown): number {
  if (typeof e === 'number') return e
  if (typeof e !== 'string') throw new Error('kein Molang')
  const js = e
    .replace(/(variable|v|query|q|temp|t|context|c)\.\w+(\([^()]*\))?/gi, '0')
    .replace(/\bthis\b/gi, '0')
    .replace(/math\.(\w+)/gi, 'M.$1')
  if (/[A-Za-z_]/.test(js.replace(/M\.\w+/g, ''))) throw new Error('unbekannter Ausdruck')
  const M = {
    cos: (d: number) => Math.cos((d * Math.PI) / 180),
    sin: (d: number) => Math.sin((d * Math.PI) / 180),
    clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)),
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    sqrt: Math.sqrt,
    pi: Math.PI,
    min: Math.min,
    max: Math.max,
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    random: () => 0,
    mod: (a: number, b: number) => a % b
  }
  const wert = Number(new Function('M', `return (${js})`)(M))
  return Number.isFinite(wert) ? wert : 0
}

function vektor(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map((e) => molang(e))
  if (typeof v === 'number' || typeof v === 'string') {
    const x = molang(v)
    return [x, x, x]
  }
  return null // Keyframes: Ruhe = keine Änderung
}

export function grundhaltung(parts: Part[], anim: Anim, ziel = false): void {
  const nachName = new Map(parts.map((p) => [p.name, p]))
  const nachfahren = (wurzel: string): Part[] =>
    parts.filter((p) => {
      for (let q: Part | undefined = p; q; q = q.parent ? nachName.get(q.parent) : undefined) if (q.name === wurzel) return true
      return false
    })
  for (const [knochen, k] of Object.entries(anim.bones ?? {})) {
    const teil = nachName.get(knochenName(knochen, [0, 0, 0]))
    if (!teil) continue
    try {
      const r = vektor(k.rotation)
      const d = vektor(k.position)
      if (r) teil.rotation = teil.rotation.map((x, i) => x + (r[i] ?? 0)) as Vec
      if (d && ziel && teil.boxes[0]) {
        const b0 = teil.boxes[0]
        for (let i = 0; i < 3; i++) d[i] = d[i]! - (b0.origin[i]! + b0.size[i]! / 2)
      }
      if (d && d.some((x) => x !== 0))
        for (const q of nachfahren(teil.name)) {
          q.pivot = [q.pivot[0] + d[0]!, q.pivot[1] + d[1]!, q.pivot[2] + d[2]!]
          for (const x of q.boxes) x.origin = [x.origin[0] + d[0]!, x.origin[1] + d[1]!, x.origin[2] + d[2]!]
        }
    } catch {
      // unbekanntes Molang: diesen Knochen in Ruhe lassen
    }
  }
}

/**
 * Enderdrache: In den Daten nur ein Bausatz (je ein Hals-, Flügel-, Bein-Teil); im Spiel setzt der Code ihn zusammen
 * (DragonModel/EnderDragonRenderer): 5 Halssegmente, Kopf mit Kiefer, 12 Schwanzsegmente, gespiegelte Flügel mit
 * Spitzen, Beine mit Unterschenkel und Fuß. Lage nach dem Spielcode in Ruhe (Flügel leicht angehoben).
 */
export function baueDrache(vorlage: Part[]): Part[] {
  const t = new Map(vorlage.map((p) => [p.name, p]))
  const teile: Part[] = []
  const kopie = (quelle: string, name: string, d: Vec, o: { spiegeln?: boolean; parent?: string | null; pivot?: Vec; rotation?: Vec } = {}): void => {
    const p = t.get(quelle)
    if (!p) return
    const boxes = p.boxes.map((b) => {
      let x = b.origin[0] + d[0]
      if (o.spiegeln) x = -(x + b.size[0])
      return { ...b, origin: [x, b.origin[1] + d[1], b.origin[2] + d[2]] as Vec, mirror: o.spiegeln ? !b.mirror : b.mirror }
    })
    const pv = o.pivot ?? ([p.pivot[0] + d[0], p.pivot[1] + d[1], p.pivot[2] + d[2]] as Vec)
    teile.push({ name, parent: o.parent ?? null, pivot: o.spiegeln ? [-pv[0], pv[1], pv[2]] : pv, rotation: o.rotation ?? [0, 0, 0], boxes })
  }
  kopie('body', 'body', [0, 0, 0])
  for (let i = 0; i < 5; i++) kopie('neck', `neck${i}`, [0, -10 + 2.5 * i, -13 - 10 * i])
  kopie('head', 'head', [0, 2, -64])
  kopie('jaw', 'jaw', [0, 2, -64])
  for (let i = 0; i < 12; i++) kopie('neck', `tail${i}`, [0, -12 - 0.9 * i, 66 + 10 * i])
  for (const [seite, sp] of [['r', false], ['l', true]] as const) {
    const rz = -18 // gleiche Drehung: die gespiegelte Geometrie spiegelt die Neigung schon mit
    kopie('wing', `wing_${seite}`, [0, 0, 0], { spiegeln: sp, pivot: [-12, 19, 2], rotation: [0, 0, rz] })
    kopie('wingtip', `wingtip_${seite}`, [-12, -5, 0], { spiegeln: sp, parent: `wing_${seite}`, pivot: [-68, 19, 2], rotation: [0, 0, rz] })
    kopie('frontleg', `frontleg_${seite}`, [0, 0, 0], { spiegeln: sp })
    kopie('frontlegtip', `frontlegtip_${seite}`, [-12, -21, 3], { spiegeln: sp })
    kopie('frontfoot', `frontfoot_${seite}`, [-12, -41, 3], { spiegeln: sp })
    kopie('rearleg', `rearleg_${seite}`, [0, 0, 0], { spiegeln: sp })
    kopie('rearlegtip', `rearlegtip_${seite}`, [-16, -14, 40], { spiegeln: sp })
    kopie('rearfoot', `rearfoot_${seite}`, [-16, -45, 46], { spiegeln: sp })
  }
  return teile
}

/** Alte Vierbeiner-Modelle (Eisbär, Schaf, Katze …): Der Körper ist hochkant modelliert und liegt im Spiel immer um
 * 90° gedreht (Java ModelQuadruped). Greift nur, wenn nach den Animationen noch nichts gedreht ist. */
export function vierbeinerKoerper(parts: Part[]): void {
  const beine = parts.filter((p) => /leg/.test(p.name) && p.boxes.length)
  const koerper = parts.find((p) => p.name === 'body')
  const b = koerper?.boxes[0]
  if (!koerper || !b || beine.length < 4) return
  // Aufrechte Wesen (Creeper): der Kopf sitzt oben auf dem Körper – dann liegt der Körper nicht
  const kopf = parts.find((p) => p.name === 'head')?.boxes[0]
  const aufrecht = !!kopf && kopf.origin[1] >= b.origin[1] + b.size[1] - 0.5
  if (!aufrecht && koerper.rotation.every((r) => r === 0) && b.size[1] > b.size[2]) koerper.rotation = [90, 0, 0]
  // Liegt der Körper (±90°), hängen Beine und Kopf im Spiel nicht an ihm – sonst würden sie mitkippen
  if (Math.abs(Math.abs(koerper.rotation[0]) - 90) < 1)
    for (const p of parts) if (p.parent === 'body' && (/leg|head|tail/.test(p.name))) p.parent = null
}

/** Ausrüstung und Varianten-Teile gehören nicht zum Grundmodell (Sattel, Taschen, Zaumzeug, Rüstung …). */
export function ohneAusruestung(key: string, parts: Part[]): Part[] {
  const weg = (n: string): boolean =>
    /^(saddle|bag|bridle|rein|armor|chest|harness|mouth_saddle|head_saddle|headpiece)/.test(n) || (key !== 'mule' && /^mule_/.test(n)) || (key === 'mule' && /^ear\d$/.test(n))
  const raus = new Set(parts.filter((p) => weg(p.name)).map((p) => p.name))
  return parts.filter((p) => !raus.has(p.name) && !(p.parent && raus.has(p.parent)))
}

function pngGroesse(b: Buffer): [number, number] | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  if (b.length > 18) return [b.readUInt16LE(12), b.readUInt16LE(14)] // TGA-Kopf
  return null
}

async function text(url: string, fetcher: typeof fetch): Promise<string> {
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

/** Kommentare und nachgestellte Kommas (in Mojangs JSON erlaubt) entfernen. */
function jsonLocker(s: string): unknown {
  return JSON.parse(s.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'))
}

export interface MobImport {
  version: string
  /** Stand des Imports (IMPORT_FORMAT); fehlt bei alten Importen */
  format?: number
  tabelle: string
  anzahl: number
  fehler: string[]
}

/**
 * Stellt die Mob-Tabelle der neuesten Vorschau bereit. Prüft bei jedem Aufruf die Version (version.json) und importiert
 * neu, wenn es eine neuere gibt; ohne Internet bleibt die zuletzt importierte Tabelle in Gebrauch.
 */
export async function sichereMobs(lokal: string, o: { fetcher?: typeof fetch; onProgress?: (t: string) => void } = {}): Promise<MobImport> {
  return importiereMobs(lokal, o)
}

async function importiereMobs(lokal: string, o: { fetcher?: typeof fetch; onProgress?: (t: string) => void }): Promise<MobImport> {
  const fetcher = o.fetcher ?? fetch
  const merker = join(lokal, 'mc', 'mobs', 'aktuell.json')
  const alt = JSON.parse(await readFile(merker, 'utf8').catch(() => '{}')) as Partial<MobImport>
  let version: string
  try {
    version = (jsonLocker(await text(`${QUELLE}version.json`, fetcher)) as { latest: { version: string } }).latest.version
  } catch (err) {
    if (alt.tabelle && existsSync(alt.tabelle)) return alt as MobImport
    throw err
  }
  if (alt.version === version && alt.format === IMPORT_FORMAT && alt.tabelle && existsSync(alt.tabelle)) return alt as MobImport
  o.onProgress?.(`Lade alle Mobs der neuesten Minecraft-Vorschau (${version}) …`)
  const ziel = join(lokal, 'mc', 'mobs', version)
  const baum = JSON.parse(await text(BAUM, fetcher)) as { tree: { path: string }[] }
  const pfade = new Set(baum.tree.map((t) => t.path))
  const liste = (re: RegExp): string[] => [...pfade].filter((p) => re.test(p))
  const lade = async (pfad: string): Promise<unknown> => jsonLocker(await text(QUELLE + pfad, fetcher))
  const parallel = async <T, R>(xs: T[], f: (x: T) => Promise<R>, n = 12): Promise<R[]> => {
    const out: R[] = []
    for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(f))))
    return out
  }
  const geos = new Map<string, Geo>()
  for (const j of await parallel(liste(/^resource_pack\/models\/entity\/.*\.json$/), (p) => lade(p).catch(() => ({})))) for (const [k, v] of geometrienAus(j as Record<string, unknown>)) geos.set(k, v)
  for (const [k, v] of Object.entries(EINGEBAUT)) if (!geos.has(k)) geos.set(k, v)
  const anims = new Map<string, Anim>()
  for (const j of await parallel(liste(/^resource_pack\/animations\/.*\.json$/), (p) => lade(p).catch(() => ({})))) for (const [k, v] of Object.entries((j as { animations?: Record<string, Anim> }).animations ?? {})) anims.set(k, v)
  const entities = await parallel(liste(/^resource_pack\/entity\/.*\.json$/), async (p) => ({ p, j: (await lade(p).catch(() => null)) as Record<string, unknown> | null }))

  const tabelle: Record<string, unknown> = { _hinweis: `Automatisch aus Mojangs bedrock-samples (preview ${version}): Geometrie, Texturen, Grundhaltung.` }
  const fehler: string[] = []
  for (const { p, j } of entities) {
    const d = (j?.['minecraft:client_entity'] as { description?: Record<string, unknown> } | undefined)?.description
    if (!d) continue
    const key = String(d['identifier'] ?? '').replace(/^minecraft:/, '')
    if (!key || tabelle[key]) continue
    try {
      const texturen = (d['textures'] as Record<string, string> | undefined) ?? {}
      const tex = texturen[SONDERFAELLE[key]?.textur ?? 'default'] ?? texturen['default'] ?? Object.values(texturen)[0]
      const geoId = (d['geometry'] as Record<string, string> | undefined)?.['default'] ?? Object.values((d['geometry'] as Record<string, string>) ?? {})[0]
      if (!tex || !geoId) continue
      const geo = aufgeloest(geoId, geos)
      if (!geo || !geo.bones.length) throw new Error(`Geometrie ${geoId} fehlt`)
      const datei = ['.png', '.tga'].map((e) => `resource_pack/${tex}${e}`).find((x) => pfade.has(x))
      if (!datei) throw new Error(`Textur ${tex} fehlt`)
      const lokalTex = join(ziel, 'textures', datei.replace(/^resource_pack\//, ''))
      if (!existsSync(lokalTex)) {
        const res = await fetcher(QUELLE + datei)
        if (!res.ok) throw new Error(`Textur ${datei}: ${res.status}`)
        await mkdir(dirname(lokalTex), { recursive: true })
        await writeFile(lokalTex, Buffer.from(await res.arrayBuffer()))
      }
      const groesse = pngGroesse(await readFile(lokalTex))
      const gewandelt = wandle(geo)
      const scale = gewandelt.scale
      const parts = key === 'ender_dragon' ? baueDrache(gewandelt.parts) : ohneAusruestung(key, gewandelt.parts)
      // Grundhaltung: alle Animationen, die ohne Bedingung laufen (setup u. a.)
      const kurz = (d['animations'] as Record<string, string> | undefined) ?? {}
      const scripts = (d['scripts'] as { animate?: unknown[] } | undefined)?.animate ?? []
      const namen = new Set<string>()
      for (const s of scripts) if (typeof s === 'string') namen.add(s)
      for (const k of Object.keys(kurz)) if (/setup/i.test(k) && !/baby/i.test(k)) namen.add(k) // oft nur über einen Controller aktiv
      for (const n of namen) {
        const voll = kurz[n]
        if (!voll || !anims.has(voll) || key === 'ender_dragon') continue
        grundhaltung(parts, anims.get(voll)!, (SONDERFAELLE[key]?.ziel ?? []).some((z) => voll.includes(z)))
      }
      if (key !== 'ender_dragon') vierbeinerKoerper(parts)
      for (const [teil, off] of Object.entries(SONDERFAELLE[key]?.versatz ?? {})) {
        const t = parts.find((x) => x.name === teil)
        if (t) for (const b of t.boxes) b.origin = [b.origin[0] + off[0], b.origin[1] + off[1], b.origin[2] + off[2]]
      }
      // unter den Boden ragende Teile anheben (Ghast-Tentakel, Enderman-Beine)
      const unten = SONDERFAELLE[key]?.nichtAnheben ? 0 : Math.min(0, ...parts.flatMap((x) => x.boxes.map((b) => b.origin[1])))
      if (unten < 0)
        for (const x of parts) {
          x.pivot = [x.pivot[0], x.pivot[1] - unten, x.pivot[2]]
          for (const b of x.boxes) b.origin = [b.origin[0], b.origin[1] - unten, b.origin[2]]
        }
      let texSize = geo.tex
      if (groesse && groesse[0] === geo.tex[0] && groesse[1] === geo.tex[1] * 2) texSize = [groesse[0], groesse[1]]
      if (groesse && groesse[0] !== geo.tex[0] && groesse[0] / geo.tex[0] === groesse[1] / geo.tex[1]) texSize = geo.tex // HD-Textur, gleiche Aufteilung
      const hoehe = Math.max(...parts.flatMap((x) => x.boxes.map((b) => b.origin[1] + b.size[1])), 1)
      const eintrag: MobEintrag = { texture: lokalTex, tex_size: texSize, height_px: Math.round(hoehe * 100) / 100, quelle: `bedrock-samples preview ${p}`, parts }
      if (scale !== 1) eintrag.scale = Math.round(scale * 1000) / 1000
      tabelle[key] = eintrag
    } catch (err) {
      fehler.push(`${key}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  await mkdir(ziel, { recursive: true })
  const pfad = join(ziel, 'mobs.json')
  await writeFile(pfad, JSON.stringify(tabelle))
  const ergebnis: MobImport = { version, format: IMPORT_FORMAT, tabelle: pfad, anzahl: Object.keys(tabelle).length - 1, fehler }
  await writeFile(merker, JSON.stringify(ergebnis, null, 1))
  return ergebnis
}
