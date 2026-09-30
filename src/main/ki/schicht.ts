import { z } from 'zod'
import type { JobContext } from '../jobs/queue'
import { t } from '../i18n'
import { jsonAusText } from './json'
import { kostenAusNutzung, kostenSchaetzung } from './kosten'
import { KiLimitFehler, type KiAnbieter, type KiAuftrag, type KiErgebnis, type RohAnfrage } from './typen'

/** Aktivierte Wege in Rückfall-Reihenfolge (aus dem Creator-Profil) */
export type KiReihenfolge = () => Promise<{ id: string; aktiv: boolean }[]>

/** Rückfrage vor einem kostenpflichtigen Aufruf (usd = Schätzung, null = unbekannt): true = freigegeben */
export type KostenFreigabe = (info: { anbieter: string; auftrag: string; usd: number | null }) => Promise<boolean>

export class KeineKiFehler extends Error {}
export class KostenAbgelehnt extends Error {}

const MAX_REPARATUREN = 2

/**
 * Führt Aufträge über die Anbieter aus, die der Nutzer gewählt hat:
 * - immer nur ein KI-Prozess gleichzeitig (Abo-Limits, Rechenlast lokaler Modelle),
 * - Rückfall auf den nächsten Weg, wenn einer nicht bereit ist, an ein Limit stößt oder scheitert,
 * - gültiges JSON erzwungen: Anbieter ohne Schema bekommen „nur JSON“ und bis zu zwei Reparaturrunden mit den
 *   Zod-Fehlern,
 * - vor kostenpflichtigen Aufrufen die geschätzten Kosten zur Freigabe, danach Buchung in die Monatssumme,
 * - sind alle Wege am Limit und läuft der Auftrag als Aufgabe, wartet die Aufgabe bis zum frühesten Reset.
 */
