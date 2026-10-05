// Herkunft: MoinStudio tests/unit/kalender-sync.test.ts (MIT, v0.53.0), Konten statt fester Kanäle, Test-Tresor,
// zusätzlich: Passwort nur verschlüsselt, nie an die Oberfläche.
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Tresor } from '../../src/main/ki/schluessel'
import { applePasswort, KalenderSync } from '../../src/main/kalender/sync'
import { aendereKarte, ladeKarten, neueKarte } from '../../src/main/planung/karten'

const BENUTZER = 'creator@example.com'
const PASSWORT = 'abcd-efgh-ijkl-mnop'

/** Kleiner Nachbau von iCloud-CalDAV: Umleitung auf einen Partition-Server, Kalender, Termine – kein echtes Netz */
function icloud(passwort = PASSWORT): { abruf: typeof fetch; kalender: Map<string, { name: string; termine: Map<string, string> }>; anfragen: string[] } {
  const kalender = new Map<string, { name: string; termine: Map<string, string> }>()
  kalender.set('/123/calendars/home/', {
    name: 'Privat',
    termine: new Map([['/123/calendars/home/x.ics', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:Geburtstag\r\nDTSTART:20261010T120000Z\r\nDTEND:20261010T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR']])
  })
  const anfragen: string[] = []
  const ms = (href: string, prop: string): string => `<response><href>${href}</href><propstat><prop>${prop}</prop><status>HTTP/1.1 200 OK</status></propstat></response>`
  const multi = (inhalt: string): Response => new Response(`<?xml version="1.0"?><multistatus xmlns="DAV:">${inhalt}</multistatus>`, { status: 207 })
  const abruf = (async (eingabe: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(eingabe))
    const methode = init?.method ?? 'GET'
    const h = (init?.headers ?? {}) as Record<string, string>
    anfragen.push(`${methode} ${url.host}${url.pathname}`)
    if (url.host === 'kalender.example.com') return new Response('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:g\r\nSUMMARY:Teammeeting\r\nDTSTART:20261013T080000Z\r\nDTEND:20261013T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR', { status: 200 })
    if (h['Authorization'] !== `Basic ${Buffer.from(`${BENUTZER}:${passwort}`).toString('base64')}`) return new Response('', { status: 401 })
    if (url.host === 'caldav.icloud.com') {
      if (url.pathname === '/' && methode === 'PROPFIND') return multi(ms('/', '<current-user-principal><href>/123/principal/</href></current-user-principal>'))
      return new Response('', { status: 301, headers: { location: `https://p01-caldav.icloud.com${url.pathname}` } })
    }
    if (url.pathname === '/123/principal/') return multi(ms('/123/principal/', '<C:calendar-home-set xmlns:C="urn:ietf:params:xml:ns:caldav"><href>https://p01-caldav.icloud.com:443/123/calendars/</href></C:calendar-home-set>'))
    if (url.pathname === '/123/calendars/' && methode === 'PROPFIND')
      return multi(
        ms('/123/calendars/', '<resourcetype><collection/></resourcetype>') +
          [...kalender].map(([href, k]) => ms(href, `<displayname>${k.name}</displayname><resourcetype><collection/><C:calendar xmlns:C="urn:ietf:params:xml:ns:caldav"/></resourcetype><A:calendar-color xmlns:A="http://apple.com/ns/ical/">#FF2968FF</A:calendar-color>`)).join('')
      )
    if (methode === 'MKCALENDAR') {
      kalender.set(url.pathname, { name: /<d:displayname>([^<]*)/.exec(String(init?.body))![1]!, termine: new Map() })
      return new Response('', { status: 201 })
    }
    const kal = [...kalender].find(([href]) => url.pathname.startsWith(href))
    if (methode === 'REPORT' && kal) return multi([...kal[1].termine].map(([href, ics]) => ms(href, `<getetag>"1"</getetag><C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav">${ics.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</C:calendar-data>`)).join(''))
    if (methode === 'PUT' && kal) {
      kal[1].termine.set(url.pathname, String(init?.body))
      return new Response('', { status: 201, headers: { etag: '"2"' } })
    }
    if (methode === 'DELETE' && kal) {
      kal[1].termine.delete(url.pathname)
      return new Response('', { status: 204 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  return { abruf, kalender, anfragen }
}

/** Test-Tresor: „verschlüsselt“ umkehrbar, aber ohne Klartext in der Datei */
const testTresor = (verfuegbar = true): Tresor => ({
  verfuegbar: () => verfuegbar,
  verschluesseln: (s) => Buffer.from(`enc:${[...s].reverse().join('')}`),
  entschluesseln: (b) => [...b.toString().replace(/^enc:/, '')].reverse().join('')
})

async function aufbau(server = icloud(), tresor = testTresor()): Promise<{ sync: KalenderSync; daten: string; geraet: string; server: ReturnType<typeof icloud> }> {
  const daten = await mkdtemp(join(tmpdir(), 'kal-'))
  const geraet = await mkdtemp(join(tmpdir(), 'kalg-'))
  const sync = new KalenderSync({ daten: async () => daten, geraet, tresor, kontoNamen: async () => ({ kochen: 'Kochkanal' }), melde: () => undefined, abruf: server.abruf, jetzt: () => new Date('2026-10-05T10:00:00Z').getTime() })
  return { sync, daten, geraet, server }
}

describe('Kalender-Abgleich mit iCloud', () => {
  it('bringt app-spezifische Passwörter in die Apple-Form', () => {
    expect(applePasswort(' abcd efgh ijkl mnop ')).toBe(PASSWORT)
    expect(applePasswort('abcdefghijklmnop')).toBe(PASSWORT)
    expect(applePasswort('anderes-passwort')).toBe('anderes-passwort')
  })

  it('lehnt ein falsches Passwort verständlich ab und speichert nichts', async () => {
    const { sync } = await aufbau()
    await expect(sync.verbindeApple(BENUTZER, 'falsch')).rejects.toThrow(/(app-spezifisches Passwort|app-specific password)/)
    expect((await sync.stand()).apple).toBeNull()
  })

  it('ohne Verschlüsselung wird kein Passwort gespeichert (kein Rückfall)', async () => {
    const { sync, geraet, server } = await aufbau(icloud(), testTresor(false))
    await expect(sync.verbindeApple(BENUTZER, PASSWORT)).rejects.toThrow()
    await expect(readFile(join(geraet, 'kalender-geheim.json'), 'utf8')).rejects.toThrow()
    expect(server.anfragen).toEqual([]) // nicht einmal angemeldet
  })

  it('Passwort liegt nur verschlüsselt im Geräte-Ordner und nie im Stand für die Oberfläche', async () => {
    const { sync, daten, geraet } = await aufbau()
    await sync.verbindeApple(BENUTZER, PASSWORT)
    sync.stopp()
    const geheim = await readFile(join(geraet, 'kalender-geheim.json'), 'utf8')
    expect(geheim).not.toContain(PASSWORT)
    expect(geheim).not.toContain('abcdefghijklmnop')
    const gemeinsam = await readFile(join(daten, 'planning', 'kalender.json'), 'utf8')
    expect(gemeinsam).toContain(BENUTZER)
    expect(gemeinsam).not.toContain(PASSWORT)
    expect(JSON.stringify(await sync.stand())).not.toContain(PASSWORT)
    expect((await sync.stand()).apple?.verbunden).toBe(true)
  })

  it('trägt Upload-Termine in „ContentStudio“ ein, zeigt andere Termine, übernimmt Verschiebungen und räumt auf', async () => {
    const { sync, daten, server } = await aufbau()
    const k = await neueKarte(daten, { kontoId: 'kochen', titel: 'Suppe in 10 Minuten', termin: '2026-10-12T17:00' })
    await neueKarte(daten, { kontoId: 'kochen', titel: 'Ohne Termin' })
    await sync.verbindeApple(BENUTZER, 'abcd efgh ijkl mnop')
    sync.stopp()
    await sync.synchronisiere()

    // Kalender angelegt, ein Termin (nur die Karte mit Termin), Anmeldung über die Umleitung behalten
    const eigen = server.kalender.get('/123/calendars/contentstudio/')!
    expect(eigen.name).toBe('ContentStudio')
    expect([...eigen.termine.keys()]).toEqual([`/123/calendars/contentstudio/contentstudio-${k.id}.ics`])
    expect([...eigen.termine.values()][0]).toContain('SUMMARY:▶ Kochkanal: Suppe in 10 Minuten')
    // anderer Termin sichtbar, eigener Kalender nicht doppelt
    const stand = await sync.stand()
    expect(stand.termine.map((x) => x.titel)).toEqual(['Geburtstag'])
    expect(stand.apple?.kalender.map((x) => [x.name, x.eigen])).toEqual([
      ['Privat', false],
      ['ContentStudio', true]
    ])

    // zweiter Abgleich ohne Änderung schreibt nichts
    const vorher = server.anfragen.filter((a) => a.startsWith('PUT')).length
    await sync.synchronisiere()
    expect(server.anfragen.filter((a) => a.startsWith('PUT')).length).toBe(vorher)

    // Termin am Telefon verschoben (neuere Änderung) → Karte bekommt die neue Zeit
    const href = `/123/calendars/contentstudio/contentstudio-${k.id}.ics`
    eigen.termine.set(href, eigen.termine.get(href)!.replace(/DTSTART:\d+T\d+Z/, `DTSTART:${utc('2026-10-14T18:30')}`).replace(/LAST-MODIFIED:\d+T\d+Z/, 'LAST-MODIFIED:20991231T000000Z'))
    await sync.synchronisiere()
    expect((await ladeKarten(daten)).find((x) => x.id === k.id)!.termin).toBe('2026-10-14T18:30')

    // Karte ohne Termin → Termin verschwindet aus dem Kalender
    await aendereKarte(daten, k.id, { termin: null })
    await sync.synchronisiere()
    expect(eigen.termine.size).toBe(0)
  })

  it('ausgeblendete iCloud-Kalender, „eintragen“ aus und Links', async () => {
    const { sync, server } = await aufbau()
    await sync.verbindeApple(BENUTZER, PASSWORT)
    sync.stopp()
    await sync.einstellen({ ausgeblendet: ['https://p01-caldav.icloud.com/123/calendars/home/'], eintragen: false, links: [{ id: '', name: 'Arbeit', url: 'webcal://kalender.example.com/geheim.ics', an: true }] })
    sync.stopp()
    await sync.synchronisiere()
    const stand = await sync.stand()
    expect(stand.termine.map((x) => [x.titel, x.quelleName])).toEqual([['Teammeeting', 'Arbeit']])
    expect(stand.links[0]?.url).toBe('https://kalender.example.com/geheim.ics')
    expect(server.kalender.has('/123/calendars/contentstudio/')).toBe(false) // „eintragen“ aus → kein eigener Kalender
  })
})

function utc(lokal: string): string {
  return new Date(lokal).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}
