// Herkunft: MoinStudio src/main/thumbnail/planung.ts (MIT), auf die KI-Schicht und den Stil-Kontext umgestellt.
import { z } from 'zod'
import type { Katalog } from '../minecraft/katalog'
import { kontextTexte, type PlanVorbild, type StilKontext } from '../kontext'

/**
 * Planung für die Minecraft-Engine (ROADMAP 4.3 und 4.6): Beschreibung → mehrere Szenen für den Blender-Szenen-Bauer.
 * Jede Variante nennt das Vorbild, an dem sie sich orientiert. Kleine Abweichungen werden still repariert, echte Fehler
 * gehen als Korrekturauftrag an die KI zurück.
 */

export interface PlanFigur {
  id: string
  /** Anzeigename für die KI, z. B. „Kim (@kochmitkim)“ */
  name: string
}

const Zahlen = z.array(z.number())

export const SzeneZ = z.looseObject({
  welt: z.looseObject({
    art: z.string(),
    bloecke: z.array(z.looseObject({ art: z.string(), von: Zahlen, bis: Zahlen.optional(), waende: z.string().optional() })).optional()
  }),
  himmel: z.string().optional(),
  figuren: z
    .array(
      z.looseObject({
        id: z.string(),
        pose: z.string(),
        position: Zahlen.optional(),
        blick: z.union([z.number(), z.literal('auto')]).optional(),
        hoehe: z.number().optional(),
        item: z.looseObject({ name: z.string(), hand: z.string().optional() }).optional()
      })
    )
    .min(1),
  mobs: z.array(z.looseObject({ art: z.string(), position: Zahlen.optional(), blick: z.union([z.number(), z.string()]).optional(), groesse: z.number().optional() })).optional(),
  objekte: z.array(z.looseObject({ block: z.string(), position: Zahlen.optional(), drehung: Zahlen.optional(), groesse: z.number().optional(), wichtig: z.boolean().optional() })).optional(),
  kamera: z.looseObject({ modus: z.string().optional(), seite: z.string().optional(), thema: z.union([z.string(), Zahlen]).optional() })
})
export type Szene = z.infer<typeof SzeneZ>

export const TextZ = z.array(z.object({ text: z.string(), farbe: z.string().optional() }))

export const McPlanZ = z.object({
  varianten: z
    .array(z.object({ titel: z.string(), vorbild: z.string(), warum: z.string(), text: TextZ.optional(), szene: SzeneZ }))
    .min(1)
})
export type McPlan = z.infer<typeof McPlanZ>
export type McVariante = McPlan['varianten'][number]

export const SzeneAntwortZ = z.object({ szene: SzeneZ })

function katalogText(k: Katalog): string {
  return [
    `Posen: ${k.posen.map((p) => (p.hinweis ? `${p.name} (${p.hinweis})` : p.name)).join('; ')}`,
    `Mimik (Feld „mimik“ je Figur, Augen bleiben die Skin-Augen): ${k.mimiken.join(', ')}`,
    `Welten: ${k.welten.map((w) => `${w.name} (${w.hinweis})`).join('; ')}`,
    `Himmel: ${k.himmel.join(', ')}`,
    `Kamera-Modi: ${k.kameraModi.join(', ')}`,
    `Mobs: ${k.mobs.join(', ')}`,
    // Vollständige Liste: sonst greift die KI zu ähnlichen Blöcken (oak_leaves statt cherry_leaves)
    `Blöcke für „bloecke“ und „objekte“ (jede Block-ID des Spiels, ${k.bloecke.length} Stück; zum Graben: luft): ${k.bloecke.join(', ')}`
  ].join('\n')
}

export interface McPlanEingabe {
  beschreibung: string
  kanal: string
  figuren: PlanFigur[]
  anzahl: number
  katalog: Katalog
  stil: StilKontext
  /** Sprache der Oberfläche (für Titel und Begründung), z. B. „Deutsch“ */
  sprache: string
  kanalsprache: string
}

