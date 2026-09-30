import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { neueId, type Konto, type Profil } from '@shared/profil'
import {
  KiAnalyseSchema,
  REGEL_KATEGORIEN,
  StilbuchSchema,
  VorbilderDateiSchema,
  type BeispielStilbuch,
  type Regel,
  type Stilbuch,
  type Vorbild
} from '@shared/thumbnail'
import { analysiere } from '../bild/analyse'
import { ausHex, dekodiere, liesBild } from '../bild/rohbild'
import { liesMitKonfliktkopien, writeJsonAtomic } from '../data/jsonfile'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import type { ProfilStore } from '../profil/store'
import { zielOrdner } from '../profil/ipc'

/**
 * Vorbilder und Stilbuch je Kanal (ROADMAP 4.1). Vorbilder kommen per Datei, Ablegen, Zwischenablage oder Video-Link
 * (nur das öffentliche Thumbnail). Jedes Bild wird lokal vermessen; mit Bild-KI kommt eine genaue Beschreibung dazu.
 * Aus allen aktiven Vorbildern entsteht automatisch das Stilbuch des Kanals, gewichtet nach der Wichtigkeit, die der
 * Creator jedem Vorbild gibt. Alles bleibt im Datenordner unter `vorbilder/<konto-id>/`.
 */

const DATEI = 'vorbilder.json'
const STILBUCH = 'stilbuch.json'

export type VorbildQuelle = { art: 'datei' | 'ablegen'; pfad: string } | { art: 'zwischenablage'; png: Buffer } | { art: 'link'; url: string }

/** Video-ID aus einem YouTube-Link (watch, youtu.be, shorts, live, embed) */
export function youtubeId(url: string): string | null {
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/))([\w-]{11})/.exec(url.trim())
  return m?.[1] ?? null
}

