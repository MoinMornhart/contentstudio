// Herkunft: MoinStudio src/main/logo/bibliothek.ts (MIT), v0.38.0 – hier auf den Logos des Creator-Profils aufgebaut.
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { z } from 'zod'
import type { LogoEintrag, LogoGroesse, LogoPosition, ThumbLogoWahl } from '@shared/logo'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import type { ProfilStore } from '../profil/store'

/**
 * Logo-Bibliothek: Die Dateien sind die Logos der Marke im Creator-Profil (`marke.logos`, unter `marke/logos/` im
 * Datenordner) – der Assistent und der Logo-Reiter teilen sich also eine Liste. Dazu kommen Namen, Herkunft und das
 * Standard-Logo je Konto in `marke/logos/bibliothek.json`. Nie im Repo.
 */

export const LOGO_ORDNER = 'marke/logos'
const META = `${LOGO_ORDNER}/bibliothek.json`

const MetaSchema = z.object({
  namen: z.record(z.string(), z.string()).default({}),
  erstellt: z.record(z.string(), z.string()).default({}),
  /** Konto-ID → Datei */
  standard: z.record(z.string(), z.string()).default({})
})
type Meta = z.infer<typeof MetaSchema>

/** Logo für einen Auftrag (absoluter Pfad) */
export interface LogoWahl {
  datei: string
  name: string
  position: LogoPosition
  groesse: LogoGroesse
}

async function ladeMeta(store: ProfilStore): Promise<Meta> {
  const r = await readJson(join(await store.datenordner(), META), MetaSchema)
  return r.ok ? r.value : MetaSchema.parse({})
}

const speichereMeta = async (store: ProfilStore, m: Meta): Promise<void> => writeJsonAtomic(join(await store.datenordner(), META), m)

/** Name ohne Endung und ohne angehängte Zufalls-ID */
const dateiName = (datei: string): string => basename(datei, extname(datei)).replace(/-[0-9a-f]{6}$/, '').replace(/[-_]+/g, ' ').trim() || 'Logo'

export async function ladeLogos(store: ProfilStore): Promise<LogoEintrag[]> {
  const [profil, m] = await Promise.all([store.laden(), ladeMeta(store)])
  return profil.marke.logos.map((datei) => ({
    id: datei,
    name: m.namen[datei] ?? dateiName(datei),
    datei,
    quelle: m.erstellt[datei] ? 'erstellt' : 'hochgeladen',
    erstellt: m.erstellt[datei] ?? '',
    standard: Object.entries(m.standard)
      .filter(([, d]) => d === datei)
      .map(([k]) => k)
  }))
}

/** Speichert ein fertiges PNG (mit Transparenz) als neues Logo der Marke. */
export async function neuesLogo(store: ProfilStore, png: Buffer, o: { name: string; quelle: LogoEintrag['quelle'] }): Promise<LogoEintrag[]> {
  const name = o.name.trim().slice(0, 60) || 'Logo'
  const stamm = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'logo'
  const datei = await store.bytesAblegen(png, LOGO_ORDNER, `${stamm}-${randomUUID().slice(0, 6)}.png`)
  await store.aendern((p) => ({ ...p, marke: { ...p.marke, logos: [...p.marke.logos, datei] } }))
  const m = await ladeMeta(store)
  m.namen[datei] = name
  if (o.quelle === 'erstellt') m.erstellt[datei] = new Date().toISOString()
  await speichereMeta(store, m)
  return ladeLogos(store)
}

/** Umbenennen, Standard-Logo eines Kontos an/aus, löschen (dann auch nicht mehr Standard, Datei weg). */
export async function aendereLogo(store: ProfilStore, id: string, patch: { name?: string; standard?: { konto: string; an: boolean }; entfernen?: boolean }): Promise<LogoEintrag[]> {
  const profil = await store.laden()
  if (!profil.marke.logos.includes(id)) return ladeLogos(store)
  const m = await ladeMeta(store)
  if (patch.entfernen) {
    await store.aendern((p) => ({ ...p, marke: { ...p.marke, logos: p.marke.logos.filter((x) => x !== id) } }))
    delete m.namen[id]
    delete m.erstellt[id]
    for (const [k, v] of Object.entries(m.standard)) if (v === id) delete m.standard[k]
    // Nur Dateien im Logo-Ordner löschen (sicher im Datenordner)
    if (id.startsWith(`${LOGO_ORDNER}/`)) await rm(await store.absolut(id), { force: true })
  } else {
    if (typeof patch.name === 'string' && patch.name.trim()) m.namen[id] = patch.name.trim().slice(0, 60)
    if (patch.standard?.konto) {
      if (patch.standard.an) m.standard[patch.standard.konto] = id
      else if (m.standard[patch.standard.konto] === id) delete m.standard[patch.standard.konto]
    }
  }
  await speichereMeta(store, m)
  return ladeLogos(store)
}

/**
 * Wahl aus der Oberfläche → Logo für den Auftrag. „standard“ = Standard-Logo des Kontos, sonst das erste Logo der
 * Marke (so war es vor der Bibliothek); null = kein Logo; unbekannte IDs ebenso kein Logo.
 */
export async function logoFuerAuftrag(store: ProfilStore, wahl: ThumbLogoWahl | null | undefined, kontoId: string): Promise<LogoWahl | null> {
  const w = wahl ?? { id: 'standard', position: 'auto', groesse: 'mittel' }
  if (!w.id) return null
  const logos = await ladeLogos(store)
  const l = w.id === 'standard' ? (logos.find((x) => x.standard.includes(kontoId)) ?? logos[0]) : logos.find((x) => x.id === w.id)
  if (!l) return null
  return { datei: await store.absolut(l.datei), name: l.name, position: w.position, groesse: w.groesse }
}
