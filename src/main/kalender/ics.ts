// Herkunft: MoinStudio src/main/kalender/ics.ts (MIT, v0.53.0), Texte übersetzbar, Kalender „ContentStudio“.
import { t as tr } from '../i18n'

/**
 * iCalendar (RFC 5545) lesen und schreiben – genug für Apple-, Google- und Outlook-Kalender: Termine mit Zeitzone oder
 * ganztägig, Wiederholungen (RRULE mit INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY), Ausnahmen (EXDATE) und einzeln
 * geänderte Wiederholungen (RECURRENCE-ID). Ergebnis sind lokale Zeiten wie in der Planung („2026-10-03T17:00“).
 */

export interface IcsTermin {
  uid: string
  titel: string
  /** lokale Zeit „YYYY-MM-DDTHH:MM“ bzw. bei ganztägigen Terminen „YYYY-MM-DD“ */
  start: string
  ende: string
  ganztag: boolean
  ort?: string
  /** LAST-MODIFIED/DTSTAMP als ISO (für den Abgleich in beide Richtungen) */
  geaendert?: string
}

interface Zeit {
  /** Wanduhrzeit in der Zone des Termins */
  j: number
  m: number
  t: number
  h: number
  min: number
  s: number
  /** IANA-Zone, 'UTC' oder null (lokal/„floating“) */
  zone: string | null
  ganztag: boolean
}

interface RohEreignis {
  uid: string
  titel: string
  ort?: string
  start: Zeit
  ende: Zeit | null
  dauerSek: number | null
  rrule: string | null
  exdates: Zeit[]
  recurrenceId: Zeit | null
  status?: string
  geaendert?: string
}

/** Windows-Zonennamen (Outlook) → IANA */
const WINDOWS_ZONEN: Record<string, string> = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'UTC': 'UTC',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Tokyo Standard Time': 'Asia/Tokyo'
}

function zoneAus(tzid: string | undefined): string | null {
  if (!tzid) return null
  const z = tzid.replace(/^"|"$/g, '').replace(/^\/[^/]+\/[^/]+\//, '')
  if (WINDOWS_ZONEN[z]) return WINDOWS_ZONEN[z]!
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return z
  } catch {
    return null
  }
}

/** Zeilen entfalten (RFC 5545: Fortsetzungszeilen beginnen mit Leerzeichen/Tab) */
function zeilen(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function text(wert: string): string {
  return wert.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
}

/** „DTSTART;TZID=Europe/Berlin:20261003T170000“ → Name, Parameter, Wert */
function zerlege(zeile: string): { name: string; params: Record<string, string>; wert: string } | null {
  // Doppelpunkt außerhalb von Anführungszeichen trennt Wert
  let inQ = false
  let i = 0
  for (; i < zeile.length; i++) {
    const c = zeile[i]
    if (c === '"') inQ = !inQ
    else if (c === ':' && !inQ) break
  }
  if (i >= zeile.length) return null
  const kopf = zeile.slice(0, i).split(';')
  const params: Record<string, string> = {}
  for (const p of kopf.slice(1)) {
    const g = p.indexOf('=')
    if (g > 0) params[p.slice(0, g).toUpperCase()] = p.slice(g + 1).replace(/^"|"$/g, '')
  }
  return { name: kopf[0]!.toUpperCase(), params, wert: zeile.slice(i + 1) }
}

function zeitAus(wert: string, params: Record<string, string>): Zeit | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(wert.trim())
  if (!m) return null
  const ganztag = params['VALUE'] === 'DATE' || !m[4]
  return {
    j: Number(m[1]),
    m: Number(m[2]),
    t: Number(m[3]),
    h: Number(m[4] ?? 0),
    min: Number(m[5] ?? 0),
    s: Number(m[6] ?? 0),
    zone: ganztag ? null : m[7] ? 'UTC' : zoneAus(params['TZID']),
    ganztag
  }
}

/** ISO-8601-Dauer „PT1H30M“, „P1D“, „-PT15M“ in Sekunden */
export function dauerSekunden(d: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d.trim())
  if (!m) return null
  const s = Number(m[2] ?? 0) * 604800 + Number(m[3] ?? 0) * 86400 + Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)
  return m[1] === '-' ? -s : s
}

