import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KontoSchema, leeresProfil, type Konto, type Profil } from '../../src/shared/profil'
import { pruefeTitel } from '../../src/shared/planung'
import { PLATTFORM_VORGABEN } from '../../src/shared/schnitt'
import { crossPlan, kurzZiele } from '../../src/main/planung/crossposting'
import { planungAktion, type PlanungZugang } from '../../src/main/planung/aktionen'
import { ladeKarten } from '../../src/main/planung/karten'
import { authUrl, ladeHoch, pkce, tauscheCode, verbindeImBrowser, VerbindungsSpeicher, youtubeMetadaten, YT_SCOPE, type Holen } from '../../src/main/planung/upload'
import { createHash } from 'node:crypto'

const konto = (x: Partial<Konto>): Konto => KontoSchema.parse({ id: 'yt', plattform: 'youtube', name: '@kochmitkim', sprache: 'de', ...x })

describe('Cross-Posting (ROADMAP 6.4)', () => {
  const HOEHEPUNKTE = [
    { start: 30, ende: 70, titel: 'Der Teig reißt #fail', wert: 6 },
    { start: 120, ende: 260, titel: 'Die perfekte Kruste – so gelingt sie jedem, auch ohne Profi-Ofen und ohne teure Geräte in der Küche', wert: 9 },
    { start: 400, ende: 430, titel: 'Probieren', wert: 8 },
    { start: 500, ende: 520, titel: 'Abspann', wert: 2 }
  ]
  const KONTEN = [konto({ id: 'yt', rhythmus: [{ tag: 6, zeit: '17:00' }] }), konto({ id: 'tt', plattform: 'tiktok', name: '@kim.kocht', rhythmus: [{ tag: 0, zeit: '12:00' }] }), konto({ id: 'ig', plattform: 'instagram-reels', name: '@kim.kocht' })]

  it('plant ein Langvideo mit Kurzvideos auf drei Plattformen', () => {
    const plan = crossPlan({ lang: { kontoId: 'yt', plattform: 'youtube', titel: 'Brot backen wie beim Bäcker', termin: '2026-10-03T17:00' }, hoehepunkte: HOEHEPUNKTE, konten: KONTEN })
    // Langvideo zuerst, dann 3 Tage je ein Kurzvideo auf TikTok, Reels und Shorts
    expect(plan[0]).toMatchObject({ art: 'lang', plattform: 'youtube', termin: '2026-10-03T17:00' })
    const kurz = plan.filter((p) => p.art === 'kurz')
    expect(kurz).toHaveLength(9)
    expect(new Set(kurz.map((p) => p.plattform))).toEqual(new Set(['tiktok', 'instagram-reels', 'youtube-shorts']))
    // stärkster Höhepunkt am ersten Tag danach, Abspann (wert 2) gar nicht
    expect(kurz.filter((p) => p.termin.startsWith('2026-10-04')).every((p) => p.von === 120)).toBe(true)
    expect(kurz.some((p) => p.von === 500)).toBe(false)
    // TikTok am Sonntag zur Rhythmus-Zeit, Reels eine Stunde später als der Rhythmus des Langvideos, Shorts danach
    expect(kurz.find((p) => p.plattform === 'tiktok' && p.termin.startsWith('2026-10-04'))!.termin).toBe('2026-10-04T12:00')
    for (const p of kurz) {
      expect(p.bis! - p.von!).toBeLessThanOrEqual(Math.min(60, PLATTFORM_VORGABEN[p.plattform].maxDauer ?? 60))
      expect(pruefeTitel(p.titel, p.plattform).ok).toBe(true)
    }
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.termin >= plan[i - 1]!.termin).toBe(true)
  })

  it('nimmt YouTube Shorts, wenn der Creator nur YouTube hat', () => {
    expect(kurzZiele([konto({})]).map((z) => z.plattform)).toEqual(['youtube-shorts'])
    expect(kurzZiele([konto({}), konto({ id: 's', plattform: 'youtube-shorts' })]).map((z) => z.plattform)).toEqual(['youtube-shorts'])
    const plan = crossPlan({ lang: { kontoId: 'yt', plattform: 'youtube', titel: 'Brot', termin: '2026-10-03T17:00' }, hoehepunkte: [], konten: [konto({})] })
    expect(plan).toHaveLength(1)
  })
})

