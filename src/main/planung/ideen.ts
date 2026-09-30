// Herkunft: MoinStudio src/main/planung/ideen.ts (MIT), verallgemeinert: KI-Schicht statt Claude-Abo, Konto aus dem
// Creator-Profil statt fest beschriebener Kanäle, Titel nach den Regeln jeder Plattform.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { luecken, plusTage, rhythmusAus, tagVon, wochentag, type Rhythmus } from '@shared/kalender'
import { TEXT_REGELN, titelFuer, type Idee, type PlanungKiArt, type PlanungKiErgebnis, type TitelVorschlag, type WochenPlan } from '@shared/planung'
import type { Konto, Profil } from '@shared/profil'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { liesAbschnitte } from '../schnitt/transkript'
import { sprachName } from '../thumbnail/job'
import { ladeKarten, type Karte } from './karten'

/**
 * Planung mit der KI (ROADMAP 6.3): Ideenfinder je Konto, Titelvorschläge für eine Karte, Wochenplan. Läuft als Auftrag
 * über die KI-Schicht (jeder eingerichtete Weg), mit festem Schema. Richtung, Plattform, Sprache, Spiele, Formate und
 * Vorbilder kommen aus dem Konto; Titel werden nach den Regeln der Plattform geprüft und nötigenfalls gekürzt.
 */

export interface PlanungKiPayload {
  art: PlanungKiArt
  daten: string
  kontoId?: string
  /** Wunsch in Worten, z. B. „Halloween“ (nur ideen) */
  wunsch?: string
  /** Karte (nur titel) */
  karte?: string
  /** Heute als „2026-09-29“ (für Tests fest vorgebbar) */
  heute?: string
}

const IdeenZ = z.object({ ideen: z.array(z.object({ titel: z.string(), idee: z.string(), warum: z.string() })) })
const TitelZ = z.object({ titel: z.array(z.object({ titel: z.string(), warum: z.string() })) })
const WocheZ = z.object({
  plan: z.array(z.object({ karte: z.string(), termin: z.string(), grund: z.string() })),
  aufnehmen: z.array(z.object({ karte: z.string(), grund: z.string() })),
  hinweis: z.string()
})

const STAND: Record<string, string> = { idee: 'Idee', aufnahme: 'Aufnahme', schnitt: 'Schnitt', thumbnail: 'Thumbnail', upload: 'Upload', veroeffentlicht: 'veröffentlicht' }

/** Das Konto in Worten für die KI: Plattform, Sprache, Richtungen, Spiele, Formate, Vorbilder, bisherige Titel */
export function kontoBeschreibung(k: Konto): string {
  const teile = [
    `Konto „${k.name.trim() || t('konten.unbenannt')}“ auf ${t(`plattform.${k.plattform}`)}, Sprache ${sprachName(k.sprache)}.`,
    k.richtungen.length ? `Richtung: ${k.richtungen.join(', ')}.` : 'Richtung: noch offen – vielseitig bleiben.',
    k.spiele.length ? `Spiele: ${k.spiele.join(', ')}.` : '',
    k.formate.length ? `Formate: ${k.formate.map((f) => t(`format.${f}`)).join(', ')}.` : '',
    k.vorbildKanaele.length ? `Vorbilder (Stil, nicht kopieren): ${k.vorbildKanaele.join(', ')}.` : ''
  ]
  return teile.filter(Boolean).join(' ')
}

/** Titelregeln der Plattform in Worten */
export function titelRegel(k: Pick<Konto, 'plattform'>): string {
  const r = TEXT_REGELN[k.plattform]
  const laenge = r.titelMax ? `höchstens ${r.titelZiel} Zeichen (Plattform-Grenze ${r.titelMax})` : `ein kurzer Aufhänger, höchstens ${r.titelZiel} Zeichen (die Plattform hat keinen eigenen Titel, er wird der erste Satz)`
  const tags = r.hashtags.ort === 'titel' ? `, ${r.hashtags.min}–${r.hashtags.max} passende Hashtags am Ende des Titels` : ', keine Hashtags im Titel'
  return `${laenge}${tags}`
}

