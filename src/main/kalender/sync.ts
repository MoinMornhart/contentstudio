// Herkunft: MoinStudio src/main/kalender/sync.ts (MIT, v0.53.0), verallgemeinert: Konten aus dem Creator-Profil statt
// fester Kanäle, Passwort nur verschlüsselt über den Tresor (kein Rückfall), Kalender „ContentStudio“, Texte übersetzbar.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FremderTermin, KalenderLink, KalenderStand } from '@shared/planung'
import { writeJsonAtomic } from '../data/jsonfile'
import { t } from '../i18n'
import type { Tresor } from '../ki/schluessel'
import { aendereKarte, ladeKarten, type Karte } from '../planung/karten'
import { CalDav, type DavKalender } from './caldav'
import { leseIcs, schreibeIcs } from './ics'

/**
 * Kalender-Abgleich (aus MoinStudio v0.53.0): Planung ↔ Apple Kalender (iCloud, beide Richtungen) und andere Kalender
 * per iCal-Link (Google, Outlook, alles mit ICS) zum Anzeigen. Läuft alle 5 Minuten und kurz nach jeder Kartenänderung.
 *
 * - Upload-Termine landen im iCloud-Kalender „ContentStudio“ (Termin `contentstudio-<karte>.ics`). Verschiebt der
 *   Creator dort einen Termin (iPhone, Mac), übernimmt die Planung ihn; sonst gilt die Karte.
 * - Einstellungen (Apple-ID, Links) liegen im Datenordner und gelten für alle Geräte; das app-spezifische Passwort liegt
 *   nur verschlüsselt (Schlüsselspeicher des Betriebssystems) im Geräte-Ordner. Ohne Verschlüsselung wird es nicht
 *   gespeichert. Es wird nie protokolliert und nie an die Oberfläche zurückgegeben.
 */

export const TAKT_MS = 5 * 60_000
const EIGEN_PFAD = 'contentstudio'
const EIGEN_NAME = 'ContentStudio'
const EIGEN_FARBE = '#F5A623'
const PRAEFIX = 'contentstudio-'

interface Gemeinsam {
  apple: { benutzer: string; eintragen: boolean; ausgeblendet: string[] } | null
  links: KalenderLink[]
}

export interface SyncHilfe {
  daten: () => Promise<string>
  /** Geräte-Ordner (userData), nicht synchronisiert */
  geraet: string
  /** Verschlüsselung des Betriebssystems für das Passwort */
  tresor: Tresor
  /** Konto-ID → Name aus dem Creator-Profil (für die Termin-Titel) */
  kontoNamen: () => Promise<Record<string, string>>
  melde: () => void
  abruf?: typeof fetch
  jetzt?: () => number
}

const tag = 86_400_000
const hash = (x: string): string => createHash('sha1').update(x).digest('hex').slice(0, 12)
const meldung = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Termin einer Karte im Kalender: Titel mit Kontoname, Dauer 30 Minuten, Stand in der Beschreibung */
export function kartenTermin(k: Pick<Karte, 'id' | 'titel' | 'termin' | 'spalte' | 'notizen' | 'updatedAt'>, konto: string): { uid: string; titel: string; start: string; minuten: number; beschreibung: string; geaendert: string } {
  const notizen = k.notizen.trim()
  const kopf = t('kalender.termin.beschreibung', { konto, stand: t(`planung.spalte.${k.spalte}`) })
  return {
    uid: `${PRAEFIX}${k.id}@contentstudio`,
    titel: `${k.spalte === 'veroeffentlicht' ? '✓ ' : '▶ '}${konto}: ${k.titel}`,
    start: k.termin!,
    minuten: 30,
    beschreibung: [kopf, notizen, t('kalender.termin.herkunft')].filter(Boolean).join('\n\n'),
    geaendert: k.updatedAt
  }
}

/** Kartenzeit „YYYY-MM-DDTHH:MM“ (Termine ohne Uhrzeit bekommen 17:00 wie in der Planung) */
const kartenZeit = (x: string): string => (x.length >= 16 ? x.slice(0, 16) : `${x.slice(0, 10)}T17:00`)

/** Apple zeigt app-spezifische Passwörter als „abcd-efgh-ijkl-mnop“; mit Leerzeichen oder ohne Trenner eingetippt → Apple-Form */
export function applePasswort(roh: string): string {
  const p = roh.trim()
  const buchstaben = p.replace(/[\s-]+/g, '')
  return /^[a-z]{16}$/i.test(buchstaben) ? buchstaben.match(/.{4}/g)!.join('-') : p
}

export class KalenderSync {
  private laeuft: Promise<void> | null = null
  private nochmal = false
  private takt: NodeJS.Timeout | null = null
  private anstoss: NodeJS.Timeout | null = null
  private cache: KalenderStand = { apple: null, links: [], termine: [], stand: null, laeuft: false }

