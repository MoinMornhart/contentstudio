// Herkunft des Minecraft-Teils: MoinStudio src/main/thumbnail/reaktion.ts (MIT), verallgemeinert auf Fotos.
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { z } from 'zod'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { runBlender } from '../jobs/blender'
import { t } from '../i18n'
import { sprachName, type ThumbDienste } from './job'
import { technischePruefung, kiPruefung } from './pruefung'
import { renderFoto, setzeTextUndLogo, type Bericht } from './render'
import type { ThumbErgebnisDaten, ThumbPayload, VarianteErgebnis } from './typen'
import { liesJson, sicherePython } from './umgebung'

/**
 * Reaction-Thumbnails (ROADMAP 4.5/4.6, Stilbuch Minecraft 14): Das Original-Thumbnail füllt das Bild, die Person
 * (Minecraft-Skin in Blender oder freigestelltes Foto) steht in einer Hälfte, dazu genau ein großes Wort. Die Bild-KI
 * erkennt das Wichtigste im Original und wählt Seite und Wort; ohne Bild-KI gelten die Angaben des Creators.
 */

export const GEFUEHLE: Record<string, { mimik: string; posen: string[] }> = {
  schockiert: { mimik: 'erschrocken', posen: ['neutral', 'panik', 'schreck', 'zeigen'] },
  lachend: { mimik: 'froh', posen: ['neutral', 'jubeln', 'zeigen', 'siegesfaust'] },
  begeistert: { mimik: 'froh', posen: ['neutral', 'siegesfaust', 'jubeln', 'zeigen'] },
  wuetend: { mimik: 'wuetend', posen: ['neutral', 'genervt', 'zeigen', 'achselzucken'] },
  traurig: { mimik: 'traurig', posen: ['neutral', 'muede', 'blick_runter', 'achselzucken'] },
  cringe: { mimik: 'skeptisch', posen: ['neutral', 'genervt', 'kopfkratzen', 'achselzucken'] },
  skeptisch: { mimik: 'skeptisch', posen: ['neutral', 'nachdenken', 'genervt', 'kopfkratzen'] },
  muede: { mimik: 'muede', posen: ['neutral', 'muede', 'kopfkratzen'] },
  neugierig: { mimik: 'neutral', posen: ['neutral', 'nachdenken', 'blick_zum_ding', 'zeigen', 'winken'] }
}

/** Freie Worte („bin schockiert“, „lol“) auf ein Gefühl abbilden (Deutsch und Englisch) */
export function gefuehlAus(text: string | null | undefined): string | null {
  if (!text) return null
  const x = text.toLowerCase().replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü')
  const regeln: [RegExp, string][] = [
    [/schock|entsetz|krass|omg|fassungslos|shock/, 'schockiert'],
    [/lach|witzig|lustig|haha|lol|funny|laugh/, 'lachend'],
    [/begeister|hype|geil|freu|excit|happy/, 'begeistert'],
    [/wut|wüt|sauer|aggro|angry|mad/, 'wuetend'],
    [/traurig|wein|schade|sad/, 'traurig'],
    [/cringe|peinlich|fremdschäm|awkward/, 'cringe'],
    [/skeptisch|fake|zweifel|sus|doubt/, 'skeptisch'],
    [/müde|gähn|langweil|tired|bored/, 'muede'],
    [/neugierig|spannend|was ist|curious/, 'neugierig']
  ]
  return regeln.find(([re]) => re.test(x))?.[1] ?? null
}

/** Seite der Person: immer gegenüber dem wichtigen Punkt (KI-Wahl gilt nur, wenn der Punkt in der Mitte liegt) */
export function seiteFuer(vorschlag: string | undefined, wichtig: number[] | undefined): 'links' | 'rechts' {
  const u = wichtig?.length === 2 ? wichtig[0]! : undefined
  if (u !== undefined && Math.abs(u - 0.5) > 0.04) return u > 0.5 ? 'links' : 'rechts'
  return vorschlag === 'rechts' ? 'rechts' : 'links'
}

/** Nächste Pose: erste passende, die unter den letzten fünf nicht vorkam */
export function naechstePose(kandidaten: string[], zuletzt: string[]): string {
  return kandidaten.find((p) => !zuletzt.slice(-5).includes(p)) ?? kandidaten[zuletzt.length % kandidaten.length]!
}

const AnalyseZ = z.object({
  inhalt: z.string(),
  wichtig: z.array(z.number()).length(2),
  seite: z.enum(['links', 'rechts']),
  wort: z.string(),
  gefuehl: z.enum(Object.keys(GEFUEHLE) as [string, ...string[]]),
  sperren: z.array(z.array(z.number()).length(4)).max(8).optional()
})
type Analyse = z.infer<typeof AnalyseZ>

