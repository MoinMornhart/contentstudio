import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import { t } from '../i18n'
import type { Tresor } from '../ki/schluessel'

/**
 * Hochladen nur mit offizieller Anmeldung (ROADMAP 6.5). Standard ist: ContentStudio lädt nichts hoch, sondern legt ein
 * Upload-Paket an (Video, Thumbnail, Texte). Optional verbindet der Creator YouTube über OAuth mit einem eigenen
 * OAuth-Client (Google Cloud, Typ „Desktop-App“) – Anmeldung im Browser bei Google, ContentStudio sieht nie das
 * Passwort. Gespeichert wird nur das Erneuerungs-Token, verschlüsselt mit dem Schlüsselspeicher des Betriebssystems,
 * außerhalb des (synchronisierten) Datenordners; „Trennen“ löscht es und widerruft es bei Google.
 *
 * Solange kein Mensch ein echtes Konto verbunden hat, gilt der Weg als ungetestet (so steht es auch in der Oberfläche).
 */

export const YT_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
export const YT_TOKEN = 'https://oauth2.googleapis.com/token'
export const YT_REVOKE = 'https://oauth2.googleapis.com/revoke'
export const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos'
export const YT_THUMB = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set'
export const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.upload'

export type Holen = typeof fetch

export interface OAuthKlient {
  clientId: string
  clientSecret: string
}

/** PKCE (RFC 7636): zufälliger Prüfwert und seine SHA-256-Ableitung */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export function authUrl(k: OAuthKlient, redirect: string, challenge: string, state: string): string {
  const q = new URLSearchParams({ client_id: k.clientId, redirect_uri: redirect, response_type: 'code', scope: YT_SCOPE, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', state })
  return `${YT_AUTH}?${q.toString()}`
}

async function tokenAnfrage(holen: Holen, felder: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const r = await holen(YT_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!r.ok || !j.access_token) throw new Error(t('upload.fehler.anmeldung', { grund: j.error_description ?? j.error ?? String(r.status) }))
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in ?? 3600 }
}

export async function tauscheCode(k: OAuthKlient, code: string, verifier: string, redirect: string, holen: Holen = fetch): Promise<{ refresh: string; access: string }> {
  const j = await tokenAnfrage(holen, { client_id: k.clientId, client_secret: k.clientSecret, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirect })
  if (!j.refresh_token) throw new Error(t('upload.fehler.keinToken'))
  return { refresh: j.refresh_token, access: j.access_token }
}

export async function erneuere(k: OAuthKlient, refresh: string, holen: Holen = fetch): Promise<string> {
  return (await tokenAnfrage(holen, { client_id: k.clientId, client_secret: k.clientSecret, refresh_token: refresh, grant_type: 'refresh_token' })).access_token
}

/**
 * Anmeldung im Browser: kleiner Server nur auf 127.0.0.1 (zufälliger Port) nimmt die Antwort von Google entgegen.
 * `oeffne` öffnet die Anmeldeseite im Standardbrowser. Nach 5 Minuten ohne Antwort wird abgebrochen.
 */
export function verbindeImBrowser(k: OAuthKlient, oeffne: (url: string) => void, holen: Holen = fetch, warte = 5 * 60_000): Promise<{ refresh: string; access: string }> {
  const { verifier, challenge } = pkce()
  const state = randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/') return void res.writeHead(404).end()
      const code = url.searchParams.get('code')
      const ok = !!code && url.searchParams.get('state') === state
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><p style="font:16px system-ui">${ok ? t('upload.browser.ok') : t('upload.browser.fehler')}</p>`)
      clearTimeout(zeit)
      server.close()
      if (!ok) return reject(new Error(t('upload.fehler.abgebrochen')))
      tauscheCode(k, code, verifier, redirect, holen).then(resolve, reject)
    })
    let redirect = ''
    const zeit = setTimeout(() => {
      server.close()
      reject(new Error(t('upload.fehler.zeit')))
    }, warte)
    server.listen(0, '127.0.0.1', () => {
      const adr = server.address()
      redirect = `http://127.0.0.1:${typeof adr === 'object' && adr ? adr.port : 0}`
      oeffne(authUrl(k, redirect, challenge, state))
    })
  })
}

export interface UploadDaten {
  datei: string
  titel: string
  beschreibung: string
  tags: string[]
  /** geplante Veröffentlichung (lokale Zeit „2026-10-03T17:00“); ohne Termin bleibt das Video privat */
  termin: string | null
  /** Kategorie 22 = „People & Blogs“ (YouTube-Standard) */
  kategorie?: string
}

