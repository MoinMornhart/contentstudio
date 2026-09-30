import { describe, expect, it } from 'vitest'
import { isoDauer, kanalAusLink, kanalIdAusSeite, metadatenMitSchluessel, metadatenOhneSchluessel, videosAusFeed } from '../../src/main/profil/metadaten'

const ID = 'UCabcdefghijklmnopqrstuv'

/** Gekürzter, echter Aufbau des öffentlichen YouTube-Feeds */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <yt:channelId>${ID}</yt:channelId>
 <title>Testkanal</title>
 <entry>
  <id>yt:video:vid00000001</id>
  <yt:videoId>vid00000001</yt:videoId>
  <title>Pasta in 10 Minuten &amp; ohne Stress</title>
  <published>2026-09-29T15:00:00+00:00</published>
  <media:group><media:thumbnail url="https://i2.ytimg.com/vi/vid00000001/hqdefault.jpg" width="480" height="360"/></media:group>
 </entry>
 <entry>
  <id>yt:video:vid00000002</id>
  <yt:videoId>vid00000002</yt:videoId>
  <title>Brot backen &#39;wie früher&#39;</title>
  <published>2026-09-25T15:00:00+00:00</published>
 </entry>
</feed>`

describe('Öffentliche Kanal-Metadaten', () => {
  it('erkennt Kanal-Links in allen üblichen Formen', () => {
    expect(kanalAusLink('https://www.youtube.com/@KochMitKim')).toEqual({ art: 'handle', handle: 'KochMitKim' })
    expect(kanalAusLink('@kochmitkim')).toEqual({ art: 'handle', handle: 'kochmitkim' })
    expect(kanalAusLink(`https://youtube.com/channel/${ID}/videos`)).toEqual({ art: 'id', id: ID })
    expect(kanalAusLink('https://www.youtube.com/user/altername')).toEqual({ art: 'user', name: 'altername' })
    expect(kanalAusLink('https://www.twitch.tv/irgendwer')).toBeNull()
  })

  it('findet die Kanal-ID in der Kanalseite', () => {
    expect(kanalIdAusSeite(`<html>…"externalId":"${ID}"…</html>`)).toBe(ID)
    expect(kanalIdAusSeite(`<link rel="canonical" href="https://www.youtube.com/channel/${ID}">`)).toBe(ID)
    expect(kanalIdAusSeite('<html>nichts</html>')).toBeNull()
  })

  it('liest Titel, Thumbnail und Datum aus dem Feed (Sonderzeichen korrekt, Längen unbekannt)', () => {
    const v = videosAusFeed(FEED)
    expect(v).toHaveLength(2)
    expect(v[0]).toEqual({ id: 'vid00000001', titel: 'Pasta in 10 Minuten & ohne Stress', thumbnail: 'https://i2.ytimg.com/vi/vid00000001/hqdefault.jpg', veroeffentlicht: '2026-09-29T15:00:00+00:00', dauer: null })
    expect(v[1]!.titel).toBe("Brot backen 'wie früher'")
    expect(v[1]!.thumbnail).toBe('https://i.ytimg.com/vi/vid00000002/hqdefault.jpg')
  })

  it('ohne Schlüssel: Handle → Kanalseite → Feed, mit Einwilligungs-Cookie', async () => {
    const aufrufe: { url: string; cookie: string | null }[] = []
    const holen = (async (url: string, init?: RequestInit) => {
      aufrufe.push({ url, cookie: new Headers(init?.headers).get('cookie') })
      if (url === 'https://www.youtube.com/@kochmitkim') return new Response(`"externalId":"${ID}"`)
      if (url.includes('/feeds/videos.xml')) return new Response(FEED)
      return new Response('', { status: 404 })
    }) as typeof fetch
    const v = await metadatenOhneSchluessel('https://www.youtube.com/@kochmitkim', holen)
    expect(v.map((x) => x.id)).toEqual(['vid00000001', 'vid00000002'])
    expect(aufrufe.map((a) => a.url)).toEqual(['https://www.youtube.com/@kochmitkim', `https://www.youtube.com/feeds/videos.xml?channel_id=${ID}`])
    expect(aufrufe.every((a) => a.cookie === 'SOCS=CAI')).toBe(true)
  })

  it('mit eigenem API-Schlüssel: offizielle API inklusive Längen', async () => {
    const holen = (async (url: string) => {
      const u = new URL(url)
      expect(u.searchParams.get('key')).toBe('SCHLUESSEL')
      if (u.pathname.endsWith('/channels')) {
        expect(u.searchParams.get('forHandle')).toBe('@kochmitkim')
        return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUxyz' } } }] })
      }
      if (u.pathname.endsWith('/playlistItems')) {
        return Response.json({ items: [{ snippet: { title: 'Pasta', publishedAt: '2026-09-29T15:00:00Z', resourceId: { videoId: 'v1' }, thumbnails: { high: { url: 'https://i.ytimg.com/vi/v1/hq.jpg' } } } }] })
      }
      if (u.pathname.endsWith('/videos')) return Response.json({ items: [{ id: 'v1', contentDetails: { duration: 'PT12M34S' } }] })
      return new Response('', { status: 404 })
    }) as typeof fetch
    const v = await metadatenMitSchluessel('@kochmitkim', 'SCHLUESSEL', holen)
    expect(v).toEqual([{ id: 'v1', titel: 'Pasta', thumbnail: 'https://i.ytimg.com/vi/v1/hq.jpg', veroeffentlicht: '2026-09-29T15:00:00Z', dauer: 754 }])
  })

  it('rechnet ISO-Dauern in Sekunden um', () => {
    expect(isoDauer('PT1H2M3S')).toBe(3723)
    expect(isoDauer('PT45S')).toBe(45)
    expect(isoDauer('P1DT1S')).toBe(86401)
    expect(isoDauer('Unsinn')).toBeNull()
  })

  it('meldet Nicht-YouTube-Links verständlich', async () => {
    await expect(metadatenOhneSchluessel('https://www.tiktok.com/@x')).rejects.toThrow(/YouTube/)
  })
})
