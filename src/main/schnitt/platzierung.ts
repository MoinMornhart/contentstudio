// Plätze für Effekte aus der Bibliothek (aus MoinStudio v0.51.0): „KI entscheidet“ fragt die KI nach guten Stellen,
// innerhalb fester Grenzen – nicht im Hook, nicht auf Höhepunkten, nie zwei Effekte gleichzeitig, nicht zu dicht
// hintereinander. Antwortet die KI nicht oder passt ihr Vorschlag nicht, verteilt eine Regel auf Satzenden.
import { z } from 'zod'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'

/** Hook: in den ersten Sekunden des fertigen Videos kein automatischer Bibliotheks-Effekt */
export const HOOK = 15
/** Mindestabstand zwischen zwei automatisch gesetzten Bibliotheks-Effekten (fertiges Video) */
export const ABSTAND = 20
/** Rund um laute Momente (Höhepunkte) frei lassen */
export const HOEHEPUNKT_PUFFER = 3

export interface Bereich {
  von: number
  bis: number
}

export interface PlatzEffekt {
  id: string
  name: string
  /** Sekunden, die der Effekt sichtbar oder hörbar ist */
  dauer: number
  /** z. B. „Greenscreen-Video“, „Bild“, „Sound“ */
  art: string
  /** fester Zeitpunkt: Sekunden ab Start oder vor dem Ende */
  fest?: { bezug: 'start' | 'ende'; sekunden: number }
}

export interface Platz {
  id: string
  /** Schnittzeit (fertiges Video) */
  bei: number
}

/** Liegt ein Platz innerhalb der Grenzen? Zeiten in Schnittzeit. */
export function platzOk(bei: number, dauer: number, o: { laenge: number; belegt: Bereich[]; bib: number[]; laut: number[] }): boolean {
  if (bei < HOOK || bei + dauer > o.laenge - 1) return false
  if (o.belegt.some((b) => bei < b.bis + 0.5 && bei + dauer > b.von - 0.5)) return false
  if (o.bib.some((t) => Math.abs(t - bei) < ABSTAND)) return false
  if (o.laut.some((t) => t > bei - HOEHEPUNKT_PUFFER && t < bei + dauer + HOEHEPUNKT_PUFFER)) return false
  return true
}

/**
 * Regel-Verteilung (ohne KI oder als Rettung): Kandidaten sind Satzenden; jeder Effekt bekommt den freien Kandidaten,
 * der seinem Zielpunkt am nächsten liegt (gleichmäßig verteilt, nicht vor 30 s). Passt nichts, fällt der Effekt weg.
 */
export function regelPlaetze(effekte: { id: string; dauer: number }[], o: { laenge: number; satzenden: number[]; belegt: Bereich[]; laut: number[]; bib?: number[] }): Platz[] {
  const bib = [...(o.bib ?? [])]
  const belegt = [...o.belegt]
  const kandidaten = o.satzenden.length ? o.satzenden : Array.from({ length: Math.floor(o.laenge / 5) }, (_, i) => i * 5)
  const plaetze: Platz[] = []
  effekte.forEach((e, k) => {
    const ziel = Math.max(30, (o.laenge * (k + 1)) / (effekte.length + 1))
    const t = kandidaten.filter((x) => platzOk(x, e.dauer, { laenge: o.laenge, belegt, bib, laut: o.laut })).sort((a, b) => Math.abs(a - ziel) - Math.abs(b - ziel))[0]
    if (t === undefined) return
    plaetze.push({ id: e.id, bei: t })
    bib.push(t)
    belegt.push({ von: t, bis: t + e.dauer })
  })
  return plaetze
}

/**
 * Fester Zeitpunkt (so gewollt – nur gegen Überschneidung prüfen): liegt dort schon etwas, rückt der Effekt direkt
 * dahinter, beim Bezug „Ende“ davor. Null, wenn er dann nicht mehr ins Video passt.
 */
export function festerPlatz(e: PlatzEffekt & { fest: NonNullable<PlatzEffekt['fest']> }, laenge: number, belegt: Bereich[]): number | null {
  const vomEnde = e.fest.bezug === 'ende'
  let t = vomEnde ? laenge - e.fest.sekunden : e.fest.sekunden
  for (let i = 0; i < 20; i++) {
    const stoss = belegt.find((b) => t < b.bis + 0.3 && t + e.dauer > b.von - 0.3)
    if (!stoss) break
    t = vomEnde ? stoss.von - 0.3 - e.dauer : stoss.bis + 0.3
  }
  return t >= 0 && t + 0.2 < laenge ? t : null
}

