import { z } from 'zod'
import { analysiere } from '../bild/analyse'
import { liesBild } from '../bild/rohbild'
import { ueberlappung, type Box } from '../bild/komposit'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { hauptSprache, t } from '../i18n'
import { uebersetzeWarnung } from './warnungen'
import type { AllgemeinVariante } from './planung/allgemein'
import type { Bericht } from './render'

/**
 * Selbstprüfung vor dem Zeigen (ROADMAP 4.8). Technisch (immer, lokal): Gesicht frei und im Bild, Wichtiges im Bild,
 * Größe von Figur und Objekten, Text und Logo nie über Gesichtern, Bild nicht leer, nicht überstrahlt, nicht zu dunkel.
 * Dazu die Bild-KI, falls eine verfügbar ist. Ernste Befunde lösen eine Korrektur aus.
 */

export type BefundArt = 'gesicht' | 'text' | 'thema' | 'aufbau' | 'technik' | 'sonstiges'

export interface Befund {
  art: BefundArt
  text: string
  ernst: boolean
}

export async function technischePruefung(bild: string, bericht: Bericht, o: { textBoxen: Box[]; logoBox: Box | null; engineWarnungen: string[]; ernstMuster?: (w: string) => boolean }): Promise<Befund[]> {
  const befunde: Befund[] = []
  const a = analysiere(await liesBild(bild))
  if (a.detail < 0.03) befunde.push({ art: 'technik', text: t('thumb.pruef.leer'), ernst: true })
  if (a.ueberstrahlt > 0.25) befunde.push({ art: 'technik', text: t('thumb.pruef.ueberstrahlt', { anteil: Math.round(a.ueberstrahlt * 100) }), ernst: true })
  if (a.abgesoffen > 0.45 || a.helligkeit < 0.1) befunde.push({ art: 'technik', text: t('thumb.pruef.dunkel'), ernst: true })
  for (const [id, f] of Object.entries(bericht.figuren ?? {})) {
    const k = f.kopf_box
    if (!k) continue
    const flaeche = Math.max(1e-6, (k[2] - k[0]) * (k[3] - k[1]))
    for (const tb of o.textBoxen) if (ueberlappung(tb, k) / flaeche > 0.02) befunde.push({ art: 'text', text: t('thumb.pruef.textGesicht', { id }), ernst: true })
    if (o.logoBox && ueberlappung(o.logoBox, k) / flaeche > 0.02) befunde.push({ art: 'text', text: t('thumb.pruef.logoGesicht', { id }), ernst: true })
    if (k[3] - k[1] < 0.07) befunde.push({ art: 'gesicht', text: t('thumb.pruef.gesichtKlein', { id }), ernst: id === Object.keys(bericht.figuren ?? {})[0] })
    if (k[0] < -0.02 || k[2] > 1.02 || k[1] < -0.04) befunde.push({ art: 'gesicht', text: t('thumb.pruef.gesichtAngeschnitten', { id }), ernst: true })
  }
  for (const w of o.engineWarnungen) befunde.push({ art: /Gesicht|Kopf/.test(w) ? 'gesicht' : /Text|Logo/.test(w) ? 'text' : /Mob|Objekt|Gegner/.test(w) ? 'thema' : 'aufbau', text: uebersetzeWarnung(w, hauptSprache()), ernst: o.ernstMuster?.(w) ?? /Gesicht|angeschnitten|überdeckt|verdeckt|versperrt/.test(w) })
  return befunde
}

const KiPruefungZ = z.object({
  note: z.number().min(1).max(10),
  probleme: z.array(z.object({ art: z.enum(['gesicht', 'text', 'thema', 'aufbau', 'technik', 'sonstiges']), text: z.string(), ernst: z.boolean() })).max(8)
})