  constructor(private readonly h: SyncHilfe) {}

  private jetzt(): number {
    return this.h.jetzt?.() ?? Date.now()
  }
  private async gemeinsamDatei(): Promise<string> {
    return join(await this.h.daten(), 'planning', 'kalender.json')
  }
  private async gemeinsam(): Promise<Gemeinsam> {
    try {
      const g = JSON.parse(await readFile(await this.gemeinsamDatei(), 'utf8')) as Partial<Gemeinsam>
      return { apple: g.apple ?? null, links: Array.isArray(g.links) ? g.links : [] }
    } catch {
      return { apple: null, links: [] }
    }
  }
  private async speichereGemeinsam(g: Gemeinsam): Promise<void> {
    await writeJsonAtomic(await this.gemeinsamDatei(), g)
  }
  private geheimDatei = (): string => join(this.h.geraet, 'kalender-geheim.json')
  private zustandDatei = (): string => join(this.h.geraet, 'kalender-zustand.json')

  /** Passwort im Klartext nur für die Anfrage an iCloud; ohne Verschlüsselung oder bei Fehlern null */
  private async passwort(): Promise<string | null> {
    try {
      const g = JSON.parse(await readFile(this.geheimDatei(), 'utf8')) as { passwort?: string }
      if (!g.passwort || !this.h.tresor.verfuegbar()) return null
      return this.h.tresor.entschluesseln(Buffer.from(g.passwort, 'base64'))
    } catch {
      return null
    }
  }
  private async zustand(): Promise<{ gesendet: Record<string, string>; termine?: FremderTermin[]; stand?: string | null }> {
    try {
      return JSON.parse(await readFile(this.zustandDatei(), 'utf8')) as { gesendet: Record<string, string> }
    } catch {
      return { gesendet: {} }
    }
  }

  /** Stand für die Oberfläche (sofort, aus dem Zwischenspeicher) – ohne Passwort */
  async stand(): Promise<KalenderStand> {
    if (!this.cache.stand) {
      const z = await this.zustand()
      if (z.termine) this.cache = { ...this.cache, termine: z.termine, stand: z.stand ?? null }
    }
    const g = await this.gemeinsam()
    const pw = await this.passwort()
    return {
      ...this.cache,
      laeuft: !!this.laeuft,
      apple: g.apple ? { ...(this.cache.apple ?? { kalender: [] }), benutzer: g.apple.benutzer, eintragen: g.apple.eintragen, verbunden: !!pw, ausgeblendet: g.apple.ausgeblendet } : null,
      links: g.links.map((l) => ({ ...l, fehler: this.cache.links.find((x) => x.id === l.id)?.fehler }))
    }
  }

  /** Apple-ID prüfen und speichern (Passwort nur verschlüsselt auf diesem Gerät) */
  async verbindeApple(benutzer: string, passwort: string): Promise<void> {
    const b = benutzer.trim()
    const p = applePasswort(passwort)
    if (!b || !p) throw new Error(t('kalender.fehler.eingabe'))
    if (!this.h.tresor.verfuegbar()) throw new Error(t('kalender.fehler.keineVerschluesselung'))
    const dav = new CalDav({ benutzer: b, passwort: p }, this.h.abruf)
    await dav.heim() // wirft bei falschem Passwort
    await writeJsonAtomic(this.geheimDatei(), { passwort: this.h.tresor.verschluesseln(p).toString('base64') })
    const g = await this.gemeinsam()
    await this.speichereGemeinsam({ ...g, apple: { benutzer: b, eintragen: g.apple?.eintragen ?? true, ausgeblendet: g.apple?.ausgeblendet ?? [] } })
    this.anstossen(0)
  }

  async trenneApple(): Promise<void> {
    await writeJsonAtomic(this.geheimDatei(), {})
    const g = await this.gemeinsam()
    await this.speichereGemeinsam({ ...g, apple: null })
    this.cache = { ...this.cache, apple: null, termine: this.cache.termine.filter((x) => !x.quelle.startsWith('apple:')) }
    this.h.melde()
  }