/** Wortstämme eines Titels in jeder Sprache: ohne Satzzeichen und kurze Füllwörter, Zahlen bleiben, lange Wörter mit den ersten 5 Buchstaben („überlebe“ = „überleben“) */
function woerter(titel: string): Set<string> {
  return new Set(
    titel
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .split(/\s+/)
      .filter((w) => /^\p{N}+$/u.test(w) || w.length > 3)
      .map((w) => w.slice(0, 5))
  )
}

/** Ähnlichkeit zweier Titel (Anteil gemeinsamer Wörter, 0–1) */
export function aehnlichkeit(a: string, b: string): number {
  const x = woerter(a)
  const y = woerter(b)
  if (!x.size || !y.size) return 0
  let gemeinsam = 0
  for (const w of x) if (y.has(w)) gemeinsam++
  return gemeinsam / Math.min(x.size, y.size)
}

/** Entfernt Ideen, die es schon gibt (als Karte) oder die sich untereinander wiederholen. */
export function ohneWiederholung(ideen: Idee[], vorhanden: string[]): Idee[] {
  const behalten: Idee[] = []
  for (const i of ideen) {
    const titel = i.titel.trim()
    if (!titel) continue
    if ([...vorhanden, ...behalten.map((b) => b.titel)].some((v) => aehnlichkeit(titel, v) >= 0.75)) continue
    behalten.push({ titel, idee: i.idee.trim(), warum: i.warum.trim() })
  }
  return behalten
}

function kartenListe(karten: Karte[]): string {
  return karten.length ? karten.map((k) => `- [${STAND[k.spalte]}] ${k.titel}`).join('\n') : '(noch keine)'
}

export function ideenPrompt(o: { konto: Konto; karten: Karte[]; andere: Karte[]; freunde: string[]; eigeneTitel: string[]; wunsch?: string; heute: string; anzahl: number }): string {
  const monat = new Date(`${o.heute}T12:00`).toLocaleString('de-DE', { month: 'long', year: 'numeric' })
  return `Du bist Ideen-Partner für einen Creator. ${kontoBeschreibung(o.konto)}

Finde ${o.anzahl} neue Video-Ideen für dieses Konto. Heute ist ${monat}.${o.wunsch ? `\nWunsch des Creators dazu: ${o.wunsch}` : ''}

Regeln:
- Jede Idee passt zu Richtung, Plattform und Formaten des Kontos und ist mit normalen Mitteln realistisch umsetzbar.
- Nichts erfinden: nur Dinge, die es wirklich gibt (Spiele, Mechaniken, Rezepte, Geräte, Orte).
- Keine Wiederholung: nichts, was es unten schon als Karte oder Video gibt, und keine zwei Ideen mit demselben Kern.
- Abwechslung bei den Formaten, passend zur Richtung (z. B. Challenge, Anleitung, Vergleich, Test, Reaktion, Geschichte, mit Gästen).
- Titel: ${titelRegel(o.konto)}; neugierig machend, gern mit Zahl oder Gegensatz, kein Clickbait, der nicht stimmt.
- Personen nur aus dieser Liste nennen: ${o.freunde.length ? o.freunde.join(', ') : '(keine festen Mitwirkenden bekannt)'}
- „idee“: 2–3 Sätze, was im Video passiert und was der Aufhänger in den ersten Sekunden ist.
- „warum“: ein Satz, warum das gerade ankommen könnte.
- Schreibe Titel, Idee und Grund in der Sprache ${sprachName(o.konto.sprache)}.
${o.eigeneTitel.length ? `\nBisherige Videos des Kontos (Stil, nicht wiederholen):\n${o.eigeneTitel.slice(0, 20).map((v) => `- ${v}`).join('\n')}\n` : ''}
Schon geplant:
${kartenListe(o.karten)}
${o.andere.length ? `\nGeplant auf anderen Konten des Creators (nicht doppeln):\n${kartenListe(o.andere)}\n` : ''}
Antworte nur mit JSON nach dem Schema.`
}