export class KiSchicht {
  private sperre: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly anbieter: Map<string, KiAnbieter>,
    private readonly reihenfolge: KiReihenfolge,
    private readonly freigabe: KostenFreigabe = async () => true,
    private readonly buchen: (usd: number) => Promise<void> = async () => undefined
  ) {}

  /** Anbieter, die für diesen Auftrag infrage kommen, in der Reihenfolge des Nutzers */
  async kandidaten(brauchtBilder = false): Promise<KiAnbieter[]> {
    return (await this.reihenfolge())
      .filter((w) => w.aktiv)
      .map((w) => this.anbieter.get(w.id))
      .filter((a): a is KiAnbieter => !!a && (!brauchtBilder || a.faehigkeiten.bilderSehen))
  }

  /** Gibt es überhaupt einen einsatzbereiten Weg? (für saubere Hinweise statt Fehlern in der Oberfläche) */
  async verfuegbar(brauchtBilder = false): Promise<boolean> {
    for (const a of await this.kandidaten(brauchtBilder)) if ((await a.pruefe().catch(() => null))?.bereit) return true
    return false
  }

  frage<T>(auftrag: KiAuftrag<T>, ctx?: JobContext<unknown>): Promise<KiErgebnis<T>> {
    // Einer nach dem anderen: der nächste Auftrag startet erst, wenn der vorige fertig (oder gescheitert) ist.
    const lauf = this.sperre.then(() => this.ausfuehren(auftrag, ctx))
    this.sperre = lauf.catch(() => undefined)
    return lauf
  }

  private async ausfuehren<T>(auftrag: KiAuftrag<T>, ctx?: JobContext<unknown>): Promise<KiErgebnis<T>> {
    const kandidaten = await this.kandidaten(auftrag.brauchtBilder)
    if (!kandidaten.length) throw new KeineKiFehler(auftrag.brauchtBilder ? t('ki.keinBildAnbieter') : t('ki.keinAnbieter'))
    const schema = z.toJSONSchema(auftrag.schema, { io: 'output' }) as Record<string, unknown>
    const basis: RohAnfrage = {
      system: auftrag.system,
      prompt: auftrag.prompt,
      bilder: auftrag.bilder ?? [],
      schema,
      stufe: auftrag.stufe ?? 'stark',
      maxAusgabe: auftrag.maxAusgabe ?? 4000
    }
    const hinweise: string[] = []
    let fruehesterReset: Date | null = null
    let limitGesehen = false

    for (const a of kandidaten) {
      await ctx?.yield()
      const status = await a.pruefe().catch((e: unknown) => ({ bereit: false, hinweis: e instanceof Error ? e.message : String(e) }))
      if (!status.bereit) {
        hinweise.push(`${a.id}: ${status.hinweis ?? '–'}`)
        continue
      }
      // Lokale Modelle melden erst bei der Prüfung, ob sie Bilder sehen können
      if (auftrag.brauchtBilder && !a.faehigkeiten.bilderSehen) continue
      // API-Schlüssel kosten Geld: vorher Schätzung zeigen und freigeben lassen, danach die echte Nutzung buchen
      const preis = a.art === 'api' ? ((await a.preis?.(basis.stufe).catch(() => null)) ?? null) : null
      const geschaetzt = a.art === 'api' ? kostenSchaetzung(basis, preis) : null
      if (a.art === 'api' && !(await this.freigabe({ anbieter: a.id, auftrag: auftrag.name, usd: geschaetzt }))) throw new KostenAbgelehnt(t('ki.kostenAbgelehnt'))
      try {
        const erg = await this.mitReparatur(a, basis, auftrag.schema, ctx)
        const kosten = a.art === 'api' ? ((erg.nutzung ? kostenAusNutzung(erg.nutzung, preis) : null) ?? geschaetzt) : null
        if (kosten !== null && kosten > 0) await this.buchen(kosten)
        return { ...erg, anbieter: a.id, kostenUsd: kosten }
      } catch (err) {
        if (err instanceof KiLimitFehler) {
          limitGesehen = true
          if (err.resetAt && (!fruehesterReset || err.resetAt < fruehesterReset)) fruehesterReset = err.resetAt
          hinweise.push(`${a.id}: ${err.message}`)
          continue
        }
        if (ctx?.signal.aborted) throw err
        hinweise.push(`${a.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    // Alle Wege am Limit: als Aufgabe bis zum frühesten Reset warten (danach neuer Versuch mit Checkpoint)
    if (limitGesehen && ctx) ctx.waitUntil(new Date((fruehesterReset?.getTime() ?? Date.now() + 60 * 60_000) + 60_000))
    throw new Error(t('ki.alleGescheitert', { liste: hinweise.join(' · ') }))
  }

  private async mitReparatur<T>(a: KiAnbieter, basis: RohAnfrage, schema: z.ZodType<T>, ctx?: JobContext<unknown>): Promise<Omit<KiErgebnis<T>, 'anbieter' | 'kostenUsd'>> {
    let anfrage = a.faehigkeiten.jsonSchema ? basis : { ...basis, system: `${basis.system}\n\n${NUR_JSON}\n${JSON.stringify(basis.schema)}` }
    let letzterFehler = ''
    for (let runde = 0; runde <= MAX_REPARATUREN; runde++) {
      await ctx?.yield()
      const antwort = await a.frage(anfrage, ctx)
      let roh: unknown
      try {
        roh = antwort.strukturiert !== undefined ? antwort.strukturiert : jsonAusText(antwort.text)
      } catch (e) {
        letzterFehler = e instanceof Error ? e.message : String(e)
        anfrage = reparaturAnfrage(basis, antwort.text, letzterFehler)
        continue
      }
      const geprueft = schema.safeParse(roh)
      if (geprueft.success) return { daten: geprueft.data, modell: antwort.modell, nutzung: antwort.nutzung, reparaturen: runde }
      letzterFehler = geprueft.error.issues
        .slice(0, 12)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')
      anfrage = reparaturAnfrage(basis, antwort.text || JSON.stringify(roh), letzterFehler)
    }
    throw new Error(t('ki.ungueltig', { fehler: letzterFehler }))
  }
}

const NUR_JSON = 'Answer with a single JSON value only – no prose, no code fence. It must validate against this JSON Schema:'

function reparaturAnfrage(basis: RohAnfrage, vorher: string, fehler: string): RohAnfrage {
  return {
    ...basis,
    system: `${basis.system}\n\n${NUR_JSON}\n${JSON.stringify(basis.schema)}`,
    prompt: `${basis.prompt}\n\n---\nYour previous answer was not valid:\n${fehler}\n\nPrevious answer (excerpt):\n${vorher.slice(0, 4000)}\n\nReturn the corrected, complete JSON now.`
  }
}

/**
 * Hülle um einen Anbieter: Vor dem ersten Senden muss die Person zugestimmt haben (ROADMAP 3.8). Ohne Zustimmung wird
 * nichts gesendet. Die Fähigkeiten bleiben die aktuellen des Anbieters (lokale Modelle melden sie erst bei der Prüfung).
 */
export function mitZustimmung(a: KiAnbieter, zustimmung: (id: string) => Promise<boolean>): KiAnbieter {
  return {
    id: a.id,
    art: a.art,
    get faehigkeiten() {
      return a.faehigkeiten
    },
    pruefe: () => a.pruefe(),
    frage: async (r, ctx) => {
      if (!(await zustimmung(a.id))) throw new Error(t('ki.keineZustimmung'))
      return a.frage(r, ctx)
    },
    ...(a.preis ? { preis: (st: RohAnfrage['stufe']) => a.preis!(st) } : {})
  }
}