describe('Planung aus einer MCP-App (Werkzeug planning)', () => {
  it('legt Karten an, plant ein, setzt den Rhythmus im Profil und meldet verständliche Fehler', async () => {
    const daten = await mkdtemp(join(tmpdir(), 'cs-mcp-plan-'))
    let profil: Profil = { ...leeresProfil(), konten: [konto({ id: 'yt' }), konto({ id: 'tt', plattform: 'tiktok' })] }
    const z: PlanungZugang = {
      profil: async () => profil,
      setzeRhythmus: async (id, slots) => void (profil = { ...profil, konten: profil.konten.map((k) => (k.id === id ? { ...k, rhythmus: slots } : k)) }),
      starte: async () => 'auftrag-1',
      stand: async () => ({ state: 'done' }),
      crossposting: async () => ({ ok: true })
    }
    const neu = (await planungAktion(daten, { aktion: 'anlegen', konto: 'tt', titel: 'Kürbissuppe in 5 Minuten', notizen: 'mit Mia' }, z)) as { id: string; konto: string }
    expect(neu.konto).toBe('tt')
    expect(await planungAktion(daten, { aktion: 'aendern', karte: neu.id, termin: '2099-10-03' }, z)).toMatchObject({ termin: '2099-10-03T17:00' })
    expect(await planungAktion(daten, { aktion: 'verschieben', karte: neu.id, spalte: 'aufnahme' }, z)).toMatchObject({ stand: 'aufnahme' })
    const [k] = await ladeKarten(daten)
    expect(k).toMatchObject({ spalte: 'aufnahme', termin: '2099-10-03T17:00', updatedBy: 'MCP' })
    await planungAktion(daten, { aktion: 'rhythmus_setzen', rhythmus: { yt: [{ tag: 5, zeit: '18:00' }] } }, z)
    expect(profil.konten[0]!.rhythmus).toEqual([{ tag: 5, zeit: '18:00' }])
    const kal = (await planungAktion(daten, { aktion: 'kalender', von: '2099-10-01', bis: '2099-10-07' }, z)) as { freieTermine: unknown[]; termine: unknown[] }
    expect(kal.freieTermine).toEqual([{ konto: 'yt', tag: '2099-10-02', zeit: '18:00' }])
    expect(kal.termine).toHaveLength(1)
    expect(await planungAktion(daten, { aktion: 'ideen', konto: 'yt' }, z)).toMatchObject({ auftrag: 'auftrag-1' })
    await expect(planungAktion(daten, { aktion: 'anlegen', konto: 'gibtsnicht', titel: 'x' }, z)).rejects.toThrow(/Unbekanntes Konto.*yt/)
    await expect(planungAktion(daten, { aktion: 'aendern', karte: 'gibtsnicht1234', titel: 'x' }, z)).rejects.toThrow('nicht gefunden')
    await expect(planungAktion(daten, { aktion: 'aendern', karte: neu.id, termin: 'morgen' }, z)).rejects.toThrow('2026-10-03T17:00')
  })
})

/** Nachgebautes Google: Token-Endpunkt und fortsetzbarer Upload, prüft alles, was ContentStudio schickt */
function fakeGoogle(): { holen: Holen; anfragen: { url: string; init: RequestInit }[] } {
  const anfragen: { url: string; init: RequestInit }[] = []
  const holen: Holen = async (eingabe, init) => {
    const url = String(eingabe)
    anfragen.push({ url, init: init ?? {} })
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const f = new URLSearchParams(String(init?.body))
      if (f.get('grant_type') === 'authorization_code') {
        const ok = f.get('code') === 'code-123' && !!f.get('code_verifier') && f.get('client_secret') === 'geheim'
        return new Response(JSON.stringify(ok ? { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 } : { error: 'invalid_grant' }), { status: ok ? 200 : 400 })
      }
      return new Response(JSON.stringify({ access_token: 'a2', expires_in: 3600 }))
    }
    if (url.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) {
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer a2')
      return new Response('', { status: 200, headers: { location: 'https://upload.example/sitzung-1' } })
    }
    if (url === 'https://upload.example/sitzung-1') {
      let n = 0
      for await (const teil of init!.body as unknown as AsyncIterable<Uint8Array>) n += teil.length
      return new Response(JSON.stringify(n === 5000 ? { id: 'vid123' } : { error: { message: `falsche Länge ${n}` } }), { status: n === 5000 ? 200 : 400 })
    }
    return new Response('', { status: 404 })
  }
  return { holen, anfragen }
}