/** Versatz einer Zone zu UTC (Minuten) zu einem Zeitpunkt */
function versatz(zone: string, ms: number): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  const teile = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
  const alsUtc = Date.UTC(Number(teile['year']), Number(teile['month']) - 1, Number(teile['day']), Number(teile['hour']), Number(teile['minute']), Number(teile['second']))
  return Math.round((alsUtc - ms) / 60000)
}

/** Wanduhrzeit in einer Zone → Zeitpunkt (ms) */
export function zuMs(z: Zeit): number {
  const wand = Date.UTC(z.j, z.m - 1, z.t, z.h, z.min, z.s)
  if (z.zone === 'UTC') return wand
  if (!z.zone) return new Date(z.j, z.m - 1, z.t, z.h, z.min, z.s).getTime()
  // zweimal korrigieren, damit auch Umstellungstage stimmen
  let ms = wand - versatz(z.zone, wand) * 60000
  ms = wand - versatz(z.zone, ms) * 60000
  return ms
}

const zwei = (n: number): string => String(n).padStart(2, '0')
/** Zeitpunkt → lokale Planungszeit „YYYY-MM-DDTHH:MM“ */
export function lokal(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}T${zwei(d.getHours())}:${zwei(d.getMinutes())}`
}
const tagText = (z: Zeit): string => `${z.j}-${zwei(z.m)}-${zwei(z.t)}`

/** Alle VEVENTs einer ICS-Datei (ohne abgesagte) */
function ereignisse(ics: string): RohEreignis[] {
  const aus: RohEreignis[] = []
  let e: Partial<RohEreignis> | null = null
  let tiefe = 0 // VALARM u. Ä. innerhalb des VEVENT überspringen
  for (const z of zeilen(ics)) {
    if (/^BEGIN:VEVENT$/i.test(z)) {
      e = { exdates: [], rrule: null, recurrenceId: null, ende: null, dauerSek: null, titel: '' }
      tiefe = 0
      continue
    }
    if (!e) continue
    if (/^BEGIN:/i.test(z)) {
      tiefe++
      continue
    }
    if (/^END:VEVENT$/i.test(z)) {
      if (e.uid && e.start && e.status !== 'CANCELLED') aus.push(e as RohEreignis)
      e = null
      continue
    }
    if (/^END:/i.test(z)) {
      tiefe = Math.max(0, tiefe - 1)
      continue
    }
    if (tiefe > 0) continue
    const p = zerlege(z)
    if (!p) continue
    switch (p.name) {
      case 'UID':
        e.uid = p.wert.trim()
        break
      case 'SUMMARY':
        e.titel = text(p.wert)
        break
      case 'LOCATION':
        if (p.wert.trim()) e.ort = text(p.wert)
        break
      case 'STATUS':
        e.status = p.wert.trim().toUpperCase()
        break
      case 'DTSTART':
        e.start = zeitAus(p.wert, p.params) ?? undefined
        break
      case 'DTEND':
        e.ende = zeitAus(p.wert, p.params)
        break
      case 'DURATION':
        e.dauerSek = dauerSekunden(p.wert)
        break
      case 'RRULE':
        e.rrule = p.wert.trim()
        break
      case 'EXDATE':
        for (const w of p.wert.split(',')) {
          const x = zeitAus(w, p.params)
          if (x) e.exdates!.push(x)
        }
        break
      case 'RECURRENCE-ID':
        e.recurrenceId = zeitAus(p.wert, p.params)
        break
      case 'LAST-MODIFIED':
        e.geaendert = isoAus(p.wert)
        break
      case 'DTSTAMP':
        e.geaendert ??= isoAus(p.wert)
        break
    }
  }
  return aus
}

function isoAus(w: string): string | undefined {
  const z = zeitAus(w, {})
  return z ? new Date(zuMs({ ...z, zone: 'UTC' })).toISOString() : undefined
}

const TAGE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Wiederholungs-Startzeiten (Wanduhr in der Zone des Termins) bis `bis` (ms), höchstens 1500 */
function wiederholungen(e: RohEreignis, bisMs: number): Zeit[] {
  const r = Object.fromEntries(e.rrule!.split(';').map((x) => x.split('=') as [string, string]))
  const freq = r['FREQ']
  const intervall = Math.max(1, Number(r['INTERVAL'] ?? 1))
  const anzahl = r['COUNT'] ? Number(r['COUNT']) : Infinity
  const until = r['UNTIL'] ? zeitAus(r['UNTIL'], {}) : null
  const untilMs = until ? zuMs(until.ganztag ? { ...until, h: 23, min: 59, s: 59, zone: e.start.zone, ganztag: false } : until) : Infinity
  const byday = (r['BYDAY'] ?? '').split(',').filter(Boolean).map((x) => {
    const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x)
    return m ? { n: m[1] ? Number(m[1]) : null, tag: TAGE.indexOf(m[2]!) } : null
  }).filter((x): x is { n: number | null; tag: number } => !!x)
  const bymonthday = (r['BYMONTHDAY'] ?? '').split(',').filter(Boolean).map(Number)
  const s = e.start
  const aus: Zeit[] = []
  const mit = (j: number, m: number, t: number): Zeit => ({ ...s, j, m, t })
  const grenze = Math.min(bisMs, untilMs)
  let gezaehlt = 0
  const nimm = (z: Zeit): boolean => {
    const ms = zuMs(z)
    if (ms < zuMs(s)) return true
    if (ms > grenze || gezaehlt >= anzahl) return false
    gezaehlt++
    aus.push(z)
    return aus.length < 1500
  }
  const tageImMonat = (j: number, m: number): number => new Date(Date.UTC(j, m, 0)).getUTCDate()
  const wt = (j: number, m: number, t: number): number => new Date(Date.UTC(j, m - 1, t)).getUTCDay()

  for (let schritt = 0; schritt < 5000; schritt++) {
    let kandidaten: Zeit[] = []
    // Beginn des Zeitraums (Tag/Woche/Monat/Jahr) – liegt er hinter der Grenze, ist Schluss
    let periode: Date
    if (freq === 'DAILY') {
      const d = new Date(Date.UTC(s.j, s.m - 1, s.t + schritt * intervall))
      periode = d
      kandidaten = [mit(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())]
      if (byday.length && !byday.some((b) => b.tag === d.getUTCDay())) kandidaten = []
    } else if (freq === 'WEEKLY') {
      // Woche ab Montag (WKST=MO) der Startwoche
      const start = new Date(Date.UTC(s.j, s.m - 1, s.t))
      const montag = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * 86400000 + schritt * intervall * 7 * 86400000)
      periode = montag
      const tage = byday.length ? byday.map((b) => b.tag) : [start.getUTCDay()]
      kandidaten = [...tage]
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((tag) => {
          const d = new Date(montag.getTime() + ((tag + 6) % 7) * 86400000)
          return mit(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
        })
    } else if (freq === 'MONTHLY') {
      const mm = s.m - 1 + schritt * intervall
      const j = s.j + Math.floor(mm / 12)
      const m = (mm % 12) + 1
      periode = new Date(Date.UTC(j, m - 1, 1))
      const n = tageImMonat(j, m)
      if (byday.length) {
        for (const b of byday) {
          const passende = Array.from({ length: n }, (_, i) => i + 1).filter((t) => wt(j, m, t) === b.tag)
          const t = b.n === null ? passende : [b.n > 0 ? passende[b.n - 1] : passende[passende.length + b.n]]
          for (const x of t) if (x) kandidaten.push(mit(j, m, x))
        }
        kandidaten.sort((a, b) => a.t - b.t)
      } else {
        const tage = bymonthday.length ? bymonthday : [s.t]
        for (const t of tage) {
          const x = t < 0 ? n + t + 1 : t
          if (x >= 1 && x <= n) kandidaten.push(mit(j, m, x))
        }
      }
    } else if (freq === 'YEARLY') {
      const j = s.j + schritt * intervall
      periode = new Date(Date.UTC(j, 0, 1))
      if (s.t <= tageImMonat(j, s.m)) kandidaten = [mit(j, s.m, s.t)]
    } else return [s]
    if (periode.getTime() - 86400000 > grenze) break
    for (const k of kandidaten) if (!nimm(k)) return aus
  }
  return aus
}

const gleich = (a: Zeit, b: Zeit): boolean => a.j === b.j && a.m === b.m && a.t === b.t && (a.ganztag || b.ganztag || (a.h === b.h && a.min === b.min))

/**
 * Termine einer ICS-Datei im Zeitraum [vonMs, bisMs] als lokale Planungszeiten. Wiederholungen werden aufgelöst,
 * einzeln geänderte Vorkommen ersetzen ihr Original.
 */
export function leseIcs(ics: string, vonMs: number, bisMs: number): IcsTermin[] {
  const alle = ereignisse(ics)
  const ausnahmen = alle.filter((e) => e.recurrenceId)
  const aus: IcsTermin[] = []
  const hinzu = (e: RohEreignis, start: Zeit, uidZusatz: string): void => {
    const startMs = zuMs(start)
    let endeMs: number
    if (e.dauerSek !== null) endeMs = startMs + e.dauerSek * 1000
    else if (e.ende) endeMs = startMs + (zuMs(e.ende) - zuMs(e.start))
    else endeMs = startMs + (start.ganztag ? 86400000 : 0)
    if (endeMs < vonMs || startMs > bisMs) return
    if (start.ganztag) {
      const tage = Math.max(1, Math.round((endeMs - startMs) / 86400000))
      const ende = new Date(Date.UTC(start.j, start.m - 1, start.t + tage - 1))
      aus.push({ uid: e.uid + uidZusatz, titel: e.titel || tr('kalender.ohneTitel'), start: tagText(start), ende: `${ende.getUTCFullYear()}-${zwei(ende.getUTCMonth() + 1)}-${zwei(ende.getUTCDate())}`, ganztag: true, ...(e.ort ? { ort: e.ort } : {}), ...(e.geaendert ? { geaendert: e.geaendert } : {}) })
    } else {
      aus.push({ uid: e.uid + uidZusatz, titel: e.titel || tr('kalender.ohneTitel'), start: lokal(startMs), ende: lokal(Math.max(endeMs, startMs)), ganztag: false, ...(e.ort ? { ort: e.ort } : {}), ...(e.geaendert ? { geaendert: e.geaendert } : {}) })
    }
  }
  for (const e of alle) {
    if (e.recurrenceId) continue
    if (!e.rrule) {
      hinzu(e, e.start, '')
      continue
    }
    for (const z of wiederholungen(e, bisMs)) {
      if (e.exdates.some((x) => gleich(x, z))) continue
      const ersatz = ausnahmen.find((a) => a.uid === e.uid && gleich(a.recurrenceId!, z))
      if (ersatz) continue // kommt unten als eigenes Ereignis
      hinzu(e, z, `#${tagText(z)}`)
    }
  }
  for (const a of ausnahmen) hinzu(a, a.start, `#${tagText(a.recurrenceId!)}`)
  return aus.sort((a, b) => a.start.localeCompare(b.start))
}