export function titelPrompt(o: { konto: Konto; karte: Karte; transkript: string; andere: string[] }): string {
  return `Schlage 5 Titel für ein Video vor. ${kontoBeschreibung(o.konto)}

Arbeitstitel: ${o.karte.titel}
Notizen: ${o.karte.notizen.trim() || '(keine)'}
${o.transkript ? `Anfang des Transkripts:\n${o.transkript}\n` : ''}
Regeln: in der Sprache ${sprachName(o.konto.sprache)}; ${titelRegel(o.konto)}; unterschiedliche Ansätze (Frage, Zahl, Gegensatz, Ich-Perspektive, Spannung); nur was im Video wirklich passiert. Nicht wie diese Titel des Kontos klingen: ${o.andere.slice(0, 15).join(' | ') || '(keine)'}
„warum“: ein kurzer Satz.

Antworte nur mit JSON nach dem Schema.`
}

export function wochenPrompt(o: { konten: Konto[]; karten: Karte[]; frei: { kanal: string; tag: string; zeit: string }[]; heute: string }): string {
  const tag = (x: string): string => `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][wochentag(x)]} ${x.slice(8)}.${x.slice(5, 7)}.`
  const name = (id: string): string => o.konten.find((k) => k.id === id)?.name || id
  return `Du planst die nächsten zwei Wochen für die Konten eines Creators. Heute ist ${tag(o.heute)} (${o.heute}).
${o.konten.map((k) => `- ${k.id}: ${kontoBeschreibung(k)}`).join('\n')}

Freie Upload-Termine laut Rhythmus:
${o.frei.map((f) => `- ${name(f.kanal)} (${f.kanal}): ${tag(f.tag)} ${f.zeit} → Termin "${f.tag}T${f.zeit}"`).join('\n') || '(keine)'}

Karten ohne Termin (id: Konto, Stand, Titel):
${o.karten.map((k) => `- ${k.id}: ${k.kontoId}, ${STAND[k.spalte]}, ${k.titel}`).join('\n') || '(keine)'}

Aufgabe:
- „plan“: Ordne Karten freien Terminen desselben Kontos zu. Videos, die schon weiter sind (Upload, Thumbnail, Schnitt), zuerst; eine Idee braucht noch Aufnahme und Schnitt, also frühestens in 5 Tagen. Nur Termine aus der Liste, jede Karte und jeder Termin höchstens einmal.
- „aufnehmen“: bis zu 3 Karten, die diese Woche aufgenommen werden sollten, damit die Termine klappen.
- „hinweis“: ein Satz, z. B. wenn Ideen fehlen.
- „grund“: kurz, warum. Gründe und Hinweis auf Deutsch.

Antworte nur mit JSON nach dem Schema.`
}

/** Prüft den Wochenplan: nur bekannte Karten, nur freie Termine des richtigen Kontos, alles höchstens einmal. */
export function pruefeWoche(roh: WochenPlan, karten: Karte[], frei: { kanal: string; tag: string; zeit: string }[]): WochenPlan {
  const karteVon = new Map(karten.map((k) => [k.id, k]))
  const genutzt = new Set<string>()
  const plan = roh.plan.filter((p) => {
    const k = karteVon.get(p.karte)
    const passt = !!k && frei.some((f) => f.kanal === k.kontoId && `${f.tag}T${f.zeit}` === p.termin)
    if (!passt || genutzt.has(p.karte) || genutzt.has(p.termin + k.kontoId)) return false
    genutzt.add(p.karte).add(p.termin + k.kontoId)
    return true
  })
  const aufnehmen = roh.aufnehmen.filter((a, i, alle) => karteVon.has(a.karte) && alle.findIndex((x) => x.karte === a.karte) === i).slice(0, 3)
  return { plan, aufnehmen, hinweis: roh.hinweis ?? '' }
}

/** Upload-Rhythmus aller Konten aus dem Profil (Schlüssel = Konto-ID) */
export const rhythmusAusProfil = (p: Profil): Rhythmus => rhythmusAus(Object.fromEntries(p.konten.map((k) => [k.id, k.rhythmus])))

