// Herkunft: MoinStudio src/main/planung/aktionen.ts (MIT), verallgemeinert: Konten aus dem Creator-Profil, Rhythmus im
// Profil, jede MCP-fähige App statt nur Claude Desktop.
import { luecken, plusTage, rhythmusAus, tagVon } from '@shared/kalender'
import type { Profil } from '@shared/profil'
import { t } from '../i18n'
import { rhythmusAusProfil } from './ideen'
import { aendereKarte, ladeKarten, loescheKarte, neueKarte, pruefeAenderung, SPALTEN, verschiebeKarte, type Karte, type Spalte } from './karten'

/**
 * Planung aus einer MCP-App (ROADMAP 6.x): alle Aktionen des Werkzeugs `planning`. Ohne Electron, damit sie sich direkt
 * im Datenordner testen lassen. Kanäle heißen hier „channel“: die Konten des Creator-Profils (ID aus channels_list).
 */

export const PLANUNG_AKTIONEN = ['liste', 'kalender', 'anlegen', 'aendern', 'verschieben', 'loeschen', 'rhythmus', 'rhythmus_setzen', 'ideen', 'titel', 'wochenplan', 'crossposting', 'ergebnis'] as const
export type PlanungAktion = (typeof PLANUNG_AKTIONEN)[number]

export interface PlanungArgs {
  aktion: PlanungAktion
  konto?: string
  spalte?: string
  karte?: string
  titel?: string
  notizen?: string
  termin?: string | null
  checkliste?: { text: string; erledigt: boolean }[]
  index?: number
  von?: string
  bis?: string
  wunsch?: string
  auftrag?: string
  rhythmus?: unknown
}

/** KI-Aufträge und Profil gibt es nur in der laufenden App */
export interface PlanungZugang {
  profil(): Promise<Profil>
  setzeRhythmus(kontoId: string, slots: Profil['konten'][number]['rhythmus']): Promise<void>
  starte(art: 'ideen' | 'titel' | 'woche', o: { kontoId?: string; wunsch?: string; karte?: string }): Promise<string>
  stand(auftrag: string): Promise<unknown>
  crossposting(karte: string): Promise<unknown>
}

const kurz = (k: Karte): Record<string, unknown> => ({
  id: k.id,
  konto: k.kontoId,
  stand: k.spalte,
  titel: k.titel,
  termin: k.termin,
  notizen: k.notizen || undefined,
  checkliste: k.checkliste.length ? k.checkliste : undefined,
  schnittProjekt: k.schnitt ?? undefined,
  thumbnail: k.thumbnail?.bild ? { bild: k.thumbnail.bild, gewaehlt: k.thumbnail.gewaehlt } : undefined,
  texte: k.texte ?? undefined,
  crossposting: k.crossposting.length ? k.crossposting : undefined
})

const spalteAus = (s: unknown): Spalte => {
  if (!SPALTEN.includes(s as Spalte)) throw new Error(t('planung.fehler.spalte', { liste: SPALTEN.join(', ') }))
  return s as Spalte
}
const terminAus = (x: unknown): string | null => {
  if (x === null || x === '') return null
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(x)) throw new Error(t('planung.fehler.termin'))
  return x.length === 10 ? `${x}T17:00` : x
}

