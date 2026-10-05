import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runBlender } from '../jobs/blender'
import type { JobContext } from '../jobs/queue'
import { liesBild, schreibePng } from '../bild/rohbild'
import { differenzEbene, maskiere, setzeLogoIn, type Box } from '../bild/komposit'
import type { LogoGroesse, LogoPosition } from '@shared/logo'
import { platzHinweise, waehleLogoPlatz } from '../logo/platz'
import { liesJson, py, type PyUmgebung, type ThumbUmgebung } from './umgebung'
import { t } from '../i18n'

/**
 * Rendern je Engine (ROADMAP 4.3, 4.4, 4.7): Minecraft-Szene und 3D-Modell in Blender, Foto-Compositing in der
 * Bild-Umgebung; danach Text (Minecraft-Pixelschrift bzw. Markenschrift) und Logo. Jede Stufe legt eine Ebene für den
 * PSD-Export ab (Ordner `<basis>.ebenen/`).
 */

export interface Bericht {
  figuren?: Record<string, { box?: Box; kopf_box?: Box; gesicht?: boolean; gesicht_sichtbar?: number }>
  items?: Record<string, { box?: Box }>
  mobs?: { art: string; box?: Box }[]
  warnungen?: string[]
  /** Kästen der Grafik-Ebene (Hotbar, Lupe, Etiketten …): Text und Logo weichen ihnen aus */
  grafik_boxen?: Box[]
  fehler?: string
  [k: string]: unknown
}

export interface RenderErgebnis {
  /** Fertiges Bild (mit Text und Logo) */
  bild: string | null
  /** Bild ohne Text und Logo */
  roh: string | null
  bericht: Bericht
  warnungen: string[]
  fehler: string | null
  /** Ebenen für den PSD-Export */
  ebenen: string
  /** Boxen von Text und Logo (für die Prüfung) */
  textBoxen: Box[]
  logoBox: Box | null
}

const ZEILE = /\r?\n/

/** Wichtige Flächen aus dem Bericht: Gesichter, Figuren, Items, Mobs (Text und Logo dürfen sie nie verdecken) */
export function sperrFlaechen(b: Bericht, mitKoerper = true): Box[] {
  const out: Box[] = []
  for (const f of Object.values(b.figuren ?? {})) {
    if (f.kopf_box) out.push(f.kopf_box)
    if (mitKoerper && f.box) out.push(f.box)
  }
  for (const i of Object.values(b.items ?? {})) if (i.box) out.push(i.box)
  for (const m of b.mobs ?? []) if (m.box) out.push(m.box)
  for (const g of b.grafik_boxen ?? []) out.push(g)
  return out
}

function blender(u: ThumbUmgebung, skript: string, args: string[], ctx: JobContext<unknown>): ReturnType<typeof runBlender> {
  if (!u.blender) throw new Error(t('thumb.fehlt.blender'))
  return runBlender({ exe: u.blender.exe, mesa: u.blender.mesa, script: join(u.skripte, skript), args }, ctx)
}

/** Minecraft-Szene rendern (Skins und Mob-Tabelle sind schon eingetragen) */
export async function renderMinecraft(u: ThumbUmgebung, szene: Record<string, unknown>, texturen: string, basis: string, ctx: JobContext<unknown>): Promise<{ roh: string | null; bericht: Bericht; fehler: string | null }> {
  szene['render'] = { samples: u.blender?.samples ?? 32, geraet: u.blender?.geraet ?? 'CPU', ...(szene['render'] as object | undefined) }
  await writeFile(`${basis}.szene.json`, JSON.stringify(szene, null, 1))
  const { code, output } = await blender(u, 'render_szene.py', [`${basis}.szene.json`, texturen, `${basis}.roh.png`, `${basis}.bericht.json`], ctx)
  const bericht = await liesJson<Bericht>(`${basis}.bericht.json`, {})
  // CS_BILD_OK: Bild und Bericht sind fertig; scheitert danach nur die Maske für die Ebenen, zählt das nicht
  if ((code !== 0 && !output.includes('CS_BILD_OK')) || bericht.fehler) {
    const fehler = bericht.fehler ?? `Blender ${code}: ${output.trim().split(ZEILE).slice(-1)[0]}`
    // Zu wenig Speicher (kleine Rechner, viel offen): einmal kleiner und mit weniger Samples versuchen
    const render = (szene['render'] ?? {}) as { breite?: number; samples?: number }
    if (/out of memory/i.test(fehler) && (render.breite ?? 1280) > 960) {
      ctx.progress(null, t('thumb.schritt.wenigerSpeicher'))
      return renderMinecraft(u, { ...szene, render: { ...render, breite: 960, hoehe: 540, samples: Math.max(8, Math.round((render.samples ?? 32) / 2)) } }, texturen, basis, ctx)
    }
    return { roh: null, bericht, fehler }
  }
  return { roh: `${basis}.roh.png`, bericht, fehler: null }
}