/** Ideen nachbearbeiten: ohne Wiederholungen, Titel nach den Regeln der Plattform, höchstens 10 */
export function ideenFertig(roh: Idee[], konto: Konto, vorhanden: string[]): Idee[] {
  return ohneWiederholung(
    roh.map((i) => ({ ...i, titel: titelFuer(i.titel, konto.plattform) })),
    vorhanden
  ).slice(0, 10)
}

export async function planungKiJob(p: PlanungKiPayload, ctx: JobContext<unknown>, d: { ki: KiSchicht; profil: () => Promise<Profil> }): Promise<PlanungKiErgebnis> {
  const heute = p.heute ?? tagVon(new Date())
  const profil = await d.profil()
  const karten = await ladeKarten(p.daten)
  const konto = (id: string | undefined): Konto => {
    const k = profil.konten.find((x) => x.id === id)
    if (!k) throw new Error(t('thumb.auftrag.keinKonto'))
    return k
  }
  if (p.art === 'ideen') {
    const k = konto(p.kontoId)
    ctx.progress(10, t('planung.schritt.ideen'))
    const eigene = karten.filter((x) => x.kontoId === k.id)
    const prompt = ideenPrompt({ konto: k, karten: eigene, andere: karten.filter((x) => x.kontoId !== k.id), freunde: profil.freunde.map((f) => f.name).filter(Boolean), eigeneTitel: k.metadaten?.videos.map((v) => v.titel) ?? [], wunsch: p.wunsch?.trim() || undefined, heute, anzahl: 12 })
    const a = await d.ki.frage({ name: 'planung-ideen', system: 'You are a creative partner for video creators. You follow the rules exactly.', prompt, schema: IdeenZ, stufe: 'stark', maxAusgabe: 4000 }, ctx)
    ctx.progress(100, t('jobs.schritt.fertig'))
    return { art: 'ideen', ideen: ideenFertig(a.daten.ideen, k, [...eigene.map((x) => x.titel), ...(k.metadaten?.videos.map((v) => v.titel) ?? [])]) }
  }
  if (p.art === 'titel') {
    const karte = karten.find((x) => x.id === p.karte)
    if (!karte) throw new Error(t('planung.fehler.karte'))
    const k = konto(karte.kontoId)
    ctx.progress(10, t('planung.schritt.titel'))
    const jsonl = karte.schnitt ? await readFile(join(p.daten, 'schnitt', karte.schnitt, 'transkript.jsonl'), 'utf8').catch(() => '') : ''
    const transkript = liesAbschnitte(jsonl)
      .map((a) => a.text.trim())
      .join(' ')
      .slice(0, 2500)
    const prompt = titelPrompt({ konto: k, karte, transkript, andere: karten.filter((x) => x.kontoId === k.id && x.id !== karte.id).map((x) => x.titel) })
    const a = await d.ki.frage({ name: 'planung-titel', system: 'You write honest, catchy video titles that follow the platform rules exactly.', prompt, schema: TitelZ, stufe: 'schnell', maxAusgabe: 1500 }, ctx)
    ctx.progress(100, t('jobs.schritt.fertig'))
    const titel: TitelVorschlag[] = a.daten.titel.filter((x) => x.titel.trim()).map((x) => ({ titel: titelFuer(x.titel, k.plattform), warum: x.warum.trim() }))
    return { art: 'titel', titel: titel.filter((x, i) => titel.findIndex((y) => y.titel === x.titel) === i).slice(0, 5) }
  }
  ctx.progress(10, t('planung.schritt.woche'))
  const frei = luecken(rhythmusAusProfil(profil), karten.map((k) => ({ kanal: k.kontoId, termin: k.termin })), heute, plusTage(heute, 13), heute)
  const ohne = karten.filter((k) => !k.termin && k.spalte !== 'veroeffentlicht')
  const prompt = wochenPrompt({ konten: profil.konten, karten: ohne, frei, heute })
  const a = await d.ki.frage({ name: 'planung-woche', system: 'You plan upload schedules for video creators.', prompt, schema: WocheZ, stufe: 'schnell', maxAusgabe: 2500 }, ctx)
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { art: 'woche', woche: pruefeWoche(a.daten, ohne, frei) }
}