/** Metadaten für YouTube: immer privat; mit Termin in der Zukunft veröffentlicht YouTube selbst zu diesem Zeitpunkt */
export function youtubeMetadaten(d: UploadDaten, jetzt = new Date()): Record<string, unknown> {
  const wann = d.termin ? new Date(d.termin) : null
  const geplant = wann && !Number.isNaN(wann.getTime()) && wann.getTime() > jetzt.getTime() + 15 * 60_000
  return {
    snippet: { title: d.titel.slice(0, 100), description: d.beschreibung.slice(0, 5000), tags: d.tags.slice(0, 15), categoryId: d.kategorie ?? '22' },
    status: { privacyStatus: 'private', selfDeclaredMadeForKids: false, ...(geplant ? { publishAt: wann.toISOString() } : {}) }
  }
}

/** Fortsetzbarer Upload (resumable): erst Metadaten, dann die Datei an die gemeldete Adresse */
export async function ladeHoch(access: string, d: UploadDaten, holen: Holen = fetch, melde?: (anteil: number) => void): Promise<{ videoId: string }> {
  const groesse = (await stat(d.datei)).size
  const start = await holen(`${YT_UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(groesse), 'X-Upload-Content-Type': 'video/*' },
    body: JSON.stringify(youtubeMetadaten(d))
  })
  const ziel = start.headers.get('location')
  if (!start.ok || !ziel) throw new Error(t('upload.fehler.start', { grund: String(start.status) }))
  let gesendet = 0
  const strom = createReadStream(d.datei)
  strom.on('data', (c) => {
    gesendet += c.length
    melde?.(gesendet / groesse)
  })
  const r = await holen(ziel, { method: 'PUT', headers: { 'Content-Length': String(groesse), 'Content-Type': 'video/*' }, body: Readable.toWeb(strom) as ReadableStream, duplex: 'half' } as RequestInit)
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!r.ok || !j.id) throw new Error(t('upload.fehler.upload', { grund: j.error?.message ?? String(r.status) }))
  return { videoId: j.id }
}

export async function setzeThumbnail(access: string, videoId: string, bild: string, holen: Holen = fetch): Promise<void> {
  const typ = /\.png$/i.test(bild) ? 'image/png' : 'image/jpeg'
  const { readFile } = await import('node:fs/promises')
  const r = await holen(`${YT_THUMB}?videoId=${encodeURIComponent(videoId)}`, { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': typ }, body: new Uint8Array(await readFile(bild)) })
  if (!r.ok) throw new Error(t('upload.fehler.thumbnail', { grund: String(r.status) }))
}

// --- Verbindungen speichern (verschlüsselt, außerhalb des Datenordners) ---

const Gespeichert = z.record(z.string(), z.object({ kontoId: z.string(), verbunden: z.string(), daten: z.string() }))
interface Geheim {
  clientId: string
  clientSecret: string
  refresh: string
}
export interface VerbindungInfo {
  plattform: 'youtube'
  kontoId: string
  verbunden: string
}

export class VerbindungsSpeicher {
  constructor(
    private readonly ordner: string,
    private readonly tresor: Tresor
  ) {}

  private get pfad(): string {
    return join(this.ordner, 'upload-verbindungen.json')
  }

  private async lesen(): Promise<z.infer<typeof Gespeichert>> {
    const r = await readJson(this.pfad, Gespeichert)
    return r.ok ? r.value : {}
  }

  /** Ohne Geheimnisse: welche Konten verbunden sind */
  async liste(): Promise<VerbindungInfo[]> {
    return Object.entries(await this.lesen()).map(([schluessel, v]) => ({ plattform: schluessel.split(':')[0] as 'youtube', kontoId: v.kontoId, verbunden: v.verbunden }))
  }

  async setze(kontoId: string, g: Geheim): Promise<void> {
    if (!this.tresor.verfuegbar()) throw new Error(t('ki.keineVerschluesselung'))
    const alle = await this.lesen()
    alle[`youtube:${kontoId}`] = { kontoId, verbunden: new Date().toISOString(), daten: this.tresor.verschluesseln(JSON.stringify(g)).toString('base64') }
    await writeJsonAtomic(this.pfad, alle)
  }

  async hole(kontoId: string): Promise<Geheim | null> {
    const v = (await this.lesen())[`youtube:${kontoId}`]
    if (!v) return null
    try {
      return JSON.parse(this.tresor.entschluesseln(Buffer.from(v.daten, 'base64'))) as Geheim
    } catch {
      return null
    }
  }

  async trenne(kontoId: string, holen: Holen = fetch): Promise<void> {
    const g = await this.hole(kontoId)
    // bei Google widerrufen (Fehler dabei hindern das Löschen nicht)
    if (g) await holen(`${YT_REVOKE}?token=${encodeURIComponent(g.refresh)}`, { method: 'POST' }).catch(() => undefined)
    const alle = await this.lesen()
    delete alle[`youtube:${kontoId}`]
    await writeJsonAtomic(this.pfad, alle)
  }
}