describe('Hochladen nur mit offizieller Anmeldung (ROADMAP 6.5)', () => {
  it('baut die Anmeldung mit PKCE und nur dem Upload-Recht', () => {
    const { verifier, challenge } = pkce()
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    const u = new URL(authUrl({ clientId: 'cid', clientSecret: 'geheim' }, 'http://127.0.0.1:5000', challenge, 'st'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('scope')).toBe(YT_SCOPE)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.toString()).not.toContain('geheim')
  })

  it('meldet über den Browser an: Rückruf nur auf 127.0.0.1, falscher state wird abgelehnt', async () => {
    const g = fakeGoogle()
    const ok = verbindeImBrowser({ clientId: 'cid', clientSecret: 'geheim' }, (url) => {
      const u = new URL(url)
      void fetch(`${u.searchParams.get('redirect_uri')}/?code=code-123&state=${u.searchParams.get('state')}`)
    }, g.holen)
    await expect(ok).resolves.toEqual({ refresh: 'r1', access: 'a1' })
    const falsch = verbindeImBrowser({ clientId: 'cid', clientSecret: 'geheim' }, (url) => void fetch(`${new URL(url).searchParams.get('redirect_uri')}/?code=code-123&state=boese`), g.holen)
    await expect(falsch).rejects.toThrow('abgebrochen')
    await expect(tauscheCode({ clientId: 'cid', clientSecret: 'falsch' }, 'code-123', 'v', 'http://127.0.0.1')).rejects.toThrow()
  })

  it('lädt privat hoch, mit Termin geplant, und schickt die ganze Datei', async () => {
    const datei = join(await mkdtemp(join(tmpdir(), 'cs-upload-')), 'video.mp4')
    await writeFile(datei, Buffer.alloc(5000, 1))
    const g = fakeGoogle()
    const anteile: number[] = []
    const r = await ladeHoch('a2', { datei, titel: 'Brot', beschreibung: 'Text', tags: ['brot'], termin: '2099-10-03T17:00' }, g.holen, (a) => anteile.push(a))
    expect(r).toEqual({ videoId: 'vid123' })
    expect(anteile.at(-1)).toBe(1)
    const meta = JSON.parse(String(g.anfragen[0]!.init.body)) as { status: { privacyStatus: string; publishAt?: string } }
    expect(meta.status.privacyStatus).toBe('private')
    expect(meta.status.publishAt).toBe(new Date('2099-10-03T17:00').toISOString())
    expect(youtubeMetadaten({ datei, titel: 'x', beschreibung: '', tags: [], termin: null })).toMatchObject({ status: { privacyStatus: 'private' } })
    expect((youtubeMetadaten({ datei, titel: 'x', beschreibung: '', tags: [], termin: '2000-01-01T10:00' }) as { status: object }).status).not.toHaveProperty('publishAt')
  })

  it('speichert Zugangsdaten nur verschlüsselt und löscht sie beim Trennen', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'cs-verb-'))
    const tresor = { verfuegbar: () => true, verschluesseln: (s: string) => Buffer.from(s.split('').reverse().join('')), entschluesseln: (b: Buffer) => b.toString().split('').reverse().join('') }
    const v = new VerbindungsSpeicher(ordner, tresor)
    await v.setze('yt', { clientId: 'cid', clientSecret: 'geheim', refresh: 'r1' })
    const roh = await readFile(join(ordner, 'upload-verbindungen.json'), 'utf8')
    expect(roh).not.toContain('geheim')
    expect(roh).not.toContain('r1')
    expect(await v.liste()).toEqual([{ plattform: 'youtube', kontoId: 'yt', verbunden: expect.any(String) }])
    expect(await v.hole('yt')).toEqual({ clientId: 'cid', clientSecret: 'geheim', refresh: 'r1' })
    const widerrufen: string[] = []
    await v.trenne('yt', async (u) => {
      widerrufen.push(String(u))
      return new Response('')
    })
    expect(widerrufen[0]).toContain('revoke?token=r1')
    expect(await v.liste()).toEqual([])
    await expect(new VerbindungsSpeicher(ordner, { ...tresor, verfuegbar: () => false }).setze('yt', { clientId: 'a', clientSecret: 'b', refresh: 'c' })).rejects.toThrow()
  })
})