/** Foto-Compositing (Spezifikation siehe blender/bild/komposit.py) */
export async function renderFoto(p: PyUmgebung, u: ThumbUmgebung, spec: Record<string, unknown>, basis: string, ctx: JobContext<unknown>): Promise<{ roh: string | null; bericht: Bericht; fehler: string | null }> {
  await mkdir(`${basis}.ebenen`, { recursive: true })
  await writeFile(`${basis}.spec.json`, JSON.stringify({ ...spec, ebenen: `${basis}.ebenen` }, null, 1))
  try {
    await py(p, join(u.skripte, 'bild', 'komposit.py'), [`${basis}.spec.json`, `${basis}.roh.png`, `${basis}.bericht.json`], ctx)
  } catch (err) {
    const b = await liesJson<Bericht>(`${basis}.bericht.json`, {})
    return { roh: null, bericht: b, fehler: b.fehler ?? (err instanceof Error ? err.message : String(err)) }
  }
  return { roh: `${basis}.roh.png`, bericht: await liesJson<Bericht>(`${basis}.bericht.json`, {}), fehler: null }
}

/** 3D-Modell in Blender rendern (freigestellt), danach wie ein Foto auf den Hintergrund setzen */
export async function renderModell(
  p: PyUmgebung,
  u: ThumbUmgebung,
  modell: Record<string, unknown>,
  foto: Record<string, unknown>,
  basis: string,
  ctx: JobContext<unknown>
): Promise<{ roh: string | null; bericht: Bericht; fehler: string | null }> {
  const spec = { ...modell, samples: u.blender?.samples ?? 32, geraet: u.blender?.geraet ?? 'CPU', breite: 1024, hoehe: 1024 }
  await writeFile(`${basis}.modell.json`, JSON.stringify(spec, null, 1))
  const { code, output } = await blender(u, join('modell', 'render_modell.py'), [`${basis}.modell.json`, `${basis}.figur.png`, `${basis}.figur.bericht.json`], ctx)
  const mb = await liesJson<Bericht>(`${basis}.figur.bericht.json`, {})
  if (code !== 0 || mb.fehler) return { roh: null, bericht: mb, fehler: mb.fehler ?? `Blender ${code}: ${output.trim().split(ZEILE).slice(-1)[0]}` }
  const personen = ((foto['personen'] as Record<string, unknown>[] | undefined) ?? []).map((x, i) => (i === 0 ? { ...x, bild: `${basis}.figur.png`, freistellen: false, art: 'modell', kopf_rel: mb.figuren?.['ich']?.kopf_box ?? null, ...(modell['kamera'] === 'ganz' ? { kopf_anteil: null, hoehe: 0.86, anschnitt: 0, steht: true } : {}) } : x))
  const erg = await renderFoto(p, u, { ...foto, personen }, basis, ctx)
  erg.bericht.warnungen = [...(mb.warnungen ?? []), ...(erg.bericht.warnungen ?? [])]
  return erg
}

export interface TextAuftrag {
  texte: { text: string; farbe?: string }[]
  /** Minecraft: Pixelschrift aus der Spieldatei */
  minecraftAssets?: string
  schrift?: string | null
  farben?: string[]
  logo?: string | null
  /** Ecke und Größe aus der Logo-Wahl (Standard: freie Ecke, mittel) */
  logoPlatz?: { position: LogoPosition; groesse: LogoGroesse }
  zufall?: number
}

/**
 * Text und Logo setzen und die Ebenen ablegen. Minecraft: Pixelschrift (Blender), sonst Markenschrift (Pillow).
 * Das Logo kommt zuletzt in eine freie Ecke.
 */
