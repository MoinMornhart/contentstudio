// Herkunft des Minecraft-Teils: MoinStudio src/main/thumbnail/job.ts (MIT), verallgemeinert auf alle Engines.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { KiAnalyseSchema, type Engine } from '@shared/thumbnail'
import { liesBild } from '../bild/rohbild'
import { analysiere } from '../bild/analyse'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { lokalText, seiteAus, type AuftragsVorbildDaten, type StilKontext } from './kontext'
import { sichereMcAssets } from './minecraft/assets'
import { ladeKatalog } from './minecraft/katalog'
import { sichereMobs } from './minecraft/mobimport'
import { wendeVorbilderAn } from './nachbearbeitung'
import { allgemeinOhneKi, allgemeinPrompt, AllgemeinPlanZ, AllgemeinVarianteZ, pruefeAllgemein, type AllgemeinPlan, type AllgemeinVariante } from './planung/allgemein'
import { ernsteWarnungen, korrekturPrompt, mcOhneKi, McPlanZ, mcPrompt, pruefePlan, pruefeSzene, SzeneAntwortZ, type McPlan, type McPlanEingabe, type Szene } from './planung/minecraft'
import { autoKorrektur, kiPruefung, technischePruefung, type Befund } from './pruefung'
import { minecraftEbenen, renderFoto, renderMinecraft, renderModell, setzeTextUndLogo, type Bericht } from './render'
import type { FigurDaten, ThumbErgebnisDaten, ThumbPayload, VarianteErgebnis } from './typen'
import { sicherePython } from './umgebung'

/** Höchstens so viele Korrekturen je Variante nach der Selbstprüfung */
const KORREKTUREN = 2

export interface Checkpoint {
  auftrag?: AuftragsVorbildDaten[]
  mcPlan?: McPlan
  plan?: AllgemeinPlan
  /** Foto je Variante und Person (Index in FigurDaten.fotos) */
  fotoWahl?: Record<string, number[]>
  fertig?: VarianteErgebnis[]
}

export interface ThumbDienste {
  ki: KiSchicht | null
}