export function mcPrompt(vorlage: string, o: McPlanEingabe): string {
  const figuren = o.figuren.map((f, i) => `- id „${f.id}“: ${f.name}${i === 0 ? ' (Hauptfigur)' : ''}`).join('\n')
  const t = kontextTexte(o.stil)
  return vorlage
    .replaceAll('{{kanal}}', o.kanal)
    .replaceAll('{{beschreibung}}', o.beschreibung.replaceAll('“', '"'))
    .replaceAll('{{figuren}}', figuren)
    .replaceAll('{{anzahl}}', String(o.anzahl))
    .replaceAll('{{katalog}}', katalogText(o.katalog))
    .replaceAll('{{stilbuch}}', t.stilbuch)
    .replaceAll('{{vorbilder}}', t.vorbilder)
    .replaceAll('{{auftragsvorbilder}}', t.auftragsvorbilder)
    .replaceAll('{{sprache}}', o.sprache)
    .replaceAll('{{kanalsprache}}', o.kanalsprache)
}

/**
 * Prüft und repariert eine geplante Szene gegen den Katalog. Gibt die Fehler zurück, die sich nicht sicher
 * reparieren lassen (dann wird neu geplant); kleine Abweichungen werden still korrigiert.
 */
export function pruefeSzene(s: Szene, k: Katalog, figurIds: string[]): string[] {
  const fehler: string[] = []
  const posen = new Set(k.posen.map((p) => p.name))
  const welten = new Set(k.welten.map((w) => w.name))
  const bloecke = new Set([...k.bloecke, 'luft'])
  if (!s.welt || !welten.has(s.welt.art)) fehler.push(`Unbekannte Welt „${s.welt?.art}“`)
  for (const b of s.welt?.bloecke ?? []) if (!bloecke.has(b.art)) fehler.push(`Unbekannter Block „${b.art}“`)
  if (s.himmel && !k.himmel.includes(s.himmel)) s.himmel = 'tag'
  if (!s.figuren?.length) fehler.push('Keine Figur')
  const ids = new Set<string>()
  for (const f of s.figuren ?? []) {
    if (!figurIds.includes(f.id)) fehler.push(`Unbekannte Figur „${f.id}“`)
    ids.add(f.id)
    if (!posen.has(f.pose)) fehler.push(`Unbekannte Pose „${f.pose}“ bei ${f.id}`)
    if (f['mimik'] !== undefined && !k.mimiken.includes(String(f['mimik']))) f['mimik'] = 'neutral'
    if (f.item && !/^[a-z0-9_]+$/.test(f.item.name)) fehler.push(`Ungültiges Item „${f.item.name}“`)
    if (f.item && f.item.hand !== 'r' && f.item.hand !== 'l') f.item.hand = 'l'
  }
  if (s.figuren?.[0] && s.figuren[0].id !== figurIds[0]) fehler.push(`Die erste Figur muss „${figurIds[0]}“ sein`)
  for (const m of s.mobs ?? []) if (!k.mobs.includes(m.art)) fehler.push(`Unbekannter Mob „${m.art}“`)
  for (const o of s.objekte ?? []) if (!bloecke.has(o.block) || o.block === 'luft') fehler.push(`Unbekannter Block „${o.block}“`)
  s.kamera = s.kamera ?? {}
  if (!s.kamera.modus || !k.kameraModi.includes(s.kamera.modus)) s.kamera.modus = 'nah'
  const mobs = s.mobs ?? []
  if (typeof s.kamera.thema === 'string') {
    const t = s.kamera.thema
    const mobIndex = /^mob:(\d+)$/.exec(t)?.[1]
    const istMob = mobIndex !== undefined ? Number(mobIndex) < mobs.length : mobs.some((m) => m.art === t)
    const objektIndex = /^objekt:(\d+)$/.exec(t)?.[1]
    const istObjekt = objektIndex !== undefined && Number(objektIndex) < (s.objekte ?? []).length
    if (!ids.has(t) && !istMob && !istObjekt) fehler.push(`Kamera-Thema „${t}“ ist weder Figur noch Mob oder Objekt der Szene`)
  }
  if (s.kamera.thema === undefined) s.kamera.thema = s.figuren?.[1]?.id ?? (mobs.length ? 'mob:0' : [4, 4, 1.5])
  return fehler
}

