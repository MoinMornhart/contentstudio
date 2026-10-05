// Premiere-Brücke (aus MoinStudio v0.47.0): WebSocket nach RFC 6455 und ein ganzer Durchlauf mit einem nachgebauten
// Plugin. Mit echtem Premiere ungetestet.
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PremiereBruecke } from '../../src/main/premiere/bruecke'
import { annahmeSchluessel, leseRahmen, textRahmen } from '../../src/main/premiere/websocket'

describe('Premiere-Brücke', () => {
  it('berechnet den Annahme-Schlüssel nach RFC 6455', () => {
    expect(annahmeSchluessel('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
  })

  it('liest maskierte Client-Rahmen und schreibt Server-Rahmen, auch lange', () => {
    const daten = Buffer.from('Hallo Premiere')
    const maske = Buffer.from([1, 2, 3, 4])
    const rahmen = Buffer.concat([Buffer.from([0x81, 0x80 | daten.length]), maske, Buffer.from(daten.map((b, i) => b ^ maske[i % 4]!))])
    const { rahmen: r, rest } = leseRahmen(Buffer.concat([rahmen, Buffer.from([0x81])]))
    expect(r[0]!.daten.toString()).toBe('Hallo Premiere')
    expect(rest.length).toBe(1)
    const lang = 'x'.repeat(70_000)
    expect(leseRahmen(textRahmen(lang)).rahmen[0]!.daten.toString()).toBe(lang)
  })

  it('Durchlauf mit nachgebautem Plugin: Hallo, Befehl mit Schlüssel, Antwort, Fehler, Trennen', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'cs-premiere-'))
    const b = new PremiereBruecke(ordner)
    const port = 47900 + Math.floor(Math.random() * 90)
    await b.start(port)
    try {
      const schluessel = (await readFile(join(ordner, 'schluessel'), 'utf8')).trim()
      // Ohne Plugin: klare Meldung nach Ablauf der Wartezeit
      await expect(b.warteAufVerbindung(50)).rejects.toThrow(/ContentStudio Bridge/)
      expect(schluessel).toMatch(/^[0-9a-f]{48}$/)
      // Plugin wie in premiere-plugin/contentstudio-bridge/index.js: nur Befehle mit dem richtigen Schlüssel
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as { id: number; befehl: string; schluessel: string }
        if (m.schluessel !== schluessel) return ws.send(JSON.stringify({ id: m.id, ok: false, fehler: 'Schlüssel passt nicht' }))
        if (m.befehl === 'sequenzen') ws.send(JSON.stringify({ id: m.id, ok: true, ergebnis: ['Video 1'] }))
        else ws.send(JSON.stringify({ id: m.id, ok: false, fehler: `Unbekannter Befehl: ${m.befehl}` }))
      }
      await new Promise((r) => (ws.onopen = r))
      ws.send(JSON.stringify({ hallo: { version: '0.1.0', premiere: '26.0' } }))
      expect(await b.warteAufVerbindung(2000)).toEqual({ version: '0.1.0', premiere: '26.0' })
      expect(await b.befehl('sequenzen')).toEqual(['Video 1'])
      await expect(b.befehl('beliebigerCode')).rejects.toThrow(/Unbekannter Befehl/)
      const getrennt = new Promise((r) => b.once('getrennt', r))
      ws.close()
      await getrennt
      expect(b.verbunden).toBe(false)
      await expect(b.befehl('sequenzen')).rejects.toThrow()
    } finally {
      b.stop()
    }
  })
})
