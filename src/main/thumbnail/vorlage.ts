// Herkunft: MoinStudio src/main/thumbnail/spielvorlage.ts (MIT), verallgemeinert auf Fotos und ohne Pflicht zur Bild-KI.
import { appendFile, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { z } from 'zod'
import { runBlender } from '../jobs/blender'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { sprachName, type ThumbDienste } from './job'
import { kiPruefung, technischePruefung } from './pruefung'
import { renderFoto, type Bericht } from './render'
import type { ThumbErgebnisDaten, ThumbPayload, VarianteErgebnis } from './typen'
import { liesJson, py, sicherePython } from './umgebung'

/**
 * Vorlagen-Modus (ROADMAP 4.5): die Person oder den Avatar in ein vorhandenes Thumbnail setzen, genau an die Stelle der
 * Person darin. Ablauf: Vorlage auf 16:9 bringen → Person entfernen und Lücke auffüllen (rembg + LaMa, lokal) →
 * Bild-KI (falls vorhanden) liest Pose, Blick, Licht, Gegenstand und Titel → Minecraft-Skin in Blender bzw. Foto
 * freigestellt an die Stelle → Titel der Vorlage wieder obendrauf. Vorlagen und Ergebnisse bleiben im Datenordner.
 */

type Box = [number, number, number, number]
const BoxZ = z.array(z.number()).length(4)
const PunktZ = z.array(z.number()).length(2)

const PersonZ = z.object({
  kopf: PunktZ,
  kopf_anteil: z.number(),
  pose: z.string().optional(),
  winkel: z.record(z.string(), z.unknown()).optional(),
  ansicht: z.enum(['vorn', 'hinten']).optional(),
  blick: z.number().optional()
})

export const VorlagenAnalyseZ = z.object({
  inhalt: z.string(),
  kopf: PunktZ,
  kopf_anteil: z.number(),
  pose: z.string().optional(),
  winkel: z.record(z.string(), z.unknown()).optional(),
  mimik: z.string().optional(),
  licht_seite: z.enum(['links', 'rechts']).optional(),
  ansicht: z.enum(['vorn', 'hinten']).optional(),
  ziel: PunktZ.optional(),
  blick: z.number().optional(),
  gegenstand: z.object({ box: BoxZ, suchwort: z.string(), hand: z.enum(['r', 'l']).optional() }).optional(),
  titel: z.array(z.object({ box: BoxZ, farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).optional(),
  weitere: z.array(PersonZ).optional()
})
export type VorlagenAnalyse = z.infer<typeof VorlagenAnalyseZ>

export const MIMIKEN = ['neutral', 'wuetend', 'traurig', 'erschrocken', 'muede', 'skeptisch', 'froh', 'schreiend']

const existiert = (p: string): Promise<boolean> => stat(p).then(
  () => true,
  () => false
)

/** Namen aller fertigen Posen aus blender/minecraft/posen.py */
export async function posenNamen(skripte: string): Promise<string[]> {
  const text = await readFile(join(skripte, 'minecraft', 'posen.py'), 'utf8').catch(() => '')
  return [...text.matchAll(/^ {4}"(\w+)": \{/gm)].map((m) => m[1]!)
}

/** Winkel einiger fertiger Posen als Beispiele für die KI (Text direkt aus posen.py) */
export async function posenBeispiele(skripte: string, namen: string[]): Promise<string> {
  const text = await readFile(join(skripte, 'minecraft', 'posen.py'), 'utf8').catch(() => '')
  return namen
    .map((n) => new RegExp(String.raw`^ {4}"${n}": (\{[\s\S]*?\n {4}\}),`, 'm').exec(text)?.[1])
    .map((b, i) => (b ? `${namen[i]}: ${b.replace(/\s+/g, ' ')}` : ''))
    .filter(Boolean)
    .join('\n')
}

/** Das beste CC0-Modell von Poly Haven zu einem Suchwort (Name, Tags, Kategorien), sonst null */
export function besterTreffer(assets: Record<string, { name?: string; tags?: string[]; categories?: string[] }>, suchwort: string): string | null {
  const worte = suchwort.toLowerCase().split(/[\s,_-]+/).filter((w) => w.length > 2)
  let bester: [string, number] | null = null
  for (const [id, a] of Object.entries(assets)) {
    const felder = [id, a.name ?? '', ...(a.tags ?? []), ...(a.categories ?? [])].map((x) => x.toLowerCase())
    const punkte = worte.reduce((n, w) => n + (id.includes(w) ? 3 : 0) + felder.filter((f) => f.includes(w)).length, 0)
    if (punkte > 0 && (!bester || punkte > bester[1])) bester = [id, punkte]
  }
  return bester?.[0] ?? null
}

/** Lädt ein Poly-Haven-Modell (glTF 1k, CC0) in den lokalen Ordner und trägt die Lizenz ins Protokoll ein */
export async function ladeRequisit(suchwort: string, props: string): Promise<string | null> {
  const liste = (await (await fetch('https://api.polyhaven.com/assets?t=models')).json()) as Record<string, { name?: string; tags?: string[]; categories?: string[] }>
  const id = besterTreffer(liste, suchwort)
  if (!id) return null
  const ordner = join(props, id)
  const dateien = (await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()) as { gltf?: Record<string, { gltf?: { url: string; include?: Record<string, { url: string }> } }> }
  const g = dateien.gltf?.['1k']?.gltf ?? dateien.gltf?.['2k']?.gltf
  if (!g) return null
  const ziel = join(ordner, g.url.split('/').pop()!)
  if (!(await existiert(ziel))) {
    const laden = async (url: string, pfad: string): Promise<void> => {
      await mkdir(join(pfad, '..'), { recursive: true })
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Poly Haven: ${url} → ${r.status}`)
      await writeFile(pfad, Buffer.from(await r.arrayBuffer()))
    }
    await laden(g.url, ziel)
    for (const [pfad, datei] of Object.entries(g.include ?? {})) await laden(datei.url, join(ordner, ...pfad.split('/')))
    await appendFile(join(props, 'lizenzen.md'), `- ${id} – Poly Haven (polyhaven.com/a/${id}), CC0, geladen ${new Date().toISOString().slice(0, 10)}\n`)
  }
  return ziel
}

/** Körper und Kopf nur in natürlichen Grenzen drehen */
export function begrenzeWinkel(w: Record<string, unknown>): Record<string, unknown> {
  const grenze: Record<string, number> = { koerper: 60, kopf: 70 }
  const neu: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(w)) {
    if (k === 'blick') continue
    if (grenze[k] && v && typeof v === 'object') {
      const g = { ...(v as Record<string, number>) }
      if (typeof g['drehen'] === 'number') g['drehen'] = Math.max(-grenze[k]!, Math.min(grenze[k]!, g['drehen']))
      neu[k] = g
    } else neu[k] = v
  }
  return neu
}

/**
 * Kopfgröße (Anteil der Bildhöhe) für einen Minecraft-Skin: so groß, dass die Figur (etwa 2,2 Kopfbreiten breit) die
 * entfernte Person weitgehend abdeckt. Ein Minecraft-Kopf ist ein Viertel der Figurhöhe (ein Mensch etwa ein Siebtel).
 */
export function kopfAnteil(geschaetzt: number | undefined, person: { box?: Box; hoehe?: number }): number {
  const basis = Math.min(0.7, Math.max(0.15, geschaetzt || 0.35, (person.hoehe ?? 0) * 0.25))
  const b = person.box
  const ausBreite = b ? ((b[2] - b[0]) * 1280) / 2.2 / 720 : 0
  return Math.min(0.6, Math.max(basis, Math.min(ausBreite, basis * 1.15)))
}

/** Deckt die Figur weniger als 55 % der entfernten Person ab, wird sie größer (höchstens Kopf 70 % der Bildhöhe) */
export function groesserBeiLuecke(kopf: number, deckung: number | undefined): number {
  if (deckung === undefined || deckung >= 0.55) return kopf
  const faktor = Math.min(1.6, Math.max(1.2, Math.sqrt(0.65 / Math.max(deckung, 0.01))))
  return Math.min(0.7, Math.round(kopf * faktor * 1000) / 1000)
}

/** Titel, die wirklich über der Person liegen: gültige Farbe und höchstens ein Drittel der Bildfläche */
export function echteTitel(a: Pick<VorlagenAnalyse, 'titel'>): { box: Box; farbe: string }[] {
  return (a.titel ?? []).filter((x) => x.box.length === 4 && (x.box[2]! - x.box[0]!) * (x.box[3]! - x.box[1]!) <= 0.33) as { box: Box; farbe: string }[]
}

export function titelArgumente(a: Pick<VorlagenAnalyse, 'titel'>): string[] {
  return echteTitel(a).map((x) => `farbe=${x.farbe}:${x.box.join(',')}`)
}

/** Freunde: an der Stelle weiterer Personen der Vorlage, sonst daneben auf der Seite mit mehr Platz */
export function freundePlaetze(a: Pick<VorlagenAnalyse, 'kopf' | 'kopf_anteil' | 'weitere' | 'ansicht'>, freunde: { skin: string | null; slim?: boolean | null }[]): Record<string, unknown>[] {
  const [u, v] = a.kopf as [number, number]
  const seite = u < 0.5 ? 1 : -1
  return freunde.map((f, i) => {
    const w = a.weitere?.[i]
    if (w)
      return {
        skin: f.skin,
        slim: f.slim ?? null,
        kopf: w.kopf,
        kopf_anteil: Math.min(0.6, Math.max(0.1, w.kopf_anteil)),
        pose: w.winkel && Object.keys(w.winkel).length ? begrenzeWinkel(w.winkel) : (w.pose ?? 'neutral'),
        ansicht: w.ansicht ?? 'vorn',
        ...(typeof w.blick === 'number' ? { blick: w.blick } : {})
      }
    const versatz = (i - (a.weitere?.length ?? 0) + 1) * 0.24
    return { skin: f.skin, slim: f.slim ?? null, kopf: [Math.min(0.9, Math.max(0.1, u + seite * versatz)), v + 0.02], kopf_anteil: a.kopf_anteil * 0.85, pose: 'neutral', ansicht: a.ansicht ?? 'vorn', blick: -seite * 15 }
  })
}

export function analysePrompt(posen: string[], beispiele: string, o: { minecraft: boolean; freunde: string[]; wunsch: string | null }): string {
  return `Die Person des Creators soll in dieses vorhandene Thumbnail, genau an die Stelle der Person darin${o.minecraft ? ' (als Minecraft-Figur)' : ' (als freigestelltes Foto)'}.
Bestimme (Bildkoordinaten 0–1, oben links = 0,0):
- inhalt: kurz, was das Thumbnail zeigt
- kopf: [u, v] Mitte des Kopfes der Person; kopf_anteil: Kopfhöhe samt Haaren als Anteil der Bildhöhe
${o.minecraft ? `- pose: passende Pose aus dieser Liste, falls eine genau passt: ${posen.join(', ')}
- winkel: sonst eigene Winkel wie in diesen Beispielen (drehen positiv = zur rechten Bildseite, heben 90 = nach vorn):
${beispiele}
- mimik: ${MIMIKEN.join(', ')}
- ansicht: "vorn" oder "hinten"; blick: Körperdrehung in Grad (0 = frontal, positiv = nach rechts)
- ziel: [u, v], falls die Person auf etwas zielt oder zeigt
- gegenstand: falls die Person etwas hält: box um den Gegenstand, suchwort (englisch, 1–2 Wörter), hand ("r" = im Bild linke Hand)
` : ''}- licht_seite: von welcher Seite das Hauptlicht kommt
- titel: nur Titel, Schriftzüge und Logos, die VOR der Person liegen, als {box, farbe der Buchstaben "#rrggbb"}; sonst leer
${o.freunde.length ? `- weitere: weitere Personen im Bild (höchstens ${o.freunde.length}), werden durch ${o.freunde.join(' und ')} ersetzt\n` : ''}${o.wunsch ? `\nWunsch des Creators: „${o.wunsch}“ – berücksichtige ihn.\n` : ''}`
}

async function analysiere(ki: KiSchicht | null, vorlage: string, prompt: string, ctx: JobContext<unknown>): Promise<VorlagenAnalyse | null> {
  if (!ki || !(await ki.verfuegbar(true))) return null
  try {
    return (await ki.frage({ name: 'vorlage-analyse', system: 'You analyse a thumbnail template precisely.', prompt, bilder: [vorlage], schema: VorlagenAnalyseZ, brauchtBilder: true, stufe: 'stark', maxAusgabe: 2000 }, ctx)).daten
  } catch {
    return null
  }
}

export async function vorlageJob(p: ThumbPayload, ctx: JobContext<{ fertig?: VarianteErgebnis[] }>, d: ThumbDienste): Promise<ThumbErgebnisDaten> {
  const c = ctx as JobContext<unknown>
  const u = p.umgebung
  await mkdir(p.ausgabe, { recursive: true })
  const original = join(p.ausgabe, `original${extname(p.start.quelle!).toLowerCase() || '.jpg'}`)
  await copyFile(p.start.quelle!, original)
  const pyU = await sicherePython(u, c, { lama: true })
  ctx.progress(4, t('thumb.schritt.vorlage'))
  const vorlage = join(p.ausgabe, 'vorlage.png')
  await py(pyU, join(u.skripte, 'vorlage_vorbereiten.py'), [original, vorlage], c)

  ctx.progress(8, t('thumb.schritt.original'))
  const mc = p.engine === 'minecraft'
  const freunde = p.figuren.slice(1)
  const a = await analysiere(d.ki, vorlage, analysePrompt(await posenNamen(u.skripte), await posenBeispiele(u.skripte, ['pistole', 'zeigen', 'panik', 'jubeln', 'nachdenken']), { minecraft: mc, freunde: freunde.map((f) => f.name), wunsch: p.start.beschreibung.trim() || null }), c)
  if (a) await writeFile(join(p.ausgabe, 'analyse.json'), JSON.stringify(a, null, 1))

  await ctx.yield()
  ctx.progress(25, t('thumb.schritt.personEntfernen'))
  const extra = a?.gegenstand?.box ? [a.gegenstand.box.join(',')] : []
  const ersetzt = Math.min(freunde.length, a?.weitere?.length ?? 0)
  await py(pyU, join(u.skripte, 'freistellen.py'), [vorlage, p.ausgabe, ...extra, `--personen=${1 + ersetzt}`, ...(a ? echteTitel(a).map((x) => `--titel=${x.farbe}:${x.box.join(',')}`) : [])], c)
  const person = await liesJson<{ box?: Box; hoehe?: number; kopf?: [number, number]; kopf_hoehe?: number }>(join(p.ausgabe, 'person.json'), {})
  const kopf = (a?.kopf as [number, number] | undefined) ?? person.kopf ?? [0.3, 0.35]
  const ich = p.figuren[0]!

  let bild: string | null = null
  let bericht: Bericht
  let fehler: string | null = null
  const warnungen: string[] = []
  const hintergrund = join(p.ausgabe, 'hintergrund.png')
  const render = join(p.ausgabe, 'render.png')
  if (mc) {
    if (!u.blender) throw new Error(t('thumb.fehlt.blender'))
    let requisit: string | null = null
    if (a?.gegenstand?.suchwort) {
      ctx.progress(40, t('thumb.schritt.requisit', { wort: a.gegenstand.suchwort }))
      requisit = await ladeRequisit(a.gegenstand.suchwort, join(u.werkzeugRoot, 'props')).catch(() => null)
    }
    const spec: Record<string, unknown> = {
      hintergrund,
      skin: ich.skin,
      slim: ich.slim,
      pose: a?.winkel && Object.keys(a.winkel).length ? begrenzeWinkel(a.winkel) : (a?.pose ?? 'neutral'),
      mimik: a?.mimik && MIMIKEN.includes(a.mimik) ? a.mimik : undefined,
      kopf,
      kopf_anteil: kopfAnteil(a?.kopf_anteil ?? person.kopf_hoehe, person),
      licht_seite: a?.licht_seite ?? 'rechts',
      ansicht: a?.ansicht ?? 'vorn',
      ...(a?.ziel ? { ziel: a.ziel } : {}),
      ...(typeof a?.blick === 'number' ? { blick: Math.max(-90, Math.min(90, a.blick)) } : {}),
      requisit: requisit ? { gltf: requisit, hand: a?.gegenstand?.hand ?? 'r', laenge_px: 10 } : undefined,
      ...(freunde.length ? { freunde: freundePlaetze({ kopf, kopf_anteil: a?.kopf_anteil ?? 0.3, weitere: a?.weitere, ansicht: a?.ansicht }, freunde) } : {}),
      maske: join(p.ausgabe, 'maske.png'),
      samples: Math.min(96, u.blender.samples),
      geraet: u.blender.geraet
    }
    // Vorabprüfung ohne Render: deckt die Figur die entfernte Person? Sonst größer (höchstens dreimal)
    for (let versuch = 0; versuch < 3; versuch++) {
      await writeFile(join(p.ausgabe, 'pruefung.json'), JSON.stringify({ ...spec, nur_pruefen: true }, null, 1))
      await runBlender({ exe: u.blender.exe, mesa: u.blender.mesa, script: join(u.skripte, 'render_vorlage.py'), args: [join(p.ausgabe, 'pruefung.json'), render, join(p.ausgabe, 'pruefung.bericht.json')] }, c)
      const pr = await liesJson<{ deckung?: number }>(join(p.ausgabe, 'pruefung.bericht.json'), {})
      const neu = groesserBeiLuecke(spec['kopf_anteil'] as number, pr.deckung)
      if (neu === spec['kopf_anteil']) break
      spec['kopf_anteil'] = neu
    }
    await writeFile(join(p.ausgabe, 'spec.json'), JSON.stringify(spec, null, 1))
    ctx.progress(55, t('thumb.schritt.variante', { nr: 1, von: 1, titel: a?.inhalt ?? '' }))
    const r = await runBlender({ exe: u.blender.exe, mesa: u.blender.mesa, script: join(u.skripte, 'render_vorlage.py'), args: [join(p.ausgabe, 'spec.json'), render, join(p.ausgabe, 'bericht.json')] }, c)
    const b = await liesJson<Bericht & { deckung?: number }>(join(p.ausgabe, 'bericht.json'), {})
    bericht = b
    if (b.deckung !== undefined && b.deckung < 0.45) warnungen.push(t('thumb.vorlage.deckung', { anteil: Math.round(b.deckung * 100) }))
    if (r.code === 0 && !b.fehler) bild = render
    else fehler = b.fehler ?? `Blender ${r.code}`
  } else {
    // Foto: Person freigestellt an die Stelle der alten Person, Kopfgröße wie dort
    const kopfAnt = Math.min(0.6, Math.max(0.12, a?.kopf_anteil ?? person.kopf_hoehe ?? 0.3))
    const personen = [
      { id: ich.id, bild: ich.fotos[0], freistellen: true, modell: ich.mensch ? 'u2net_human_seg' : 'isnet-general-use', art: ich.mensch ? 'foto' : 'bild', mitte_x: kopf[0], kopf_y: kopf[1], kopf_anteil: kopfAnt, rand: 2 },
      ...freunde.map((f, i) => {
        const w = a?.weitere?.[i]
        return { id: f.id, bild: f.fotos[0], freistellen: true, modell: f.mensch ? 'u2net_human_seg' : 'isnet-general-use', art: f.mensch ? 'foto' : 'bild', mitte_x: w?.kopf[0] ?? Math.min(0.9, kopf[0] + 0.25 * (i + 1)), kopf_y: w?.kopf[1] ?? kopf[1] + 0.02, kopf_anteil: w?.kopf_anteil ?? kopfAnt * 0.85, rand: 2 }
      })
    ].filter((x) => x.bild)
    ctx.progress(55, t('thumb.schritt.variante', { nr: 1, von: 1, titel: a?.inhalt ?? '' }))
    const r = await renderFoto(pyU, u, { breite: 1280, hoehe: 720, hintergrund: { art: 'bild', pfad: hintergrund }, personen, licht_angleichen: 0.3, look: { kontrast: 1.02, saettigung: 1.02, vignette: 0 } }, join(p.ausgabe, 'variante-1'), c)
    bericht = r.bericht
    fehler = r.fehler
    if (r.roh) {
      await copyFile(r.roh, render)
      bild = render
    }
  }
  if (bild && a && titelArgumente(a).length) {
    ctx.progress(90, t('thumb.schritt.titel'))
    const fertigBild = join(p.ausgabe, 'fertig.png')
    await py(pyU, join(u.skripte, 'vorlage_titel.py'), [vorlage, bild, fertigBild, ...titelArgumente(a), `--maske=${join(p.ausgabe, 'maske.png')}`], c).then(
      () => (bild = fertigBild),
      () => undefined
    )
  }
  const technisch = bild ? await technischePruefung(bild, bericht, { textBoxen: [], logoBox: null, engineWarnungen: [...(bericht.warnungen ?? []), ...warnungen] }) : []
  const kiB = bild ? await kiPruefung(d.ki, bild, { beschreibung: a?.inhalt ?? p.start.beschreibung, sprache: sprachName(p.sprache) }, c) : null
  ctx.progress(100, t('jobs.schritt.fertig'))
  return {
    varianten: [
      {
        titel: t('thumb.vorlage.titel', { inhalt: a?.inhalt ?? '' }).slice(0, 90),
        warum: a ? a.inhalt : t('thumb.vorlage.ohneKi'),
        vorbild: 'vorlage',
        bild,
        roh: render,
        spec: join(p.ausgabe, mc ? 'spec.json' : 'variante-1.spec.json'),
        ebenen: mc ? null : join(p.ausgabe, 'variante-1.ebenen'),
        bericht: join(p.ausgabe, mc ? 'bericht.json' : 'variante-1.bericht.json'),
        texte: [],
        schriftAssets: null,
        engine: p.engine,
        pruefung: { technisch: technisch.map((b) => b.text), ki: kiB ? kiB.map((b) => b.text) : null, korrekturen: 0 },
        fehler
      }
    ]
  }
}