/** Prüft jede Variante; unbekannte Vorbilder werden auf das erste bekannte gesetzt (die Begründung bleibt). */
export function pruefePlan(plan: McPlan, k: Katalog, figurIds: string[], vorbilder: PlanVorbild[]): string[] {
  const fehler: string[] = []
  const bekannt = new Set(vorbilder.map((v) => v.id))
  plan.varianten.forEach((v, i) => {
    if (!bekannt.has(v.vorbild) && vorbilder[0]) v.vorbild = vorbilder[0].id
    // Stilbuch: höchstens ein Text mit 1–4 Wörtern – längere Texte werden gekürzt statt abgelehnt
    v.text = (v.text ?? []).slice(0, 1).map((t) => ({ ...t, text: t.text.split(/\s+/).slice(0, 4).join(' ') }))
    for (const f of pruefeSzene(v.szene, k, figurIds)) fehler.push(`Variante ${i + 1}: ${f}`)
  })
  return fehler
}

/** Warnungen der Selbstprüfung, die eine Korrektur auslösen. Leichte Abweichungen bleiben Hinweise. */
export function ernsteWarnungen(warnungen: string[]): string[] {
  return warnungen.filter((w) => {
    if (/^Kamera trifft/.test(w)) return Number(/Abweichung ([\d.]+)/.exec(w)?.[1] ?? 0) > 0.5
    if (/^Item .* kaum sichtbar/.test(w)) return Number(/\((\d+) %/.exec(w)?.[1] ?? 0) < 60
    return /^(Gesicht|Etwas versperrt|Gegner|Mob|Objekt|Kopf|Text|Bild)/.test(w)
  })
}

/** Auftrag an die KI: eine gerenderte Szene anhand des Prüfberichts verbessern (gleiche Bildidee, gleiches Vorbild). */
export function korrekturPrompt(vorlage: string, o: McPlanEingabe, variante: McVariante, warnungen: string[], bericht: unknown): string {
  return `${mcPrompt(vorlage, { ...o, anzahl: 1 })}

# Korrektur nach dem Render

Diese Variante wurde gerendert, aber die automatische Bildprüfung meldet Fehler. Behalte Bildidee und Vorbild
(„${variante.vorbild}“) bei und ändere die Szene so, dass die Fehler verschwinden (Positionen, Blick, Kamera, Pose,
Größe, störende Blöcke entfernen). Antworte nur mit {"szene": …}.

Titel: ${variante.titel}
Szene:
${JSON.stringify(variante.szene)}

Fehler der Bildprüfung:
${warnungen.map((w) => `- ${w}`).join('\n')}

Messwerte (Bildkoordinaten 0–1, 0,0 = oben links):
${JSON.stringify(bericht)}

Hilfen: Ist ein Gesicht verdeckt, stelle die Figur weiter zur Seite oder ändere den Blick. Ist ein Gegner oder Mob zu
klein oder nicht im Bild, stelle ihn näher (y kleiner) und näher zur Bildmitte. Versperrt etwas die Sicht, entferne
Blöcke oder Objekte zwischen Kamera (−Y vor der Figur) und Figur. Ist ein Item kaum sichtbar, nimm die andere Hand oder
eine andere Pose.`
}

/** Ohne KI: ein einfacher, sicherer Aufbau (Hauptfigur links, Freunde rechts, Wiese bei Tag). */
export function mcOhneKi(figuren: PlanFigur[], vorbild: string): McPlan {
  return {
    varianten: [
      {
        titel: 'Standardaufbau',
        vorbild,
        warum: 'Ohne KI: Hauptfigur groß links, Freunde daneben',
        text: [],
        szene: {
          welt: { art: 'wiese', seed: 7 },
          himmel: 'tag',
          figuren: figuren.map((f, i) => ({ id: f.id, pose: i === 0 ? 'zeigen' : 'neutral', mimik: 'froh', position: i === 0 ? [0, 0] : [2.4 + i * 1.2, 2 + i], blick: i === 0 ? 30 : -30 })),
          kamera: { modus: figuren.length > 1 ? 'nah' : 'nah', seite: 'links', ...(figuren[1] ? { thema: figuren[1].id } : {}) }
        }
      }
    ]
  }
}