async function analysiereOriginal(ki: KiSchicht | null, original: string, p: ThumbPayload, ctx: JobContext<unknown>): Promise<Analyse | null> {
  if (!ki || !(await ki.verfuegbar(true))) return null
  const vorgabe = gefuehlAus(p.start.gefuehl)
  try {
    const e = await ki.frage(
      {
        name: 'reaktion-analyse',
        system: 'You analyse the original thumbnail for a reaction video thumbnail.',
        prompt: `Der Creator (Kanal ${p.kanal.name}) reagiert auf dieses Bild. Die Person kommt groß in eine Bildhälfte, das Original füllt das Bild dahinter.
Bestimme: inhalt (kurz, worum es geht), wichtig [u, v] (0–1, oben links 0,0: das wichtigste Detail), seite (links/rechts: wo im Original am wenigsten Wichtiges ist), wort (genau ein kurzes Wort oder eine Zahl in Großbuchstaben, höchstens 10 Zeichen, in der Sprache ${sprachName(p.kanal.sprache)}, nicht den Titel wiederholen), gefuehl (${vorgabe ? `„${vorgabe}“ ist vorgegeben` : Object.keys(GEFUEHLE).join(', ')}), sperren (Kästen [x0, y0, x1, y1] um Titel, Logos und Gesichter im Original, die kein Text überdecken darf).`,
        bilder: [original],
        schema: AnalyseZ,
        brauchtBilder: true,
        stufe: 'stark',
        maxAusgabe: 1000
      },
      ctx
    )
    return e.daten
  } catch {
    return null
  }
}