export async function planungAktion(daten: string, a: PlanungArgs, z: PlanungZugang, geraet = 'MCP'): Promise<unknown> {
  const karten = (): Promise<Karte[]> => ladeKarten(daten)
  const profil = await z.profil()
  const kontoAus = (k: unknown): string => {
    const id = typeof k === 'string' ? k : profil.konten[0]?.id
    if (!id || !profil.konten.some((x) => x.id === id)) throw new Error(t('planung.fehler.konto', { liste: profil.konten.map((x) => `${x.id} (${x.name})`).join(', ') || '–' }))
    return id
  }
  switch (a.aktion) {
    case 'liste': {
      const alle = (await karten()).filter((k) => (!a.konto || k.kontoId === a.konto) && (!a.spalte || k.spalte === a.spalte))
      return { karten: alle.sort((x, y) => SPALTEN.indexOf(x.spalte) - SPALTEN.indexOf(y.spalte) || x.ordnung - y.ordnung).map(kurz) }
    }
    case 'kalender': {
      const heute = tagVon(new Date())
      const von = a.von ?? heute
      const bis = a.bis ?? plusTage(von, 27)
      const alle = await karten()
      const termine = alle.filter((k) => k.termin && k.termin.slice(0, 10) >= von && k.termin.slice(0, 10) <= bis).sort((x, y) => x.termin!.localeCompare(y.termin!))
      return {
        von,
        bis,
        termine: termine.map(kurz),
        freieTermine: luecken(rhythmusAusProfil(profil), alle.map((k) => ({ kanal: k.kontoId, termin: k.termin })), von, bis, heute).map((l) => ({ konto: l.kanal, tag: l.tag, zeit: l.zeit })),
        ohneTermin: alle.filter((k) => !k.termin && k.spalte !== 'veroeffentlicht').map(kurz)
      }
    }
    case 'anlegen': {
      const titel = String(a.titel ?? '').trim()
      if (!titel) throw new Error(t('planung.fehler.titel'))
      const k = await neueKarte(daten, { kontoId: kontoAus(a.konto), titel, spalte: a.spalte ? spalteAus(a.spalte) : 'idee', notizen: a.notizen ?? '', termin: a.termin === undefined ? null : terminAus(a.termin) }, geraet)
      return kurz(k)
    }
    case 'aendern': {
      if (!a.karte) throw new Error(t('planung.fehler.karte'))
      const roh: Record<string, unknown> = {}
      if (a.titel !== undefined) roh['titel'] = a.titel
      if (a.notizen !== undefined) roh['notizen'] = a.notizen
      if (a.termin !== undefined) roh['termin'] = terminAus(a.termin)
      if (a.checkliste !== undefined) roh['checkliste'] = a.checkliste
      if (a.konto !== undefined) roh['kontoId'] = kontoAus(a.konto)
      if (a.spalte !== undefined) roh['spalte'] = spalteAus(a.spalte)
      return kurz(await aendereKarte(daten, a.karte, pruefeAenderung(roh), geraet))
    }
    case 'verschieben': {
      if (!a.karte) throw new Error(t('planung.fehler.karte'))
      return kurz(await verschiebeKarte(daten, a.karte, { spalte: spalteAus(a.spalte), index: a.index ?? Number.MAX_SAFE_INTEGER, kontoId: a.konto ? kontoAus(a.konto) : undefined }, geraet))
    }
    case 'loeschen': {
      const k = (await karten()).find((x) => x.id === a.karte)
      if (!k) throw new Error(t('planung.fehler.karte'))
      await loescheKarte(daten, k.id)
      return { geloescht: k.titel }
    }
    case 'rhythmus':
      return rhythmusAusProfil(profil)
    case 'rhythmus_setzen': {
      // { "<konto-id>": [{ "tag": 5, "zeit": "18:00" }] } – nur genannte Konten ändern sich
      const r = rhythmusAus(a.rhythmus)
      for (const [id, slots] of Object.entries(r)) await z.setzeRhythmus(kontoAus(id), slots)
      return rhythmusAusProfil(await z.profil())
    }
    case 'ideen':
      return { auftrag: await z.starte('ideen', { kontoId: kontoAus(a.konto), wunsch: a.wunsch }), hinweis: 'Fetch the result with action "ergebnis" and this auftrag id (takes about a minute).' }
    case 'titel':
      if (!a.karte) throw new Error(t('planung.fehler.karte'))
      return { auftrag: await z.starte('titel', { karte: a.karte }), hinweis: 'Fetch the result with action "ergebnis".' }
    case 'wochenplan':
      return { auftrag: await z.starte('woche', {}), hinweis: 'Fetch the result with action "ergebnis"; then set dates with action "aendern".' }
    case 'crossposting':
      if (!a.karte) throw new Error(t('planung.fehler.karte'))
      return z.crossposting(a.karte)
    case 'ergebnis':
      if (!a.auftrag) throw new Error(t('planung.fehler.auftrag'))
      return (await z.stand(a.auftrag)) ?? { fehler: t('planung.fehler.auftrag') }
    default:
      throw new Error(t('planung.fehler.aktion', { aktion: String((a as { aktion?: unknown }).aktion) }))
  }
}