/** Lädt das öffentliche Thumbnail und den Titel eines Videos (ohne Anmeldung, ohne API-Schlüssel). */
export async function ladeLinkVorschau(url: string, holen: typeof fetch = fetch): Promise<{ bild: Buffer; titel: string | null; kanal: string | null; link: string }> {
  const id = youtubeId(url)
  if (!id) throw new Error('youtube-link')
  const link = `https://www.youtube.com/watch?v=${id}`
  let bild: Buffer | null = null
  for (const groesse of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const r = await holen(`https://i.ytimg.com/vi/${id}/${groesse}.jpg`)
    // YouTube liefert für fehlende Größen ein graues 120×90-Bild mit Status 404
    if (r.ok) {
      bild = Buffer.from(await r.arrayBuffer())
      break
    }
  }
  if (!bild) throw new Error('thumbnail')
  let titel: string | null = null
  let kanal: string | null = null
  try {
    const o = await holen(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`)
    if (o.ok) {
      const d = (await o.json()) as { title?: string; author_name?: string }
      titel = d.title ?? null
      kanal = d.author_name ?? null
    }
  } catch {
    // Titel ist nur eine Hilfe
  }
  return { bild, titel, kanal, link }
}

export class VorbildStore {
  /** Änderungen nacheinander (paralleles Ablegen mehrerer Bilder darf keinen Eintrag verlieren) */
  private sperre: Promise<unknown> = Promise.resolve()

  private nacheinander<T>(fn: () => Promise<T>): Promise<T> {
    const lauf = this.sperre.then(fn)
    this.sperre = lauf.catch(() => undefined)
    return lauf
  }

  constructor(
    private readonly profil: ProfilStore,
    private readonly holen: typeof fetch = fetch
  ) {}

  private async ordner(kontoId: string): Promise<string> {
    return this.profil.absolut(zielOrdner('vorbild', kontoId))
  }

  private async lies(kontoId: string): Promise<Vorbild[]> {
    try {
      const text = await liesMitKonfliktkopien(join(await this.ordner(kontoId), DATEI))
      return VorbilderDateiSchema.parse(JSON.parse(text)).vorbilder
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  private async schreibe(kontoId: string, vorbilder: Vorbild[]): Promise<void> {
    await writeJsonAtomic(join(await this.ordner(kontoId), DATEI), { version: 1, vorbilder })
  }

  /** Alle Vorbilder des Kontos. Im Assistenten hochgeladene Bilder werden dabei übernommen und vermessen. */
  async liste(kontoId: string): Promise<Vorbild[]> {
    const vorbilder = await this.lies(kontoId)
    const konto = (await this.profil.laden()).konten.find((k) => k.id === kontoId)
    const bekannt = new Set(vorbilder.map((v) => v.datei))
    const neu = (konto?.vorbildBilder ?? []).filter((d) => !bekannt.has(d))
    if (!neu.length) return vorbilder
    for (const datei of neu) vorbilder.push(await this.eintrag(datei, 'datei', {}))
    await this.schreibe(kontoId, vorbilder)
    return vorbilder
  }

  private async eintrag(datei: string, quelle: Vorbild['quelle'], extra: Partial<Vorbild>): Promise<Vorbild> {
    const lokal = await liesBild(await this.profil.absolut(datei))
      .then(analysiere)
      .catch(() => null)
    return { id: neueId('vorbild'), datei, quelle, link: null, titel: null, kanal: null, hinzugefuegt: new Date().toISOString(), aktiv: true, gewicht: 3, lokal, ki: null, ...extra }
  }

  /** Neues Vorbild aufnehmen: Bild in den Datenordner kopieren, lokal vermessen, ins Profil eintragen. */
  hinzu(kontoId: string, q: VorbildQuelle): Promise<Vorbild> {
    return this.nacheinander(() => this.hinzuJetzt(kontoId, q))
  }

  private async hinzuJetzt(kontoId: string, q: VorbildQuelle): Promise<Vorbild> {
    const unterordner = zielOrdner('vorbild', kontoId)
    let datei: string
    let extra: Partial<Vorbild> = {}
    if (q.art === 'datei' || q.art === 'ablegen') {
      dekodiere(await readFile(q.pfad)) // nur Bilder, die sich lesen lassen
      datei = await this.profil.dateiAblegen(q.pfad, unterordner)
    } else if (q.art === 'zwischenablage') {
      dekodiere(q.png)
      datei = await this.profil.bytesAblegen(q.png, unterordner, `zwischenablage-${Date.now().toString(36)}.png`)
    } else {
      const v = await ladeLinkVorschau((q as { url: string }).url, this.holen)
      datei = await this.profil.bytesAblegen(v.bild, unterordner, `video-${youtubeId(v.link)}.jpg`)
      extra = { link: v.link, titel: v.titel, kanal: v.kanal }
    }
    const eintrag = await this.eintrag(datei, q.art, extra)
    const vorbilder = [...(await this.liste(kontoId)).filter((v) => v.datei !== datei), eintrag]
    await this.schreibe(kontoId, vorbilder)
    await this.profil.aendern((p) => mitKonto(p, kontoId, (k) => ({ ...k, vorbildBilder: [...new Set([...k.vorbildBilder, datei])] })))
    return eintrag
  }

  /** Aktiv schalten oder Gewicht ändern */
  aendere(kontoId: string, id: string, patch: { aktiv?: boolean; gewicht?: number }): Promise<Vorbild[]> {
    return this.nacheinander(async () => {
    const vorbilder = (await this.liste(kontoId)).map((v) =>
      v.id === id ? { ...v, ...(patch.aktiv !== undefined ? { aktiv: patch.aktiv } : {}), ...(patch.gewicht !== undefined ? { gewicht: Math.max(1, Math.min(5, Math.round(patch.gewicht))) } : {}) } : v
    )
    await this.schreibe(kontoId, vorbilder)
    return vorbilder
    })
  }

  /** Vorbild samt Bild löschen */
  loesche(kontoId: string, id: string): Promise<Vorbild[]> {
    return this.nacheinander(async () => {
    const alle = await this.liste(kontoId)
    const weg = alle.find((v) => v.id === id)
    const vorbilder = alle.filter((v) => v.id !== id)
    await this.schreibe(kontoId, vorbilder)
    if (weg?.datei) {
      await rm(await this.profil.absolut(weg.datei), { force: true })
      await this.profil.aendern((p) => mitKonto(p, kontoId, (k) => ({ ...k, vorbildBilder: k.vorbildBilder.filter((d) => d !== weg.datei) })))
    }
    return vorbilder
    })
  }

  /** Bild-KI beschreibt alle Vorbilder, die noch keine Beschreibung haben (nur mit Bild-KI). */
  async kiAnalyse(kontoId: string, ki: KiSchicht, ctx?: JobContext<unknown>, fortschritt?: (i: number, n: number) => void): Promise<Vorbild[]> {
    let vorbilder = await this.liste(kontoId)
    const offen = vorbilder.filter((v) => v.datei && !v.ki)
    for (const [i, v] of offen.entries()) {
      fortschritt?.(i, offen.length)
      const erg = await ki.frage(
        { name: 'vorbild-analyse', system: ANALYSE_SYSTEM, prompt: analysePrompt(v), bilder: [await this.profil.absolut(v.datei!)], schema: KiAnalyseSchema, brauchtBilder: true, stufe: 'stark', maxAusgabe: 1500 },
        ctx
      )
      vorbilder = vorbilder.map((x) => (x.id === v.id ? { ...x, ki: erg.daten } : x))
      await this.schreibe(kontoId, vorbilder)
    }
    return vorbilder
  }

  async stilbuch(kontoId: string): Promise<Stilbuch | null> {
    try {
      return StilbuchSchema.parse(JSON.parse(await liesMitKonfliktkopien(join(await this.ordner(kontoId), STILBUCH))))
    } catch {
      return null
    }
  }

  /** Stilbuch neu erstellen: Messwerte immer, Regeln aus KI-Beschreibungen, falls eine KI verfügbar ist. */
  async erstelleStilbuch(kontoId: string, o: { ki: KiSchicht | null; beispiel: BeispielStilbuch | null; ctx?: JobContext<unknown> }): Promise<Stilbuch> {
    const vorbilder = await this.liste(kontoId)
    const buch = await stilbuchAus(vorbilder, o)
    await writeJsonAtomic(join(await this.ordner(kontoId), STILBUCH), buch)
    return buch
  }
}

function mitKonto(p: Profil, id: string, fn: (k: Konto) => Konto): Profil {
  return { ...p, konten: p.konten.map((k) => (k.id === id ? fn(k) : k)) }
}

const ANALYSE_SYSTEM =
  'You analyse video thumbnails for a creator who wants to learn the style. Describe composition, people, camera, colours, light, text and objects precisely and briefly. Never transcribe logos; text only as count and style. Answer in the language of the prompt.'

function analysePrompt(v: Vorbild): string {
  return `Analysiere dieses Vorbild-Thumbnail${v.titel ? ` („${v.titel}“${v.kanal ? ` von ${v.kanal}` : ''})` : ''}. Beschreibe Bildtyp, Aufbau, Figur (Anzahl, Lage, Kopfhöhe als Anteil der Bildhöhe, Pose, Blick, Ausdruck), Kamera, Farben, Licht, Text (nur ob, wie viele Wörter, Stil, Lage), wichtige Objekte mit Größe, Stimmung und ein kurzes Rezept, wie man den Stil auf ein anderes Thema überträgt.`
}

// --- Stilbuch ------------------------------------------------------------------------------------------------

/** Aktive Vorbilder, wichtigste zuerst (Gewicht, dann mit KI-Beschreibung, dann neueste) */
export function waehleVorbilder(vorbilder: Vorbild[], n = 8): Vorbild[] {
  return vorbilder
    .filter((v) => v.aktiv)
    .sort((a, b) => b.gewicht - a.gewicht || Number(!!b.ki) - Number(!!a.ki) || b.hinzugefuegt.localeCompare(a.hinzugefuegt))
    .slice(0, n)
}

const KiRegeln = z.object({
  regeln: z
    .array(z.object({ kategorie: z.enum(REGEL_KATEGORIEN), text: z.string().min(3), belege: z.array(z.string()) }))
    .min(3)
    .max(16)
})

export async function stilbuchAus(vorbilder: Vorbild[], o: { ki: KiSchicht | null; beispiel: BeispielStilbuch | null; ctx?: JobContext<unknown> }): Promise<Stilbuch> {
  const aktiv = vorbilder.filter((v) => v.aktiv)
  const gewicht = new Map(aktiv.map((v) => [v.id, v.gewicht]))
  const staerke = (belege: string[]): number => belege.reduce((s, id) => s + (gewicht.get(id) ?? 0), 0)
  const regeln: Regel[] = messRegeln(aktiv)
  let quelle: Stilbuch['quelle'] = aktiv.length ? 'lokal' : 'beispiel'

  const mitKi = aktiv.filter((v) => v.ki)
  if (o.ki && mitKi.length >= 2) {
    const erg = await o.ki.frage(
      {
        name: 'stilbuch',
        system: 'You condense thumbnail analyses into a short, concrete style guide. Every rule cites the ids of the thumbnails that show it. Higher weight = more important to the creator. Answer in German.',
        prompt: `Hier sind Analysen der Vorbild-Thumbnails eines Kanals mit ihrem Gewicht (1–5). Fasse sie zu 6–12 klaren Regeln zusammen (Aufbau, Figur, Kamera, Farbe, Licht, Text, Objekte). Jede Regel ist konkret und messbar, wo möglich (Anteile, Winkel, Anzahl Wörter), und nennt in „belege“ die IDs der Vorbilder, die sie zeigen. Regeln, die nur ein schwach gewichtetes Vorbild zeigt, lässt du weg.\n\n${JSON.stringify(
          mitKi.map((v) => ({ id: v.id, gewicht: v.gewicht, ...v.ki }))
        )}`,
        schema: KiRegeln,
        stufe: 'stark',
        maxAusgabe: 3000
      },
      o.ctx
    )
    const ids = new Set(mitKi.map((v) => v.id))
    for (const r of erg.daten.regeln) {
      const belege = r.belege.filter((id) => ids.has(id))
      if (belege.length) regeln.push({ kategorie: r.kategorie, text: r.text, belege, staerke: staerke(belege) })
    }
    quelle = 'ki'
  }
  // Wenige eigene Vorbilder: das passende Beispiel-Stilbuch füllt auf (eigene Regeln gehen vor)
  if (o.beispiel && aktiv.length < 3) for (const r of o.beispiel.regeln) regeln.push({ kategorie: r.kategorie, text: r.text, belege: [], staerke: 0.5 })

  regeln.sort((a, b) => b.staerke - a.staerke)
  return {
    version: 1,
    erstellt: new Date().toISOString(),
    quelle,
    beispiel: o.beispiel?.id ?? null,
    regeln,
    werte: mittelwerte(aktiv),
    aus: aktiv.map((v) => v.id)
  }
}

function mittelwerte(aktiv: Vorbild[]): Stilbuch['werte'] {
  const mit = aktiv.filter((v) => v.lokal)
  if (!mit.length) return null
  const g = mit.reduce((s, v) => s + v.gewicht, 0)
  const m = (f: (v: Vorbild) => number): number => Math.round((mit.reduce((s, v) => s + f(v) * v.gewicht, 0) / g) * 1000) / 1000
  // Ähnliche Farben verschiedener Vorbilder zählen zusammen (sonst gewinnt eine einzelne, zufällig gleiche Farbe)
  const farben: { rgb: [number, number, number]; farbe: string; w: number }[] = []
  for (const v of mit)
    for (const f of v.lokal!.farben) {
      const rgb = ausHex(f.farbe)
      const nah = farben.find((x) => Math.abs(x.rgb[0] - rgb[0]) + Math.abs(x.rgb[1] - rgb[1]) + Math.abs(x.rgb[2] - rgb[2]) < 60)
      if (nah) nah.w += f.anteil * v.gewicht
      else farben.push({ rgb, farbe: f.farbe, w: f.anteil * v.gewicht })
    }
  return {
    helligkeit: m((v) => v.lokal!.helligkeit),
    kontrast: m((v) => v.lokal!.kontrast),
    saettigung: m((v) => v.lokal!.saettigung),
    farben: farben
      .sort((a, b) => b.w - a.w)
      .slice(0, 5)
      .map((f) => f.farbe)
  }
}

/** Regeln aus den Messwerten (gehen ohne KI): nur Aussagen, die mindestens die Hälfte des Gewichts trägt */
function messRegeln(aktiv: Vorbild[]): Regel[] {
  const mit = aktiv.filter((v) => v.lokal)
  const gesamt = mit.reduce((s, v) => s + v.gewicht, 0)
  if (!gesamt) return []
  const regeln: Regel[] = []
  const pruefe = (kategorie: Regel['kategorie'], text: string, test: (v: Vorbild) => boolean): void => {
    const belege = mit.filter(test)
    const s = belege.reduce((x, v) => x + v.gewicht, 0)
    if (s / gesamt >= 0.5) regeln.push({ kategorie, text, belege: belege.map((v) => v.id), staerke: s })
  }
  pruefe('farbe', 'Kräftige, satte Farben', (v) => v.lokal!.saettigung >= 0.45)
  pruefe('farbe', 'Gedeckte, ruhige Farben', (v) => v.lokal!.saettigung < 0.22)
  pruefe('licht', 'Helle Bilder', (v) => v.lokal!.helligkeit >= 0.55)
  pruefe('licht', 'Dunkle, dramatische Bilder', (v) => v.lokal!.helligkeit < 0.33)
  pruefe('licht', 'Starker Kontrast', (v) => v.lokal!.kontrast >= 0.55)
  pruefe('aufbau', 'Ruhige Flächen, wenig Details im Hintergrund', (v) => v.lokal!.detail < 0.18)
  pruefe('aufbau', 'Viele Details, volles Bild', (v) => v.lokal!.detail >= 0.35)
  pruefe('aufbau', 'Blickfang in der linken Bildhälfte', (v) => v.lokal!.schwerpunkt[0] < 0.45)
  pruefe('aufbau', 'Blickfang in der rechten Bildhälfte', (v) => v.lokal!.schwerpunkt[0] > 0.55)
  pruefe('aufbau', 'Blickfang in der Bildmitte', (v) => Math.abs(v.lokal!.schwerpunkt[0] - 0.5) <= 0.05)
  return regeln
}

/** Mitgelieferte Beispiel-Stilbücher (resources/stilbuecher/*.json) */
export async function ladeBeispiele(ordner: string, namen = ['minecraft']): Promise<BeispielStilbuch[]> {
  const out: BeispielStilbuch[] = []
  for (const n of namen) {
    try {
      out.push(JSON.parse(await readFile(join(ordner, `${n}.json`), 'utf8')) as BeispielStilbuch)
    } catch {
      // fehlt im Paket: dann ohne Beispiel
    }
  }
  return out
}

/** Passendes Beispiel-Stilbuch für ein Konto (Minecraft-Skin, Spiel oder Richtung) */
export function beispielFuer(konto: Konto, beispiele: BeispielStilbuch[]): BeispielStilbuch | null {
  const merkmale = [
    ...konto.richtungen,
    ...konto.spiele,
    ...konto.darstellung.flatMap((d) => (d.art === 'spielavatar' ? [d.spiel] : []))
  ].map((x) => x.toLowerCase())
  // Genaues Spiel zuerst (Minecraft), die allgemeine Richtung „gaming“ allein reicht nicht
  return beispiele.find((b) => b.passtZu.slice(0, 1).some((p) => merkmale.includes(p))) ?? null
}