/** Bild-KI bewertet das Bild; null, wenn keine Bild-KI verfügbar ist (die App sagt das dann). */
export async function kiPruefung(ki: KiSchicht | null, bild: string, o: { beschreibung: string; sprache: string }, ctx?: JobContext<unknown>): Promise<Befund[] | null> {
  if (!ki || !(await ki.verfuegbar(true))) return null
  try {
    const e = await ki.frage(
      {
        name: 'thumbnail-pruefung',
        system: 'You are a strict thumbnail reviewer. Judge whether the image works as a video thumbnail for the given description: faces visible and not covered, the subject recognisable, text readable and not covering faces, nothing important cut off, not empty, not over- or underexposed. Only report real problems.',
        prompt: `Beschreibung: „${o.beschreibung}“. Gib eine Note von 1 (unbrauchbar) bis 10 (sehr gut) und liste echte Probleme. ernst = so darf es nicht gezeigt werden: Gesicht verdeckt oder angeschnitten, Thema der Beschreibung ohne den Videotitel nicht erkennbar, Text unlesbar oder über einem Gesicht, Wichtiges abgeschnitten, Bild leer, über- oder unterbelichtet, sichtbare Fehler beim Freistellen. Schreibe die Probleme auf ${o.sprache}.`,
        bilder: [bild],
        schema: KiPruefungZ,
        brauchtBilder: true,
        stufe: 'schnell',
        maxAusgabe: 800
      },
      ctx
    )
    const befunde: Befund[] = e.daten.probleme.map((p) => ({ art: p.art, text: p.text, ernst: p.ernst }))
    // Mittelmaß reicht nicht: unter 6 wird korrigiert, auch wenn kein Einzelproblem als ernst markiert ist
    if (e.daten.note < 6 && !befunde.some((b) => b.ernst)) befunde.push({ art: 'sonstiges', text: t('thumb.pruef.note', { note: e.daten.note }), ernst: true })
    return befunde
  } catch {
    return null
  }
}

/**
 * Korrektur ohne KI für Foto-, Modell- und Grafik-Varianten: aus den Befunden die passenden Stellschrauben drehen.
 * Gibt null zurück, wenn nichts Passendes einzustellen ist.
 */
export function autoKorrektur(v: AllgemeinVariante, befunde: Befund[]): AllgemeinVariante | null {
  const neu = structuredClone(v)
  let geaendert = false
  const ernst = befunde.filter((b) => b.ernst)
  if (ernst.some((b) => b.art === 'gesicht' && /angeschnitten|cut/i.test(b.text))) {
    for (const p of neu.personen) {
      p.kopf_anteil = Math.max(0.15, Math.round(p.kopf_anteil * 0.8 * 100) / 100)
      p.kopf_y = 0.42
    }
    geaendert = true
  }
  if (ernst.some((b) => b.art === 'gesicht' && /klein|small/i.test(b.text))) {
    for (const p of neu.personen) p.kopf_anteil = Math.min(0.55, Math.round(p.kopf_anteil * 1.35 * 100) / 100)
    geaendert = true
  }
  if (ernst.some((b) => b.art === 'text') && neu.text?.length) {
    // Kürzerer Text findet leichter einen freien Platz; zur Not ganz ohne
    const w = neu.text[0]!.text.split(/\s+/)
    neu.text = w.length > 1 ? [{ ...neu.text[0]!, text: w.slice(0, Math.max(1, w.length - 1)).join(' ') }] : []
    geaendert = true
  }
  if (ernst.some((b) => b.art === 'technik' && /überstrahlt|overexposed/i.test(b.text))) {
    neu.look = { ...(neu.look ?? { kontrast: 1, saettigung: 1, vignette: 0.2 }), kontrast: 0.95 }
    neu.hintergrund.abdunkeln = Math.min(0.5, (neu.hintergrund.abdunkeln ?? 0) + 0.2)
    geaendert = true
  }
  if (ernst.some((b) => b.art === 'technik' && /dunkel|dark/i.test(b.text))) {
    neu.hintergrund.abdunkeln = 0
    neu.look = { ...(neu.look ?? { kontrast: 1, saettigung: 1, vignette: 0 }), vignette: 0 }
    if (neu.hintergrund.art === 'verlauf') neu.hintergrund.farben = neu.hintergrund.farben.map((f) => aufhellen(f))
    geaendert = true
  }
  if (ernst.some((b) => b.art === 'technik' && /leer|empty/i.test(b.text)) && neu.hintergrund.art === 'verlauf' && neu.hintergrund.farben.length < 2) {
    neu.hintergrund.farben = [neu.hintergrund.farben[0]!, '#ff5a36']
    geaendert = true
  }
  return geaendert ? neu : null
}

function aufhellen(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const k = (v: number): string => Math.min(255, Math.round(v * 0.6 + 255 * 0.4)).toString(16).padStart(2, '0')
  return `#${k((n >> 16) & 255)}${k((n >> 8) & 255)}${k(n & 255)}`
}