export const sprachName = (code: string, anzeige = 'de'): string => {
  try {
    return new Intl.DisplayNames([anzeige], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Auftrags-Vorbilder ansehen: Bild-KI beschreibt sie, sonst die lokale Messung (ROADMAP 4.2) */
export async function sieheAuftragsVorbilder(auftrag: AuftragsVorbildDaten[], ki: KiSchicht | null, ctx?: JobContext<unknown>): Promise<AuftragsVorbildDaten[]> {
  const mitBild = ki ? await ki.verfuegbar(true) : false
  const out: AuftragsVorbildDaten[] = []
  for (const a of auftrag) {
    const lokal = a.lokal ?? analysiere(await liesBild(a.pfad))
    let beschreibung = a.beschreibung || lokalText(lokal)
    let seite = a.seite ?? seiteAus(lokal)
    if (mitBild && !a.beschreibung && ki) {
      try {
        const e = await ki.frage(
          { name: 'auftrags-vorbild', system: 'You describe a reference thumbnail precisely and briefly.', prompt: 'Beschreibe dieses Referenzbild für einen Thumbnail-Auftrag.', bilder: [a.pfad], schema: KiAnalyseSchema, brauchtBilder: true, stufe: 'schnell', maxAusgabe: 1200 },
          ctx
        )
        const k = e.daten
        beschreibung = `${k.zeigt}. Aufbau: ${k.bildaufbau}. Figur: ${k.figur.position}, Kopf ${Math.round(k.figur.kopfAnteil * 100)} % der Bildhöhe, ${k.figur.pose}, ${k.figur.ausdruck}. Kamera: ${k.kamera}. Farben: ${k.farben}. Licht: ${k.licht}. Text: ${k.text.vorhanden ? `${k.text.woerter} Wörter, ${k.text.stil}, ${k.text.position}` : 'keiner'}. Messwerte: ${lokalText(lokal)}`
        if (k.figur.position !== 'keine') seite = k.figur.position
      } catch {
        // ohne Beschreibung bleibt die Messung
      }
    }
    out.push({ ...a, lokal, beschreibung, seite })
  }
  return out
}

/** Stil-Kontext mit den angesehenen Auftrags-Vorbildern */
const mitAuftrag = (stil: StilKontext, auftrag: AuftragsVorbildDaten[]): StilKontext => ({ ...stil, auftrag })

export async function thumbnailJob(p: ThumbPayload, ctx: JobContext<Checkpoint>, d: ThumbDienste): Promise<ThumbErgebnisDaten> {
  const c = ctx as JobContext<unknown>
  await mkdir(p.ausgabe, { recursive: true })
  const cp: Checkpoint = { ...(ctx.checkpoint ?? {}) }
  const speichere = (): Promise<void> => ctx.save(cp)

  ctx.progress(2, t('thumb.schritt.vorbilder'))
  if (!cp.auftrag) {
    cp.auftrag = await sieheAuftragsVorbilder(p.stil.auftrag, d.ki, c)
    await speichere()
  }
  const stil = mitAuftrag(p.stil, cp.auftrag)
  const kiDa = d.ki ? (await d.ki.kandidaten()).length > 0 : false

  if (p.engine === 'minecraft') return minecraftLauf(p, ctx, d, stil, cp, speichere, kiDa)
  return allgemeinLauf(p, ctx, d, stil, cp, speichere, kiDa)
}

// --- Minecraft ------------------------------------------------------------------------------------------------

async function minecraftLauf(p: ThumbPayload, ctx: JobContext<Checkpoint>, d: ThumbDienste, stil: StilKontext, cp: Checkpoint, speichere: () => Promise<void>, kiDa: boolean): Promise<ThumbErgebnisDaten> {
  const c = ctx as JobContext<unknown>
  const u = p.umgebung
  ctx.progress(4, t('thumb.schritt.minecraft'))
  const mc = await sichereMcAssets(join(u.werkzeugRoot, 'mc'), { mojangErlaubt: u.mojangErlaubt, onProgress: (x) => ctx.progress(null, x) })
  const mobs = await sichereMobs(u.werkzeugRoot, { onProgress: (x) => ctx.progress(null, x) })
  const katalog = await ladeKatalog(u.skripte, mobs.tabelle, join(mc.assets, 'models', 'block'))
  const vorlage = await readFile(join(u.prompts, 'thumbnail-minecraft.md'), 'utf8')
  const figuren = p.figuren.map((f) => ({ id: f.id, name: f.name }))
  const ids = figuren.map((f) => f.id)
  const eingabe: McPlanEingabe = {
    beschreibung: p.start.beschreibung,
    kanal: p.kanal.name,
    figuren,
    anzahl: p.start.anzahl,
    katalog,
    stil,
    sprache: sprachName(p.sprache),
    kanalsprache: sprachName(p.kanal.sprache)
  }

  if (!cp.mcPlan) {
    ctx.progress(8, t('thumb.schritt.plan'))
    cp.mcPlan = kiDa && d.ki ? await planeMinecraft(d.ki, vorlage, eingabe, ids, c) : mcOhneKi(figuren, stil.vorbilder[0]?.id ?? 'frei')
    await speichere()
    await writeFile(join(p.ausgabe, 'plan.json'), JSON.stringify({ engine: 'minecraft', plan: cp.mcPlan }, null, 1))
  }
  const plan = cp.mcPlan
  const fertig: VarianteErgebnis[] = [...(cp.fertig ?? [])]
  const skins = new Map(p.figuren.map((f) => [f.id, f]))

  for (let i = fertig.length; i < plan.varianten.length; i++) {
    await ctx.yield()
    const v = plan.varianten[i]!
    const anteil = (x: number): number => Math.round(12 + ((i + x) / plan.varianten.length) * 86)
    let szeneAktuell: Szene = v.szene
    let bestes: { ergebnis: VarianteErgebnis; ernst: number } | null = null
    let renderFehler: string | null = null
    for (let versuch = 0; versuch <= KORREKTUREN; versuch++) {
      await ctx.yield()
      ctx.progress(anteil(versuch * 0.3), t('thumb.schritt.variante', { nr: i + 1, von: plan.varianten.length, titel: v.titel }))
      const basis = join(p.ausgabe, `variante-${i + 1}.v${versuch}`)
      const szene = structuredClone(szeneAktuell) as Szene & { figuren: { id: string; skin?: string; slim?: boolean | null }[] }
      for (const f of szene.figuren) {
        const s = skins.get(f.id)
        f.skin = s?.skin ?? join(mc.textures, 'entity', 'player', 'wide', 'steve.png')
        if (s?.slim !== undefined && s.slim !== null) f.slim = s.slim
      }
      szene['mob_tabelle'] = mobs.tabelle
      const r = await renderMinecraft(u, szene, mc.textures, basis, c)
      if (!r.roh) {
        renderFehler = r.fehler
        break
      }
      let roh = r.roh
      if (await wendeVorbilderAn(roh, stil.auftrag, `${basis}.vorbild.png`)) roh = `${basis}.vorbild.png`
      await minecraftEbenen(roh, basis)
      const tl = await setzeTextUndLogo(u, null, roh, r.bericht, { texte: v.text ?? [], minecraftAssets: mc.assets, logo: p.marke.logo }, basis, c)
      const befunde = await technischePruefung(tl.bild, r.bericht, {
        textBoxen: tl.textBoxen,
        logoBox: tl.logoBox,
        engineWarnungen: [...(r.bericht.warnungen ?? []), ...tl.warnungen],
        ernstMuster: (w) => ernsteWarnungen([w]).length > 0
      })
      const ki = await kiPruefung(d.ki, tl.bild, { beschreibung: p.start.beschreibung, sprache: sprachName(p.sprache) }, c)
      const alle = [...befunde, ...(ki ?? [])]
      const ernst = alle.filter((b) => b.ernst)
      const ergebnis = variante(v, tl.bild, roh, `${basis}.szene.json`, `${basis}.ebenen`, 'minecraft', befunde, ki, versuch, v.text ?? [], mc.assets)
      if (!bestes || ernst.length < bestes.ernst) bestes = { ergebnis, ernst: ernst.length }
      if (!ernst.length || versuch === KORREKTUREN || !kiDa || !d.ki) break
      // Die KI korrigiert die Szene anhand des Prüfberichts
      try {
        const e = await d.ki.frage({ name: 'thumbnail-korrektur', system: SYSTEM_PLAN, prompt: korrekturPrompt(vorlage, eingabe, { ...v, szene: szeneAktuell }, ernst.map((b) => b.text), r.bericht), schema: SzeneAntwortZ, stufe: 'stark', maxAusgabe: 6000 }, c)
        if (pruefeSzene(e.daten.szene, katalog, ids).length) break
        szeneAktuell = e.daten.szene
      } catch {
        break
      }
    }
    fertig.push(bestes?.ergebnis ?? fehlerVariante(v, 'minecraft', renderFehler))
    cp.fertig = fertig
    await speichere()
  }
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { varianten: fertig }
}

const SYSTEM_PLAN = 'You plan video thumbnails as structured JSON for an automatic renderer. Follow the catalogue and rules exactly; never invent ids that are not listed.'

async function planeMinecraft(ki: KiSchicht, vorlage: string, e: McPlanEingabe, ids: string[], ctx: JobContext<unknown>): Promise<McPlan> {
  let prompt = mcPrompt(vorlage, e)
  let letzte: McPlan | null = null
  for (let versuch = 0; versuch < 2; versuch++) {
    const erg = await ki.frage({ name: 'thumbnail-plan', system: SYSTEM_PLAN, prompt, schema: McPlanZ, stufe: 'stark', maxAusgabe: 12000 }, ctx)
    const plan = erg.daten
    const fehler = pruefePlan(plan, e.katalog, ids, e.stil.vorbilder)
    // Varianten mit unlösbaren Fehlern fallen weg, statt den ganzen Auftrag scheitern zu lassen
    const kaputt = new Set(fehler.map((f) => Number(/^Variante (\d+)/.exec(f)?.[1] ?? 0) - 1))
    letzte = { varianten: plan.varianten.filter((_, i) => !kaputt.has(i)) }
    if (!fehler.length) return letzte
    prompt = `${mcPrompt(vorlage, e)}\n\n# Korrektur\n\nDein letzter Plan hatte diese Fehler, behebe sie:\n${fehler.map((f) => `- ${f}`).join('\n')}`
  }
  if (!letzte?.varianten.length) throw new Error(t('thumb.fehler.keinPlan'))
  return letzte
}

// --- Foto, 3D-Modell, Grafik --------------------------------------------------------------------------------

async function allgemeinLauf(p: ThumbPayload, ctx: JobContext<Checkpoint>, d: ThumbDienste, stil: StilKontext, cp: Checkpoint, speichere: () => Promise<void>, kiDa: boolean): Promise<ThumbErgebnisDaten> {
  const c = ctx as JobContext<unknown>
  const u = p.umgebung
  const engine = p.engine as Exclude<Engine, 'minecraft'>
  ctx.progress(4, t('thumb.schritt.bildwerkzeuge'))
  const pyU = await sicherePython(u, c)
  const vorlage = await readFile(join(u.prompts, 'thumbnail-allgemein.md'), 'utf8')
  const ids = p.figuren.map((f) => f.id)
  const eingabe = {
    engine,
    beschreibung: p.start.beschreibung,
    kanal: p.kanal.name,
    plattform: p.kanal.plattform,
    richtungen: p.kanal.richtungen,
    figuren: p.figuren.map((f) => ({ id: f.id, name: f.name, fotos: f.fotos.length })),
    anzahl: p.start.anzahl,
    stil,
    hintergrund: !!p.hintergrund,
    sprache: sprachName(p.sprache),
    kanalsprache: sprachName(p.kanal.sprache)
  }
  if (!cp.plan) {
    ctx.progress(8, t('thumb.schritt.plan'))
    cp.plan = kiDa && d.ki ? await planeAllgemein(d.ki, vorlage, eingabe, ids, p, c) : allgemeinOhneKi({ engine, figurIds: ids, vorbild: stil.vorbilder[0]?.id ?? 'frei', farben: p.marke.farben, hintergrund: !!p.hintergrund })
    // Aufbau aus einem Auftrags-Vorbild: Seite der Hauptperson übernehmen
    const aufbau = stil.auftrag.find((a) => a.uebernehmen.includes('aufbau') && a.seite && a.seite !== 'mitte')
    if (aufbau) for (const v of cp.plan.varianten) if (v.personen[0]) v.personen[0].seite = aufbau.seite as 'links' | 'rechts'
    await speichere()
    await writeFile(join(p.ausgabe, 'plan.json'), JSON.stringify({ engine, plan: cp.plan }, null, 1))
  }
  const plan = cp.plan
  if (!cp.fotoWahl) {
    cp.fotoWahl = await waehleFotos(d.ki, p.figuren, plan, c)
    await speichere()
  }
  const fertig: VarianteErgebnis[] = [...(cp.fertig ?? [])]
  for (let i = fertig.length; i < plan.varianten.length; i++) {
    await ctx.yield()
    let v: AllgemeinVariante = plan.varianten[i]!
    const anteil = (x: number): number => Math.round(12 + ((i + x) / plan.varianten.length) * 86)
    let bestes: { ergebnis: VarianteErgebnis; ernst: number } | null = null
    let renderFehler: string | null = null
    for (let versuch = 0; versuch <= KORREKTUREN; versuch++) {
      await ctx.yield()
      ctx.progress(anteil(versuch * 0.3), t('thumb.schritt.variante', { nr: i + 1, von: plan.varianten.length, titel: v.titel }))
      const basis = join(p.ausgabe, `variante-${i + 1}.v${versuch}`)
      const foto = fotoSpec(v, p, cp.fotoWahl[String(i)] ?? [])
      const r =
        engine === 'modell3d' && p.figuren[0]?.modell
          ? await renderModell(pyU, u, { modell: p.figuren[0].modell, ...v.modell, seite: v.personen[0]?.seite ?? 'links', randlicht: v.modell?.randlicht ?? v.randfarbe }, foto, basis, c)
          : await renderFoto(pyU, u, foto, basis, c)
      if (!r.roh) {
        renderFehler = r.fehler
        break
      }
      let roh = r.roh
      if (await wendeVorbilderAn(roh, stil.auftrag, `${basis}.vorbild.png`)) roh = `${basis}.vorbild.png`
      const tl = await setzeTextUndLogo(u, pyU, roh, r.bericht, { texte: v.text ?? [], schrift: p.marke.schrift, farben: p.marke.farben, logo: p.marke.logo, zufall: i * 31 + versuch }, basis, c)
      const befunde = await technischePruefung(tl.bild, r.bericht, { textBoxen: tl.textBoxen, logoBox: tl.logoBox, engineWarnungen: [...(r.bericht.warnungen ?? []), ...tl.warnungen] })
      const ki = await kiPruefung(d.ki, tl.bild, { beschreibung: p.start.beschreibung, sprache: sprachName(p.sprache) }, c)
      const alle = [...befunde, ...(ki ?? [])]
      const ernst = alle.filter((b) => b.ernst)
      const ergebnis = variante(v, tl.bild, roh, `${basis}.spec.json`, `${basis}.ebenen`, engine, befunde, ki, versuch, v.text ?? [], null)
      if (!bestes || ernst.length < bestes.ernst) bestes = { ergebnis, ernst: ernst.length }
      if (!ernst.length || versuch === KORREKTUREN) break
      const neu = (kiDa && d.ki ? await korrigiereAllgemein(d.ki, vorlage, eingabe, v, alle, r.bericht, c) : null) ?? autoKorrektur(v, alle)
      if (!neu) break
      v = neu
    }
    fertig.push(bestes?.ergebnis ?? fehlerVariante(v, engine, renderFehler))
    cp.fertig = fertig
    await speichere()
  }
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { varianten: fertig }
}

async function planeAllgemein(ki: KiSchicht, vorlage: string, e: Parameters<typeof allgemeinPrompt>[1], ids: string[], p: ThumbPayload, ctx: JobContext<unknown>): Promise<AllgemeinPlan> {
  let prompt = allgemeinPrompt(vorlage, e)
  let letzte: AllgemeinPlan | null = null
  for (let versuch = 0; versuch < 2; versuch++) {
    const plan = (await ki.frage({ name: 'thumbnail-plan', system: SYSTEM_PLAN, prompt, schema: AllgemeinPlanZ, stufe: 'stark', maxAusgabe: 6000 }, ctx)).daten
    const fehler = pruefeAllgemein(plan, { engine: e.engine, figurIds: ids, vorbilder: e.stil.vorbilder, hintergrund: !!p.hintergrund })
    const kaputt = new Set(fehler.map((f) => Number(/^Variante (\d+)/.exec(f)?.[1] ?? 0) - 1))
    letzte = { varianten: plan.varianten.filter((_, i) => !kaputt.has(i)) }
    if (!fehler.length) return letzte
    prompt = `${allgemeinPrompt(vorlage, e)}\n\n# Korrektur\n\nDein letzter Plan hatte diese Fehler, behebe sie:\n${fehler.map((f) => `- ${f}`).join('\n')}`
  }
  if (!letzte?.varianten.length) throw new Error(t('thumb.fehler.keinPlan'))
  return letzte
}

async function korrigiereAllgemein(ki: KiSchicht, vorlage: string, e: Parameters<typeof allgemeinPrompt>[1], v: AllgemeinVariante, befunde: Befund[], bericht: Bericht, ctx: JobContext<unknown>): Promise<AllgemeinVariante | null> {
  try {
    const erg = await ki.frage(
      {
        name: 'thumbnail-korrektur',
        system: SYSTEM_PLAN,
        prompt: `${allgemeinPrompt(vorlage, { ...e, anzahl: 1 })}\n\n# Korrektur nach dem Render\n\nDiese Variante wurde gebaut, aber die Prüfung meldet Fehler. Behalte Bildidee und Vorbild bei und ändere nur, was nötig ist (Seite, Größe, Kopfhöhe, Text, Hintergrund, Look). Antworte mit der vollständigen korrigierten Variante.\n\nVariante:\n${JSON.stringify(v)}\n\nFehler:\n${befunde.map((b) => `- ${b.text}`).join('\n')}\n\nMesswerte (0–1, oben links = 0,0):\n${JSON.stringify(bericht)}`,
        schema: AllgemeinVarianteZ,
        stufe: 'stark',
        maxAusgabe: 3000
      },
      ctx
    )
    const neu = erg.daten
    pruefeAllgemein({ varianten: [neu] }, { engine: e.engine, figurIds: e.figuren.map((f) => f.id), vorbilder: e.stil.vorbilder, hintergrund: e.hintergrund })
    return neu
  } catch {
    return null
  }
}

/** Welches Foto je Variante und Person: Bild-KI wählt nach Ausdruck, sonst der Reihe nach (jede Variante ein anderes) */
async function waehleFotos(ki: KiSchicht | null, figuren: FigurDaten[], plan: AllgemeinPlan, ctx: JobContext<unknown>): Promise<Record<string, number[]>> {
  const wahl: Record<string, number[]> = {}
  const mitBild = ki ? await ki.verfuegbar(true) : false
  for (const [fi, f] of figuren.entries()) {
    const wuensche = plan.varianten.map((v) => v.personen.find((x) => x.id === f.id)?.ausdruck ?? '')
    let indizes = wuensche.map((_, i) => (f.fotos.length ? i % f.fotos.length : 0))
    if (mitBild && ki && f.fotos.length > 1) {
      try {
        const e = await ki.frage(
          {
            name: 'foto-wahl',
            system: 'You pick the photo whose facial expression best matches each requested expression.',
            prompt: `Die Bilder sind Fotos derselben Person, nummeriert ab 0 in der gegebenen Reihenfolge. Wähle für jeden gewünschten Ausdruck die Nummer des passendsten Fotos (möglichst verschiedene, wenn es passt): ${JSON.stringify(wuensche)}`,
            bilder: f.fotos.slice(0, 8),
            schema: z.object({ wahl: z.array(z.number().int().min(0)) }),
            brauchtBilder: true,
            stufe: 'schnell',
            maxAusgabe: 300
          },
          ctx
        )
        indizes = wuensche.map((_, i) => Math.min(f.fotos.length - 1, e.daten.wahl[i] ?? indizes[i]!))
      } catch {
        // der Reihe nach
      }
    }
    indizes.forEach((x, vi) => {
      wahl[String(vi)] = wahl[String(vi)] ?? []
      wahl[String(vi)]![fi] = x
    })
  }
  return wahl
}

/** Spezifikation für blender/bild/komposit.py aus einer geplanten Variante */
export function fotoSpec(v: AllgemeinVariante, p: Pick<ThumbPayload, 'figuren' | 'hintergrund' | 'engine'>, fotoWahl: number[]): Record<string, unknown> {
  const hg = v.hintergrund.art === 'bild' && p.hintergrund ? { art: 'bild', pfad: p.hintergrund, unschaerfe: v.hintergrund.unschaerfe ?? 4, abdunkeln: v.hintergrund.abdunkeln ?? 0.15 } : { art: 'verlauf', farben: v.hintergrund.farben, winkel: v.hintergrund.winkel ?? 25 }
  const personen = v.personen
    .map((x) => {
      const fi = p.figuren.findIndex((f) => f.id === x.id)
      const f = p.figuren[fi]
      if (!f) return null
      const bild = f.fotos[fotoWahl[fi] ?? 0] ?? f.fotos[0]
      if (!bild && !(p.engine === 'modell3d' && fi === 0)) return null
      return {
        id: x.id,
        bild,
        freistellen: true,
        modell: f.mensch ? 'u2net_human_seg' : 'isnet-general-use',
        art: f.mensch ? 'foto' : 'bild',
        seite: x.seite,
        kopf_anteil: x.kopf_anteil,
        kopf_y: x.kopf_y ?? 0.42,
        hoehe: Math.min(1, x.kopf_anteil * 2.6),
        spiegeln: x.spiegeln ?? false,
        rand: 3,
        randfarbe: v.randfarbe ?? '#ffffff'
      }
    })
    .filter(Boolean)
  // 1920 × 1080: genug Auflösung auch für den Zuschnitt ins Hochformat
  return { breite: 1920, hoehe: 1080, hintergrund: hg, personen, licht_angleichen: 0.2, look: v.look ?? { kontrast: 1.08, saettigung: 1.12, vignette: 0.2 } }
}

function variante(v: { titel: string; warum: string; vorbild: string }, bild: string, roh: string, spec: string, ebenen: string, engine: Engine, technisch: Befund[], ki: Befund[] | null, korrekturen: number, texte: { text: string; farbe?: string }[], schriftAssets: string | null): VarianteErgebnis {
  return {
    titel: v.titel,
    warum: v.warum,
    vorbild: v.vorbild,
    bild,
    roh,
    spec,
    ebenen,
    bericht: spec.replace(/\.(szene|spec)\.json$/, '.bericht.json'),
    texte,
    schriftAssets,
    engine,
    pruefung: { technisch: technisch.map((b) => b.text), ki: ki ? ki.map((b) => b.text) : null, korrekturen },
    fehler: null
  }
}

function fehlerVariante(v: { titel: string; warum: string; vorbild: string }, engine: Engine, fehler: string | null): VarianteErgebnis {
  return { titel: v.titel, warum: v.warum, vorbild: v.vorbild, bild: null, roh: null, spec: null, ebenen: null, bericht: null, texte: [], schriftAssets: null, engine, pruefung: { technisch: [], ki: null, korrekturen: 0 }, fehler: fehler ?? t('thumb.fehler.render') }
}