export async function reaktionJob(p: ThumbPayload, ctx: JobContext<{ fertig?: VarianteErgebnis[] }>, d: ThumbDienste): Promise<ThumbErgebnisDaten> {
  const c = ctx as JobContext<unknown>
  const u = p.umgebung
  await mkdir(p.ausgabe, { recursive: true })
  const quelle = p.start.quelle!
  const original = join(p.ausgabe, `original${extname(quelle).toLowerCase() || '.jpg'}`)
  await copyFile(quelle, original)
  ctx.progress(5, t('thumb.schritt.original'))
  const a = await analysiereOriginal(d.ki, original, p, c)
  const gefuehl = gefuehlAus(p.start.gefuehl) ?? (a?.gefuehl && GEFUEHLE[a.gefuehl] ? a.gefuehl : 'schockiert')
  const g = GEFUEHLE[gefuehl]!
  const seite = seiteFuer(a?.seite, a?.wichtig)
  const wort = (p.start.wort ?? a?.wort ?? '').toUpperCase().slice(0, 12)
  const ich = p.figuren[0]!
  const freunde = p.figuren.slice(1)
  const varianten: VarianteErgebnis[] = [...(ctx.checkpoint?.fertig ?? [])]

  // Posen-Gedächtnis (nur Minecraft): jedes Mal eine neue Pose
  const gedaechtnis = join(p.ausgabe, '..', 'reaktion-posen.json')
  const zuletzt = await liesJson<string[]>(gedaechtnis, [])
  const pose1 = naechstePose(g.posen, zuletzt)
  const pose2 = naechstePose(g.posen.filter((x) => x !== pose1), [...zuletzt, pose1])
  if (p.engine === 'minecraft') await writeFile(gedaechtnis, JSON.stringify([...zuletzt, pose1].slice(-20)))

  const plaene = [
    { titel: `${wort || 'Reaction'} – ${gefuehl}`, pose: pose1, kopf: 14, foto: 0 },
    { titel: t('thumb.reaktion.variante2'), pose: pose2, kopf: 0, foto: 1 }
  ]
  const pyU = p.engine === 'minecraft' ? null : await sicherePython(u, c)
  for (let i = varianten.length; i < plaene.length; i++) {
    const pl = plaene[i]!
    await ctx.yield()
    ctx.progress(30 + i * 35, t('thumb.schritt.variante', { nr: i + 1, von: 2, titel: pl.titel }))
    const basis = join(p.ausgabe, `variante-${i + 1}`)
    let bild: string | null = null
    let bericht: Bericht
    let fehler: string | null = null
    let textBoxen: [number, number, number, number][] = []
    if (p.engine === 'minecraft') {
      if (!u.blender) throw new Error(t('thumb.fehlt.blender'))
      const spec = {
        hintergrund: original,
        skin: ich.skin,
        slim: ich.slim,
        seite,
        mimik: g.mimik,
        pose: pl.pose,
        sperren: (a?.sperren ?? []).filter((b) => b.length === 4),
        ...(freunde.length ? { freunde: freunde.filter((f) => f.skin).map((f) => ({ skin: f.skin, slim: f.slim, pose: 'neutral' })), kopf_anteil: 0.3 } : {}),
        zufall: Math.floor(Math.random() * 1_000_000),
        kopf_drehung: pl.kopf,
        wort,
        schrift: p.marke.schrift ?? 'C:/Windows/Fonts/ariblk.ttf',
        pfeil_ziel: a?.wichtig,
        logo: p.marke.logo,
        samples: Math.min(64, u.blender.samples),
        geraet: u.blender.geraet
      }
      await writeFile(`${basis}.spec.json`, JSON.stringify(spec, null, 1))
      const r = await runBlender({ exe: u.blender.exe, mesa: u.blender.mesa, script: join(u.skripte, 'render_reaktion.py'), args: [`${basis}.spec.json`, `${basis}.png`, `${basis}.bericht.json`] }, c)
      bericht = await liesJson<Bericht>(`${basis}.bericht.json`, {})
      if (r.code === 0 && !bericht.fehler) bild = `${basis}.png`
      else fehler = bericht.fehler ?? `Blender ${r.code}`
    } else {
      // Foto: Original als Hintergrund, Person freigestellt auf der freien Seite, Freunde daneben
      const personen = [ich, ...freunde].map((f, fi) => ({
        id: f.id,
        bild: f.fotos[(pl.foto + fi) % Math.max(1, f.fotos.length)],
        freistellen: true,
        modell: f.mensch ? 'u2net_human_seg' : 'isnet-general-use',
        art: f.mensch ? 'foto' : 'bild',
        seite: fi === 0 ? seite : seite === 'links' ? 'links' : 'rechts',
        mitte_x: (seite === 'links' ? 0.2 : 0.8) + (fi === 0 ? 0 : (seite === 'links' ? 1 : -1) * 0.2 * fi),
        kopf_anteil: fi === 0 ? 0.42 : 0.3,
        kopf_y: 0.45,
        rand: 3
      }))
      const r = await renderFoto(pyU!, u, { breite: 1280, hoehe: 720, hintergrund: { art: 'bild', pfad: original, abdunkeln: 0.15, unschaerfe: 1 }, personen: personen.filter((x) => x.bild), licht_angleichen: 0.15, look: { kontrast: 1.06, saettigung: 1.1, vignette: 0.25 } }, basis, c)
      bericht = r.bericht
      fehler = r.fehler
      if (r.roh) {
        // Sperren aus dem Original (Titel, Gesichter) zusätzlich als Figuren, damit der Text sie meidet
        const mitSperren: Bericht = { ...bericht, figuren: { ...(bericht.figuren ?? {}), ...Object.fromEntries((a?.sperren ?? []).map((b, k) => [`original-${k}`, { kopf_box: b as [number, number, number, number] }])) } }
        const tl = await setzeTextUndLogo(u, pyU, r.roh, mitSperren, { texte: wort ? [{ text: wort }] : [], schrift: p.marke.schrift, farben: p.marke.farben, logo: p.marke.logo, zufall: i }, basis, c)
        bild = tl.bild
        textBoxen = tl.textBoxen
      }
    }
    const technisch = bild ? await technischePruefung(bild, bericht, { textBoxen, logoBox: null, engineWarnungen: bericht.warnungen ?? [] }) : []
    const ki = bild ? await kiPruefung(d.ki, bild, { beschreibung: `Reaction: ${a?.inhalt ?? ''}`, sprache: sprachName(p.sprache) }, c) : null
    varianten.push({
      titel: pl.titel,
      warum: a?.inhalt ?? t('thumb.reaktion.ohneKi'),
      vorbild: 'reaktion',
      bild,
      roh: p.engine === 'minecraft' ? bild : `${basis}.roh.png`,
      spec: `${basis}.spec.json`,
      ebenen: p.engine === 'minecraft' ? null : `${basis}.ebenen`,
      bericht: `${basis}.bericht.json`,
      texte: p.engine === 'minecraft' || !wort ? [] : [{ text: wort }],
      schriftAssets: null,
      engine: p.engine,
      pruefung: { technisch: technisch.map((b) => b.text), ki: ki ? ki.map((b) => b.text) : null, korrekturen: 0 },
      fehler
    })
    await ctx.save({ fertig: varianten })
  }
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { varianten }
}
