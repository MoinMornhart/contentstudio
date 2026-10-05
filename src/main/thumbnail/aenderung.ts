// Idee aus MoinStudio src/main/thumbnail/aenderung.ts (MIT): Änderungswunsch in Worten zu einer fertigen Variante.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Engine } from '@shared/thumbnail'
import type { JobContext } from '../jobs/queue'
import { t } from '../i18n'
import { thumbnailJob, type Checkpoint, type ThumbDienste } from './job'
import { AllgemeinVarianteZ, type AllgemeinPlan } from './planung/allgemein'
import { McPlanZ, type McPlan } from './planung/minecraft'
import type { ThumbErgebnisDaten, ThumbPayload } from './typen'

/**
 * Änderungswunsch (ROADMAP 4.6): Die KI bekommt Plan und (falls sie Bilder sieht) das Bild der Variante und setzt den
 * Wunsch in einen geänderten Plan um. Danach läuft derselbe Weg wie beim ersten Mal: Render, Text, Logo, Prüfung.
 */
export interface AenderungPayload {
  /** Nutzlast des ursprünglichen Auftrags, mit neuem Ausgabeordner */
  basis: ThumbPayload
  /** Ordner des ursprünglichen Auftrags (plan.json) */
  quelle: string
  index: number
  wunsch: string
  bild: string | null
  /** Ursprünglicher Auftrag des Verlaufs und das Bild, an dem geändert wurde (aus MoinStudio v0.37.0) */
  eltern?: string
  basisJob?: { job: string; variante: number }
}

export function aenderungsPrompt(wunsch: string, engine: Engine, variante: unknown): string {
  return `Der Creator möchte an diesem Thumbnail etwas ändern. Sein Wunsch: „${wunsch}“

So ist die Variante gerade geplant (JSON):
${JSON.stringify(variante, null, 1)}

Ändere nur, was der Wunsch verlangt; alles andere bleibt genau so (IDs, Vorbild, Aufbau, Farben …).${engine === 'minecraft' ? ' Nutze nur Posen, Welten, Mobs und Blöcke, die in der Szene oder im Minecraft-Katalog vorkommen.' : ''} Antworte mit der vollständigen geänderten Variante im selben Format.`
}

export async function aenderungJob(p: AenderungPayload, ctx: JobContext<Checkpoint>, d: ThumbDienste): Promise<ThumbErgebnisDaten> {
  if (!d.ki || !(await d.ki.kandidaten()).length) throw new Error(t('thumb.aendern.ohneKi'))
  const gespeichert = JSON.parse(await readFile(join(p.quelle, 'plan.json'), 'utf8')) as { engine: Engine; plan: McPlan | AllgemeinPlan }
  if (!ctx.checkpoint?.plan && !ctx.checkpoint?.mcPlan) {
    ctx.progress(5, t('thumb.aendern.ki'))
    const alt = gespeichert.plan.varianten[p.index]
    if (!alt) throw new Error(t('thumb.aendern.weg'))
    const mitBild = p.bild && (await d.ki.verfuegbar(true))
    const system = 'You edit a planned video thumbnail according to the creator’s wish. Change only what is asked.'
    if (gespeichert.engine === 'minecraft') {
      const e = await d.ki.frage({ name: 'thumbnail-aenderung', system, prompt: aenderungsPrompt(p.wunsch, 'minecraft', alt), bilder: mitBild ? [p.bild!] : [], schema: McPlanZ.shape.varianten.element, stufe: 'stark', maxAusgabe: 8000 }, ctx as JobContext<unknown>)
      await ctx.save({ mcPlan: { varianten: [{ ...e.daten, vorbild: (alt as McPlan['varianten'][number]).vorbild }] } })
    } else {
      const e = await d.ki.frage({ name: 'thumbnail-aenderung', system, prompt: aenderungsPrompt(p.wunsch, gespeichert.engine, alt), bilder: mitBild ? [p.bild!] : [], schema: AllgemeinVarianteZ, stufe: 'stark', maxAusgabe: 3000 }, ctx as JobContext<unknown>)
      await ctx.save({ plan: { varianten: [{ ...e.daten, vorbild: (alt as AllgemeinPlan['varianten'][number]).vorbild }] } })
    }
  }
  const erg = await thumbnailJob({ ...p.basis, start: { ...p.basis.start, anzahl: 1 } }, ctx, d)
  return { varianten: erg.varianten.map((v) => ({ ...v, titel: `${t('thumb.aendern.titel')}: ${p.wunsch}`.slice(0, 90), warum: p.wunsch })) }
}
