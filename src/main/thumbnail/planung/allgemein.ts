import { z } from 'zod'
import type { Engine } from '@shared/thumbnail'
import { kontextTexte, type PlanVorbild, type StilKontext } from '../kontext'

/**
 * Planung für Foto-Compositing, 3D-Modell und reine Grafik (ROADMAP 4.4, 4.6): Beschreibung → Varianten mit
 * Hintergrund, Personen (Seite, Größe, Ausdruck), Text und Look. Jede Variante nennt ihr Vorbild.
 */

export const MODELL_POSEN = ['neutral', 'zeigen', 'jubeln', 'winken', 'nachdenken', 'schreck'] as const

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const AllgemeinVarianteZ = z.object({
  titel: z.string(),
  vorbild: z.string(),
  warum: z.string(),
  hintergrund: z.object({
    art: z.enum(['verlauf', 'bild', 'ort']),
    /** Nur bei „ort“: englische Stichworte für ein echtes Ortsfoto (z. B. „kitchen“, „gym“, „city street“) */
    ort: z.string().optional(),
    farben: z.array(Hex).min(1).max(3),
    winkel: z.number().min(-180).max(180).optional(),
    unschaerfe: z.number().min(0).max(30).optional(),
    abdunkeln: z.number().min(0).max(0.7).optional()
  }),
  personen: z.array(
    z.object({
      id: z.string(),
      ausdruck: z.string(),
      seite: z.enum(['links', 'mitte', 'rechts']),
      kopf_anteil: z.number().min(0.1).max(0.7),
      kopf_y: z.number().min(0.2).max(0.65).optional(),
      spiegeln: z.boolean().optional()
    })
  ),
  modell: z
    .object({
      pose: z.enum(MODELL_POSEN),
      kopf: z.object({ drehen: z.number().min(-45).max(45), neigen: z.number().min(-25).max(25) }).optional(),
      kamera: z.enum(['nah', 'brust', 'ganz']),
      licht: z.enum(['studio', 'dramatisch', 'weich']),
      randlicht: Hex.optional()
    })
    .optional(),
  /** Gegenstände als 3D-Sticker: englischer Emoji-Name, Mitte (x, y als Bildanteil), Größe als Anteil der Bildhöhe */
  objekte: z
    .array(z.object({ emoji: z.string(), x: z.number().min(0).max(1), y: z.number().min(0).max(1), groesse: z.number().min(0.08).max(0.6), drehung: z.number().min(-30).max(30).optional() }))
    .max(3)
    .optional(),
  text: z.array(z.object({ text: z.string(), farbe: Hex.optional() })).max(2).optional(),
  randfarbe: Hex.optional(),
  look: z.object({ kontrast: z.number().min(0.8).max(1.5), saettigung: z.number().min(0.7).max(1.6), vignette: z.number().min(0).max(0.6) }).optional()
})
export type AllgemeinVariante = z.infer<typeof AllgemeinVarianteZ>

export const AllgemeinPlanZ = z.object({ varianten: z.array(AllgemeinVarianteZ).min(1) })
export type AllgemeinPlan = z.infer<typeof AllgemeinPlanZ>

export interface AllgemeinEingabe {
  engine: Exclude<Engine, 'minecraft'>
  beschreibung: string
  kanal: string
  plattform: string
  richtungen: string[]
  figuren: { id: string; name: string; fotos: number }[]
  anzahl: number
  stil: StilKontext
  hintergrund: boolean
  sprache: string
  kanalsprache: string
  /** Namen der Orte, für die es echte Fotos gibt (Poly Haven); leer = unbekannt */
  orte?: string[]
}

const ENGINE_TEXT: Record<AllgemeinEingabe['engine'], string> = {
  foto: 'Die echten Fotos der Personen werden lokal freigestellt und auf den Hintergrund gesetzt (nie gezeichnet)',
  modell3d: 'Das 3D-Modell (Avatar) des Creators wird in Blender gerendert und auf den Hintergrund gesetzt',
  grafik: 'Reine Grafik ohne Person: Hintergrund, Text und Logo (Personenliste leer lassen)'
}

const MODELL_REGELN = `8. **3D-Modell:** Fülle \`modell\` aus: \`pose\` (${MODELL_POSEN.join(', ')}), \`kopf\` (drehen −45…45 zur Bildmitte,
   neigen −25…25), \`kamera\` (nah = Kopf groß, brust = Oberkörper, ganz = ganze Figur), \`licht\` (studio, dramatisch,
   weich) und optional \`randlicht\` als Farbe. \`personen\` enthält dann genau die Hauptfigur mit Seite und Größe.`

