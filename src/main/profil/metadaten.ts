import type { MetaVideo } from '@shared/profil'
import { t } from '../i18n'

/**
 * Öffentliche Metadaten eines YouTube-Kanals (ROADMAP 2.3), nur nach ausdrücklicher Zustimmung und nur auf Knopfdruck:
 *
 * 1. Mit eigenem Google-API-Schlüssel des Nutzers: offizielle YouTube Data API v3 (Titel, Thumbnails, Längen).
 * 2. Ohne Schlüssel: ein einzelner Abruf der Kanalseite (Kanal-ID) und des öffentlichen RSS-Feeds, wie ihn jeder
 *    Feed-Reader macht (Titel, Thumbnails, ohne Längen). Kein Crawling, keine Anmeldung, keine Wiederholung im Hintergrund.
 *
 * Andere Plattformen (Twitch, TikTok, Instagram …) geben ohne Anmeldung keine Daten frei; dort bleibt es beim Link.
 * Begründung und Quellen: docs/datenquellen.md
 */

const UA = 'ContentStudio (github.com/MoinMornhart/contentstudio)'
/** Ohne diesen Cookie leitet YouTube in der EU auf die Einwilligungsseite um (nur Anzeige-Einstellung, kein Tracking). */
const COOKIE = 'SOCS=CAI'

export type KanalVerweis = { art: 'id'; id: string } | { art: 'handle'; handle: string } | { art: 'user'; name: string }

/** Liest aus Link oder Eingabe, welcher Kanal gemeint ist. null = kein YouTube-Kanal erkennbar. */
export function kanalAusLink(eingabe: string): KanalVerweis | null {
  const s = eingabe.trim()
  const id = /(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/.exec(s)
  if (id) return { art: 'id', id: id[1]! }
  const handle = /(?:^|youtube\.com\/)@([\w.-]{3,30})(?:[/?#]|$)/i.exec(s)
  if (handle) return { art: 'handle', handle: handle[1]! }
  const user = /youtube\.com\/(?:user|c)\/([\w.-]+)/i.exec(s)
  if (user) return { art: 'user', name: user[1]! }
  return null
}

/** Findet die Kanal-ID im HTML der Kanalseite. */
export function kanalIdAusSeite(html: string): string | null {
  const muster = [/"externalId":"(UC[\w-]{22})"/, /<meta itemprop="identifier" content="(UC[\w-]{22})"/, /"channelId":"(UC[\w-]{22})"/, /\/channel\/(UC[\w-]{22})/]
  for (const m of muster) {
    const r = m.exec(html)
    if (r) return r[1]!
  }
  return null
}

const entity = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))

/** Liest die Videos aus dem RSS-Feed eines Kanals (höchstens 15, neueste zuerst). */
export function videosAusFeed(xml: string): MetaVideo[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const e = m[1]!
    const feld = (re: RegExp): string => entity(re.exec(e)?.[1] ?? '')
    const id = feld(/<yt:videoId>([^<]+)<\/yt:videoId>/)
    return {
      id,
      titel: feld(/<title>([^<]*)<\/title>/),
      thumbnail: feld(/<media:thumbnail url="([^"]+)"/) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      veroeffentlicht: feld(/<published>([^<]+)<\/published>/),
      dauer: null
    }
  })
}

/** ISO-8601-Dauer der YouTube-API („PT1H2M3S“) in Sekunden */
export function isoDauer(s: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s)
  if (!m) return null
  const [, d, h, min, sek] = m.map((x) => Number(x ?? 0))
  return (d ?? 0) * 86400 + (h ?? 0) * 3600 + (min ?? 0) * 60 + (sek ?? 0)
}

async function text(holen: typeof fetch, url: string): Promise<string> {
  const r = await holen(url, { headers: { 'User-Agent': UA, Cookie: COOKIE, 'Accept-Language': 'en' } })
  if (!r.ok) throw new Error(t('meta.fehlerAbruf', { status: r.status }))
  return r.text()
}

/** Ohne API-Schlüssel: Kanal-ID auflösen, dann den RSS-Feed lesen. */
export async function metadatenOhneSchluessel(link: string, holen: typeof fetch = fetch): Promise<MetaVideo[]> {
  const v = kanalAusLink(link)
  if (!v) throw new Error(t('meta.keinYoutube'))
  let id: string | null
  if (v.art === 'id') id = v.id
  else {
    const seite = v.art === 'handle' ? `https://www.youtube.com/@${v.handle}` : `https://www.youtube.com/user/${v.name}`
    id = kanalIdAusSeite(await text(holen, seite))
    if (!id) throw new Error(t('meta.kanalNichtGefunden'))
  }
  return videosAusFeed(await text(holen, `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)).slice(0, 15)
}

/** Mit eigenem Google-API-Schlüssel: offizielle YouTube Data API v3, inklusive Längen. */
export async function metadatenMitSchluessel(link: string, schluessel: string, holen: typeof fetch = fetch): Promise<MetaVideo[]> {
  const v = kanalAusLink(link)
  if (!v) throw new Error(t('meta.keinYoutube'))
  const api = async <T>(pfad: string, params: Record<string, string>): Promise<T> => {
    const url = `https://www.googleapis.com/youtube/v3/${pfad}?${new URLSearchParams({ ...params, key: schluessel })}`
    const r = await holen(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) throw new Error(t('meta.fehlerApi', { status: r.status }))
    return (await r.json()) as T
  }
  const filter: Record<string, string> = v.art === 'id' ? { id: v.id } : v.art === 'handle' ? { forHandle: `@${v.handle}` } : { forUsername: v.name }
  const kanal = await api<{ items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>('channels', { part: 'contentDetails', ...filter })
  const uploads = kanal.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error(t('meta.kanalNichtGefunden'))
  const liste = await api<{ items?: { snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string }; thumbnails?: Record<string, { url?: string }> } }[] }>(
    'playlistItems',
    { part: 'snippet', playlistId: uploads, maxResults: '15' }
  )
  const videos = (liste.items ?? []).map((i) => {
    const s = i.snippet ?? {}
    const id = s.resourceId?.videoId ?? ''
    return { id, titel: s.title ?? '', thumbnail: s.thumbnails?.['high']?.url ?? s.thumbnails?.['medium']?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, veroeffentlicht: s.publishedAt ?? '', dauer: null as number | null }
  })
  if (videos.length) {
    const details = await api<{ items?: { id: string; contentDetails?: { duration?: string } }[] }>('videos', { part: 'contentDetails', id: videos.map((x) => x.id).join(',') })
    for (const d of details.items ?? []) {
      const vid = videos.find((x) => x.id === d.id)
      if (vid && d.contentDetails?.duration) vid.dauer = isoDauer(d.contentDetails.duration)
    }
  }
  return videos
}