  async einstellen(e: { eintragen?: boolean; ausgeblendet?: string[]; links?: KalenderLink[] }): Promise<void> {
    const g = await this.gemeinsam()
    if (g.apple && typeof e.eintragen === 'boolean') g.apple.eintragen = e.eintragen
    if (g.apple && Array.isArray(e.ausgeblendet)) g.apple.ausgeblendet = e.ausgeblendet.filter((x) => typeof x === 'string')
    if (Array.isArray(e.links)) {
      g.links = e.links
        .filter((l) => l && typeof l.url === 'string' && l.url.trim())
        .map((l) => ({
          id: String(l.id || hash(l.url + this.jetzt())),
          name: String(l.name || t('kalender.standardName')).slice(0, 40),
          url: l.url.trim().replace(/^webcal:\/\//i, 'https://'),
          farbe: /^#[0-9a-f]{6}$/i.test(l.farbe ?? '') ? l.farbe : '#7c8a99',
          an: l.an !== false
        }))
    }
    await this.speichereGemeinsam(g)
    this.anstossen(0)
  }

  /** Link vor dem Speichern prüfen: lädt und zählt die Termine */
  async pruefeLink(url: string): Promise<number> {
    const u = url.trim().replace(/^webcal:\/\//i, 'https://')
    if (!/^https?:\/\//i.test(u)) throw new Error(t('kalender.fehler.linkForm'))
    const text = await this.ladeLink(u)
    return leseIcs(text, this.jetzt() - 62 * tag, this.jetzt() + 365 * tag).length
  }

  private async ladeLink(url: string): Promise<string> {
    const res = await (this.h.abruf ?? fetch)(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'text/calendar, */*' } })
    if (!res.ok) throw new Error(t('kalender.fehler.linkStatus', { status: res.status }))
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error(t('kalender.fehler.keinIcs'))
    return text
  }

  /** Zeitplan: alle 5 Minuten; `anstossen` nach Kartenänderungen */
  start(): void {
    if (this.takt) return
    this.takt = setInterval(() => void this.synchronisiere(), TAKT_MS)
    this.anstossen(5_000)
  }
  stopp(): void {
    if (this.takt) clearInterval(this.takt)
    if (this.anstoss) clearTimeout(this.anstoss)
    this.takt = this.anstoss = null
  }
  anstossen(ms = 10_000): void {
    if (this.anstoss) clearTimeout(this.anstoss)
    this.anstoss = setTimeout(() => void this.synchronisiere(), ms)
  }

  /** Ein Abgleich; läuft schon einer, folgt direkt danach noch einer */
  async synchronisiere(): Promise<void> {
    if (this.laeuft) {
      this.nochmal = true
      return this.laeuft
    }
    this.laeuft = this.runde().finally(() => {
      this.laeuft = null
      if (this.nochmal) {
        this.nochmal = false
        void this.synchronisiere()
      }
    })
    this.h.melde()
    return this.laeuft
  }

  private async runde(): Promise<void> {
    const g = await this.gemeinsam()
    const von = this.jetzt() - 62 * tag
    const bis = this.jetzt() + 365 * tag
    const termine: FremderTermin[] = []
    const z = await this.zustand()
    let apple: KalenderStand['apple'] = null
    const linkStand: KalenderStand['links'] = []

    // 1. Apple Kalender (iCloud)
    const pw = g.apple ? await this.passwort() : null
    if (g.apple) {
      apple = { benutzer: g.apple.benutzer, eintragen: g.apple.eintragen, verbunden: !!pw, ausgeblendet: g.apple.ausgeblendet, kalender: [] }
      if (pw) {
        try {
          const dav = new CalDav({ benutzer: g.apple.benutzer, passwort: pw }, this.h.abruf)
          const heim = await dav.heim()
          const alle = await dav.kalender(heim)
          apple.kalender = alle.map((k) => ({ href: k.href, name: k.name, farbe: k.farbe ?? '#3b82f6', eigen: this.istEigen(k, heim) }))
          for (const k of alle) {
            if (this.istEigen(k, heim) || g.apple.ausgeblendet.includes(k.href)) continue
            for (const roh of await dav.termine(k.href, von, bis)) {
              for (const x of leseIcs(roh.ics, von, bis)) termine.push({ ...x, id: `apple:${k.href}#${x.uid}`, quelle: `apple:${k.href}`, quelleName: k.name, farbe: k.farbe ?? '#3b82f6' })
            }
          }
          if (g.apple.eintragen) {
            z.gesendet = await this.abgleichEigen(dav, heim, alle, z.gesendet)
            // gerade erst angelegt → gleich in der Liste zeigen
            if (!apple.kalender.some((k) => k.eigen)) apple.kalender.push({ href: new URL(`${EIGEN_PFAD}/`, heim).toString(), name: EIGEN_NAME, farbe: EIGEN_FARBE, eigen: true })
          }
        } catch (err) {
          apple.fehler = meldung(err)
        }
      }
    }

    // 2. Links (Google, Outlook, andere)
    for (const l of g.links) {
      if (!l.an) {
        linkStand.push(l)
        continue
      }
      try {
        const text = await this.ladeLink(l.url)
        for (const x of leseIcs(text, von, bis)) termine.push({ ...x, id: `link:${l.id}#${x.uid}`, quelle: `link:${l.id}`, quelleName: l.name, farbe: l.farbe ?? '#7c8a99' })
        linkStand.push(l)
      } catch (err) {
        linkStand.push({ ...l, fehler: meldung(err) })
      }
    }

    const stand = new Date(this.jetzt()).toISOString()
    // Termine einer Quelle mit Fehler aus dem letzten Stand behalten, statt sie verschwinden zu lassen
    const fehlerQuellen = new Set([...(apple?.fehler ? this.cache.termine.filter((x) => x.quelle.startsWith('apple:')).map((x) => x.quelle) : []), ...linkStand.filter((l) => l.fehler).map((l) => `link:${l.id}`)])
    const behalten = this.cache.termine.filter((x) => fehlerQuellen.has(x.quelle))
    this.cache = { apple, links: linkStand, termine: [...termine, ...behalten].sort((a, b) => a.start.localeCompare(b.start)), stand, laeuft: false }
    await writeJsonAtomic(this.zustandDatei(), { gesendet: z.gesendet, termine: this.cache.termine, stand })
    this.h.melde()
  }

  private istEigen(k: DavKalender, heim: string): boolean {
    return k.href.replace(/\/$/, '') === new URL(`${EIGEN_PFAD}/`, heim).toString().replace(/\/$/, '') || k.name === EIGEN_NAME
  }

  /**
   * Upload-Termine ↔ Kalender „ContentStudio“: fehlende/geänderte Karten schreiben, Termine ohne Karte (gelöscht oder
   * ohne Termin) entfernen. Wurde ein Termin im Kalender verschoben (später geändert als die Karte), bekommt die Karte
   * die neue Zeit.
   */
  private async abgleichEigen(dav: CalDav, heim: string, alle: DavKalender[], gesendet: Record<string, string>): Promise<Record<string, string>> {
    const daten = await this.h.daten()
    const vorhanden = alle.find((k) => this.istEigen(k, heim))
    const kal = vorhanden?.href ?? (await dav.neuerKalender(heim, EIGEN_PFAD, EIGEN_NAME, EIGEN_FARBE))
    const imKalender = new Map<string, { href: string; start: string; geaendert?: string }>()
    for (const roh of await dav.termine(kal, this.jetzt() - 400 * tag, this.jetzt() + 800 * tag)) {
      const x = leseIcs(roh.ics, this.jetzt() - 400 * tag, this.jetzt() + 800 * tag)[0]
      const id = x?.uid.match(/^contentstudio-([a-z0-9]+)@/)?.[1]
      if (x && id) imKalender.set(id, { href: roh.href, start: x.start, ...(x.geaendert ? { geaendert: x.geaendert } : {}) })
    }
    const karten = await ladeKarten(daten)
    const namen = await this.h.kontoNamen().catch((): Record<string, string> => ({}))
    const name = (id: string): string => namen[id]?.trim() || t('konten.unbenannt')
    const ohneZeit = (e: ReturnType<typeof kartenTermin>): string => hash(JSON.stringify(e).replace(/"geaendert":"[^"]*"/, ''))
    const neu: Record<string, string> = {}
    for (const k of karten) {
      if (!k.termin) continue
      const ist = imKalender.get(k.id)
      const soll = kartenZeit(k.termin)
      // im Kalender verschoben? → Karte übernimmt (nur wenn der Kalender-Termin jünger ist als die letzte Kartenänderung)
      if (ist && ist.start !== soll && ist.geaendert && new Date(ist.geaendert).getTime() > new Date(k.updatedAt).getTime() + 5_000) {
        const geaendert = await aendereKarte(daten, k.id, { termin: ist.start })
        neu[k.id] = ohneZeit(kartenTermin(geaendert, name(geaendert.kontoId)))
        continue
      }
      const ics = kartenTermin(k, name(k.kontoId))
      const h = ohneZeit(ics)
      if (ist && ist.start === soll && gesendet[k.id] === h) {
        neu[k.id] = h
        continue
      }
      await dav.schreibe(ist?.href ?? new URL(`${PRAEFIX}${k.id}.ics`, kal.endsWith('/') ? kal : `${kal}/`).toString(), schreibeIcs({ ...ics, start: soll }))
      neu[k.id] = h
    }
    // Termine ohne passende Karte (gelöscht, Termin entfernt) wieder raus – aber nie alles auf einmal, nur weil der
    // Datenordner gerade nicht lesbar war (Cloud-Dienst lädt noch)
    if (!karten.length) return { ...gesendet, ...neu }
    for (const [id, x] of imKalender) if (!karten.some((k) => k.id === id && k.termin)) await dav.loesche(x.href)
    return neu
  }
}
