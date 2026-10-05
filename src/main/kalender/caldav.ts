// Herkunft: MoinStudio src/main/kalender/caldav.ts (MIT, v0.53.0), Meldungen übersetzbar.
import { t as tr } from '../i18n'

/**
 * CalDAV-Zugang zu iCloud (Apple Kalender) – ohne Bibliothek, nur fetch. Anmeldung mit Apple-ID und einem
 * app-spezifischen Passwort (account.apple.com → Anmelden und Sicherheit). iCloud leitet auf einen Partition-Server
 * (pXX-caldav.icloud.com) um; fetch würde dabei die Anmeldung verwerfen, deshalb folgen wir Umleitungen selbst.
 */

export const ICLOUD = 'https://caldav.icloud.com/'

export interface Zugang {
  benutzer: string
  passwort: string
  /** Startadresse (Standard iCloud) */
  basis?: string
}

export interface DavKalender {
  href: string
  name: string
  farbe?: string
  ctag?: string
}

export class DavFehler extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

type Abruf = typeof fetch

/** XML-Entitäten im Text auflösen */
export function entXml(t: string): string {
  return t
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** Inhalt des ersten Elements `name` (beliebiges Namensraum-Präfix) */
export function element(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>)`, 'i').exec(xml)
  return m ? (m[1] ?? '') : null
}

/** Multistatus-Antwort in Einträge zerlegen: href und die Eigenschaften mit Status 200 */
export function antworten(xml: string): { href: string; prop: string }[] {
  const aus: { href: string; prop: string }[] = []
  const re = /<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const block = m[1]!
    const href = entXml((element(block, 'href') ?? '').trim())
    // nur Eigenschaften aus propstat mit 200 OK
    const props: string[] = []
    const ps = /<(?:[\w-]+:)?propstat\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?propstat>/gi
    for (let p = ps.exec(block); p; p = ps.exec(block)) if (/\s200\s/.test(element(p[1]!, 'status') ?? '')) props.push(element(p[1]!, 'prop') ?? '')
    aus.push({ href, prop: props.join('\n') })
  }
  return aus
}

export class CalDav {
  private readonly auth: string
  constructor(
    private readonly z: Zugang,
    private readonly abruf: Abruf = fetch
  ) {
    this.auth = `Basic ${Buffer.from(`${z.benutzer}:${z.passwort}`).toString('base64')}`
  }

  /** Anfrage mit Anmeldung; folgt Umleitungen innerhalb derselben Domain (iCloud-Partitionen) selbst */
  async anfrage(methode: string, url: string, o: { body?: string; tiefe?: '0' | '1'; typ?: string; ifMatch?: string } = {}): Promise<{ status: number; text: string; url: string; etag?: string }> {
    let ziel = url
    for (let i = 0; i < 5; i++) {
      const res = await this.abruf(ziel, {
        method: methode,
        redirect: 'manual',
        headers: {
          Authorization: this.auth,
          ...(o.body !== undefined ? { 'Content-Type': o.typ ?? 'application/xml; charset=utf-8' } : {}),
          ...(o.tiefe ? { Depth: o.tiefe } : {}),
          ...(o.ifMatch ? { 'If-Match': o.ifMatch } : {})
        },
        body: o.body,
        signal: AbortSignal.timeout(30_000)
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const neu = new URL(res.headers.get('location')!, ziel)
        const alt = new URL(ziel)
        // Anmeldung nur an dieselbe Hauptdomain weitergeben
        if (neu.hostname.split('.').slice(-2).join('.') !== alt.hostname.split('.').slice(-2).join('.')) throw new DavFehler(tr('kalender.fehler.umleitung', { host: neu.hostname }), res.status)
        ziel = neu.toString()
        continue
      }
      if (res.status === 401) throw new DavFehler(tr('kalender.fehler.anmeldung'), 401)
      return { status: res.status, text: await res.text(), url: ziel, etag: res.headers.get('etag') ?? undefined }
    }
    throw new DavFehler(tr('kalender.fehler.umleitungen'), 310)
  }

  private async propfind(url: string, props: string, tiefe: '0' | '1'): Promise<{ href: string; prop: string }[] & { basis: string }> {
    const r = await this.anfrage('PROPFIND', url, {
      tiefe,
      body: `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"><d:prop>${props}</d:prop></d:propfind>`
    })
    if (r.status !== 207) throw new DavFehler(tr('kalender.fehler.server', { status: r.status }), r.status)
    return Object.assign(antworten(r.text), { basis: r.url })
  }

  /** Adresse des Kalender-Ordners (calendar-home-set) */
  async heim(): Promise<string> {
    const basis = this.z.basis ?? ICLOUD
    const p = await this.propfind(basis, '<d:current-user-principal/>', '0')
    const principal = entXml((element(element(p[0]?.prop ?? '', 'current-user-principal') ?? '', 'href') ?? '').trim())
    if (!principal) throw new DavFehler(tr('kalender.fehler.konto'), 404)
    const h = await this.propfind(new URL(principal, p.basis).toString(), '<c:calendar-home-set/>', '0')
    const href = entXml((element(element(h[0]?.prop ?? '', 'calendar-home-set') ?? '', 'href') ?? '').trim())
    if (!href) throw new DavFehler(tr('kalender.fehler.ordner'), 404)
    return new URL(href, h.basis).toString()
  }

  /** Alle Kalender mit Terminen (keine Erinnerungs-Listen) */
  async kalender(heim: string): Promise<DavKalender[]> {
    const r = await this.propfind(heim, '<d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/><cs:getctag/>', '1')
    return r
      .filter((x) => /<(?:[\w-]+:)?calendar\b/i.test(element(x.prop, 'resourcetype') ?? ''))
      .filter((x) => {
        const comps = element(x.prop, 'supported-calendar-component-set')
        return comps === null || /VEVENT/i.test(comps)
      })
      .map((x) => {
        const farbe = (element(x.prop, 'calendar-color') ?? '').trim()
        return {
          href: new URL(x.href, r.basis).toString(),
          name: entXml((element(x.prop, 'displayname') ?? '').trim()) || tr('kalender.standardName'),
          ...(/^#[0-9a-f]{6}/i.test(farbe) ? { farbe: farbe.slice(0, 7) } : {}),
          ...(element(x.prop, 'getctag') ? { ctag: entXml(element(x.prop, 'getctag')!.trim()) } : {})
        }
      })
  }

  /** Termine eines Kalenders im Zeitraum als rohe ICS-Texte (Wiederholungen löst ics.ts auf) */
  async termine(kalender: string, vonMs: number, bisMs: number): Promise<{ href: string; etag?: string; ics: string }[]> {
    const utc = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const r = await this.anfrage('REPORT', kalender, {
      tiefe: '1',
      body: `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${utc(vonMs)}" end="${utc(bisMs)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
    })
    if (r.status !== 207) throw new DavFehler(tr('kalender.fehler.termineLesen', { status: r.status }), r.status)
    return antworten(r.text)
      .map((x) => ({ href: new URL(x.href, r.url).toString(), etag: entXml((element(x.prop, 'getetag') ?? '').trim()) || undefined, ics: entXml(element(x.prop, 'calendar-data') ?? '') }))
      .filter((x) => x.ics.includes('BEGIN:VCALENDAR'))
  }

  /** Neuen Kalender anlegen (z. B. „ContentStudio“) */
  async neuerKalender(heim: string, pfad: string, name: string, farbe: string): Promise<string> {
    const url = new URL(pfad.endsWith('/') ? pfad : `${pfad}/`, heim).toString()
    const r = await this.anfrage('MKCALENDAR', url, {
      body: `<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>${name.replace(/[<&]/g, '')}</d:displayname><a:calendar-color>${farbe}</a:calendar-color><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`
    })
    if (r.status !== 201 && r.status !== 405) throw new DavFehler(tr('kalender.fehler.anlegen', { name, status: r.status }), r.status)
    return url
  }

  async schreibe(url: string, ics: string): Promise<string | undefined> {
    const r = await this.anfrage('PUT', url, { body: ics, typ: 'text/calendar; charset=utf-8' })
    if (r.status !== 201 && r.status !== 204 && r.status !== 200) throw new DavFehler(tr('kalender.fehler.speichern', { status: r.status }), r.status)
    return r.etag
  }

  async loesche(url: string): Promise<void> {
    const r = await this.anfrage('DELETE', url)
    if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw new DavFehler(tr('kalender.fehler.loeschen', { status: r.status }), r.status)
  }
}