export const PlaetzeZ = z.object({ plaetze: z.array(z.object({ id: z.string(), bei: z.number(), warum: z.string().optional() })) })

export function platzPrompt(o: { beschreibung: string; laenge: number; effekte: PlatzEffekt[]; saetze: { bei: number; text: string }[]; laut: number[]; belegt: Bereich[] }): string {
  const t = (s: number): string => s.toFixed(1)
  return `${o.beschreibung} Das fertige Video ist ${t(o.laenge)} s lang.
Setze diese Effekte aus der eigenen Bibliothek des Creators an gute Stellen (Zeiten = Sekunden im fertigen Video):
${o.effekte.map((e) => `- id ${e.id}: „${e.name}“ (${e.art}, ${t(e.dauer)} s)`).join('\n')}

Feste Grenzen:
- nicht in den ersten ${HOOK} s (Hook) und nicht in der letzten Sekunde
- nicht auf Höhepunkten (laute Momente ±${HOEHEPUNKT_PUFFER} s): ${o.laut.map(t).join(', ') || 'keine'}
- nie gleichzeitig mit einem anderen Effekt; schon belegt: ${o.belegt.map((b) => `${t(b.von)}–${t(b.bis)}`).join(', ') || 'nichts'}
- mindestens ${ABSTAND} s Abstand zwischen diesen Effekten
- am besten in einer kurzen Sprechpause nach einem abgeschlossenen Gedanken, nie mitten in einer Pointe
- passend zum Namen: eine Abo-/Like-Animation nach dem ersten Höhepunkt (30–90 s) oder kurz vor dem Ende, ein
  Meme-Sound direkt nach einer passenden Aussage, ein Übergang an einem Themenwechsel
- passt ein Effekt nirgends, lass ihn weg

Gesprochene Sätze (Ende im fertigen Video):
${o.saetze.map((s) => `[${t(s.bei)}] ${s.text}`).join('\n') || '(kein Transkript)'}

Antworte nur mit JSON nach dem Schema: plaetze = [{id, bei, warum}].`
}

/**
 * Plätze für alle gewählten Effekte: erst die festen, dann „KI entscheidet“ (KI-Vorschlag, gegen die Grenzen geprüft;
 * was nicht passt, setzt die Regel). `belegt` und `laut` in Schnittzeit; `saetze` = Satzenden in Schnittzeit.
 */
export async function waehlePlaetze(
  effekte: PlatzEffekt[],
  o: { laenge: number; belegt: Bereich[]; laut: number[]; saetze: { bei: number; text: string }[]; beschreibung: string; ki?: { schicht: KiSchicht; ctx: JobContext<unknown> } | null }
): Promise<Platz[]> {
  const belegt = [...o.belegt]
  const bib: number[] = []
  const plaetze: Platz[] = []
  const setze = (e: PlatzEffekt, bei: number): void => {
    plaetze.push({ id: e.id, bei })
    bib.push(bei)
    belegt.push({ von: bei, bis: bei + e.dauer })
  }
  for (const e of effekte) {
    if (!e.fest) continue
    const t = festerPlatz({ ...e, fest: e.fest }, o.laenge, belegt)
    if (t !== null) setze(e, t)
  }
  const frei = effekte.filter((e) => !e.fest)
  if (!frei.length) return plaetze
  let vorschlag: Platz[] = []
  if (o.ki && (await o.ki.schicht.kandidaten()).length) {
    vorschlag = await o.ki.schicht
      .frage({ name: 'bib-platz', system: 'You place a creator’s own effects in a finished video. Respect every hard limit.', prompt: platzPrompt({ beschreibung: o.beschreibung, laenge: o.laenge, effekte: frei, saetze: o.saetze, laut: o.laut, belegt }), schema: PlaetzeZ, stufe: 'schnell', maxAusgabe: 1500 }, o.ki.ctx)
      .then((a) => a.daten.plaetze)
      .catch(() => [])
  }
  const offen: PlatzEffekt[] = []
  for (const e of frei) {
    const v = vorschlag.find((x) => x.id === e.id && Number.isFinite(x.bei))
    if (v && platzOk(v.bei, e.dauer, { laenge: o.laenge, belegt, bib, laut: o.laut })) setze(e, v.bei)
    else offen.push(e)
  }
  for (const r of regelPlaetze(offen, { laenge: o.laenge, satzenden: o.saetze.map((s) => s.bei), belegt, laut: o.laut, bib })) {
    const e = offen.find((x) => x.id === r.id)
    if (e) setze(e, r.bei)
  }
  return plaetze
}