export function allgemeinPrompt(vorlage: string, o: AllgemeinEingabe): string {
  const figuren = o.figuren.length
    ? o.figuren.map((f, i) => `- id „${f.id}“: ${f.name}${i === 0 ? ' (Hauptperson)' : ''}${f.fotos > 1 ? `, ${f.fotos} Fotos mit verschiedenen Ausdrücken` : ''}`).join('\n')
    : '- keine (reine Grafik)'
  const t = kontextTexte(o.stil)
  return vorlage
    .replaceAll('{{kanal}}', o.kanal)
    .replaceAll('{{plattform}}', o.plattform)
    .replaceAll('{{richtungen}}', o.richtungen.join(', ') || '–')
    .replaceAll('{{engine}}', ENGINE_TEXT[o.engine])
    .replaceAll('{{beschreibung}}', o.beschreibung.replaceAll('“', '"'))
    .replaceAll('{{figuren}}', figuren)
    .replaceAll('{{anzahl}}', String(o.anzahl))
    .replaceAll('{{hintergrund}}', o.hintergrund ? 'ein Hintergrundbild ist mitgegeben' : 'kein Hintergrundbild mitgegeben – nimm verlauf')
    .replaceAll('{{modellregeln}}', o.engine === 'modell3d' ? MODELL_REGELN : '')
    .replaceAll('{{stilbuch}}', t.stilbuch)
    .replaceAll('{{vorbilder}}', t.vorbilder)
    .replaceAll('{{auftragsvorbilder}}', t.auftragsvorbilder)
    .replaceAll('{{sprache}}', o.sprache)
    .replaceAll('{{kanalsprache}}', o.kanalsprache)
    .replaceAll('{{orte}}', o.orte?.length ? `Es gibt nur diese Orte – nimm in \`ort\` genau einen Namen aus der Liste oder \`verlauf\`, wenn keiner wirklich passt (lieber ein Farbverlauf mit passenden Gegenständen als ein falscher Ort): ${o.orte.join('; ')}` : '')
}

/** Repariert still, was sich sicher reparieren lässt; gibt echte Fehler zurück (dann plant die KI neu). */
export function pruefeAllgemein(plan: AllgemeinPlan, o: { engine: AllgemeinEingabe['engine']; figurIds: string[]; vorbilder: PlanVorbild[]; hintergrund: boolean }): string[] {
  const fehler: string[] = []
  const bekannt = new Set(o.vorbilder.map((v) => v.id))
  plan.varianten.forEach((v, i) => {
    if (!bekannt.has(v.vorbild) && o.vorbilder[0]) v.vorbild = o.vorbilder[0].id
    if (v.hintergrund.art === 'bild' && !o.hintergrund) v.hintergrund.art = 'verlauf'
    if (v.hintergrund.art === 'ort' && !v.hintergrund.ort?.trim()) v.hintergrund.art = 'verlauf'
    v.objekte = (v.objekte ?? []).filter((x) => x.emoji.trim()).slice(0, 3)
    v.text = (v.text ?? []).slice(0, 1).map((t) => ({ ...t, text: t.text.split(/\s+/).slice(0, 4).join(' ') }))
    if (o.engine === 'grafik') v.personen = []
    else {
      v.personen = v.personen.filter((p) => o.figurIds.includes(p.id))
      if (!v.personen.length || v.personen[0]!.id !== o.figurIds[0]) fehler.push(`Variante ${i + 1}: Die erste Person muss „${o.figurIds[0]}“ sein`)
      // Zwei Personen auf derselben Seite verdecken sich: die zweite auf die freie Seite
      const belegt = new Set<string>()
      for (const p of v.personen) {
        if (belegt.has(p.seite)) p.seite = (['links', 'rechts', 'mitte'] as const).find((s) => !belegt.has(s)) ?? p.seite
        belegt.add(p.seite)
      }
    }
    if (o.engine === 'modell3d' && !v.modell) v.modell = { pose: 'neutral', kamera: 'brust', licht: 'studio' }
  })
  return fehler
}

/** Ohne KI: ein sicherer Aufbau aus Stilbuch und Markenfarben (eine Variante). */
export function allgemeinOhneKi(o: { engine: AllgemeinEingabe['engine']; figurIds: string[]; vorbild: string; farben: string[]; hintergrund: boolean }): AllgemeinPlan {
  const farben = o.farben.length >= 2 ? o.farben.slice(0, 2) : ['#1d2b64', '#ff5a36']
  return {
    varianten: [
      {
        titel: 'Standardaufbau',
        vorbild: o.vorbild,
        warum: 'Ohne KI: Hauptperson groß links, freie Fläche rechts',
        hintergrund: o.hintergrund ? { art: 'bild', farben, abdunkeln: 0.15, unschaerfe: 4 } : { art: 'verlauf', farben, winkel: 25 },
        personen: o.engine === 'grafik' ? [] : o.figurIds.map((id, i) => ({ id, ausdruck: 'neutral', seite: i === 0 ? ('links' as const) : ('rechts' as const), kopf_anteil: i === 0 ? 0.36 : 0.28 })),
        ...(o.engine === 'modell3d' ? { modell: { pose: 'zeigen' as const, kamera: 'brust' as const, licht: 'studio' as const } } : {}),
        text: [],
        look: { kontrast: 1.08, saettigung: 1.12, vignette: 0.2 }
      }
    ]
  }
}