/** Text für ICS maskieren und auf 75 Zeichen falten */
function esc(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
}
function falte(zeile: string): string {
  const teile: string[] = []
  let rest = zeile
  while (rest.length > 74) {
    teile.push(rest.slice(0, 74))
    rest = rest.slice(74)
  }
  teile.push(rest)
  return teile.join('\r\n ')
}
const utc = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Ein Termin als ICS (für den Kalender „ContentStudio“). `start` ist lokale Planungszeit. */
export function schreibeIcs(e: { uid: string; titel: string; start: string; minuten: number; beschreibung?: string; geaendert: string; url?: string }): string {
  const [tag, zeit = '17:00'] = e.start.split('T')
  const [j, m, t] = tag!.split('-').map(Number)
  const [h, min] = zeit.split(':').map(Number)
  const startMs = new Date(j!, m! - 1, t!, h!, min!).getTime()
  const z = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ContentStudio//Planung//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(Date.now())}`,
    `LAST-MODIFIED:${utc(new Date(e.geaendert).getTime() || Date.now())}`,
    `DTSTART:${utc(startMs)}`,
    `DTEND:${utc(startMs + e.minuten * 60000)}`,
    `SUMMARY:${esc(e.titel)}`,
    ...(e.beschreibung ? [`DESCRIPTION:${esc(e.beschreibung)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ]
  return z.map(falte).join('\r\n') + '\r\n'
}