export async function setzeTextUndLogo(
  u: ThumbUmgebung,
  p: PyUmgebung | null,
  roh: string,
  bericht: Bericht,
  auftrag: TextAuftrag,
  basis: string,
  ctx: JobContext<unknown>
): Promise<{ bild: string; warnungen: string[]; textBoxen: Box[]; logoBox: Box | null }> {
  const ebenen = `${basis}.ebenen`
  await mkdir(ebenen, { recursive: true })
  let bild = roh
  const warnungen: string[] = []
  let textBoxen: Box[] = []
  if (auftrag.texte.length) {
    ctx.progress(null, t('thumb.schritt.text'))
    const ziel = `${basis}.text.png`
    if (auftrag.minecraftAssets) {
      await writeFile(`${basis}.texte.json`, JSON.stringify(auftrag.texte))
      const r = await blender(u, 'text_setzen.py', [roh, `${basis}.bericht.json`, `${basis}.texte.json`, auftrag.minecraftAssets, ziel], ctx)
      const zeile = /CS_TEXT (.*)/.exec(r.output)?.[1]
      if (r.code === 0 && zeile) {
        const e = JSON.parse(zeile) as { texte?: { box: Box }[]; warnungen?: string[] }
        bild = ziel
        warnungen.push(...(e.warnungen ?? []))
        textBoxen = (e.texte ?? []).map((x) => x.box)
      } else warnungen.push(t('thumb.warn.textFehlt'))
    } else if (p) {
      await writeFile(
        `${basis}.textauftrag.json`,
        JSON.stringify({ texte: auftrag.texte, schrift: auftrag.schrift ?? null, farben: auftrag.farben ?? [], sperren: sperrFlaechen(bericht), zufall: auftrag.zufall ?? 7, logo: null })
      )
      try {
        const aus = await py(p, join(u.skripte, 'bild', 'text_ttf.py'), [roh, `${basis}.textauftrag.json`, ziel], ctx)
        const e = JSON.parse(/CS_TEXT (.*)/.exec(aus)?.[1] ?? '{}') as { texte?: { box: Box }[]; warnungen?: string[] }
        bild = ziel
        warnungen.push(...(e.warnungen ?? []))
        textBoxen = (e.texte ?? []).map((x) => x.box)
      } catch {
        warnungen.push(t('thumb.warn.textFehlt'))
      }
    }
    if (bild !== roh) await schreibePng(join(ebenen, 'text.png'), differenzEbene(await liesBild(bild), await liesBild(roh)))
  }
  let logoBox: Box | null = null
  if (auftrag.logo) {
    try {
      // Gewünschte Ecke und Größe, sonst die nächste freie Ecke oder kleiner (aus MoinStudio v0.38.0); ist nirgends
      // frei, lieber ohne Logo als über Gesicht, Figur oder Text
      const grund = await liesBild(bild)
      const logo = await liesBild(auftrag.logo)
      const platz = waehleLogoPlatz({ sperren: [...sperrFlaechen(bericht), ...textBoxen], logoVerhaeltnis: logo.width / logo.height, bildVerhaeltnis: grund.width / grund.height, position: auftrag.logoPlatz?.position ?? 'auto', groesse: auftrag.logoPlatz?.groesse ?? 'mittel' })
      const l = platz.frei ? setzeLogoIn(grund, logo, platz.box) : null
      if (!l) warnungen.push(t('thumb.warn.logoVerdeckt'))
      else {
        warnungen.push(...platzHinweise(platz, auftrag.logoPlatz?.position ?? 'auto'))
        const ziel = `${basis}.fertig.png`
        await schreibePng(ziel, l.bild)
        await schreibePng(join(ebenen, 'logo.png'), l.ebene)
        bild = ziel
        logoBox = l.box
      }
    } catch {
      warnungen.push(t('thumb.warn.logoFehlt'))
    }
  }
  return { bild, warnungen, textBoxen, logoBox }
}

/** Ebenen der Minecraft-Szene: Hintergrund (ganzes Bild) und Figuren (über die Maske des Szenen-Bauers) */
/** `maske`: Figuren-Maske, wenn das Bild nicht mehr das Roh-Render ist (veredelt, mit Grafik) */
export async function minecraftEbenen(roh: string, basis: string, maskePfad = roh.replace(/\.png$/, '.maske.png')): Promise<void> {
  const ebenen = `${basis}.ebenen`
  await mkdir(ebenen, { recursive: true })
  const bild = await liesBild(roh)
  await schreibePng(join(ebenen, 'hintergrund.png'), bild)
  const maske = await readFile(maskePfad).then(
    () => liesBild(maskePfad),
    () => null
  )
  if (maske) await schreibePng(join(ebenen, 'person-figuren.png'), maskiere(bild, maske))
}
