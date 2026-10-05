// Herkunft: MoinStudio src/main/premiere/websocket.ts (MIT), v0.47.0.
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { Duplex } from 'node:stream'

/**
 * Kleinster WebSocket-Server (RFC 6455) für die Premiere-Brücke: nur 127.0.0.1, nur Text-Nachrichten,
 * keine Erweiterungen. Das UXP-Plugin in Premiere kann selbst keinen Server öffnen, nur als Client verbinden – deshalb
 * ist ContentStudio der Server. Eigene Umsetzung statt Fremdpaket (keine neue Abhängigkeit).
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export interface WsVerbindung {
  senden(text: string): void
  schliessen(): void
}

export function annahmeSchluessel(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64')
}

/** Rahmen für eine Textnachricht vom Server (unmaskiert). */
export function textRahmen(text: string): Buffer {
  const daten = Buffer.from(text, 'utf8')
  const n = daten.length
  const kopf = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127]), (() => {
    const b = Buffer.alloc(8)
    b.writeBigUInt64BE(BigInt(n))
    return b
  })()])
  return Buffer.concat([kopf, daten])
}

/** Liest vollständige Rahmen aus dem Puffer: [Rahmen (opcode, Nutzdaten demaskiert), Rest]. */
export function leseRahmen(puffer: Buffer): { rahmen: { opcode: number; fin: boolean; daten: Buffer }[]; rest: Buffer } {
  const rahmen: { opcode: number; fin: boolean; daten: Buffer }[] = []
  let p = 0
  for (;;) {
    if (puffer.length - p < 2) break
    const b0 = puffer[p]!
    const b1 = puffer[p + 1]!
    let laenge = b1 & 127
    let k = 2
    if (laenge === 126) {
      if (puffer.length - p < 4) break
      laenge = puffer.readUInt16BE(p + 2)
      k = 4
    } else if (laenge === 127) {
      if (puffer.length - p < 10) break
      laenge = Number(puffer.readBigUInt64BE(p + 2))
      k = 10
    }
    const maskiert = (b1 & 128) !== 0
    const gesamt = k + (maskiert ? 4 : 0) + laenge
    if (puffer.length - p < gesamt) break
    const maske = maskiert ? puffer.subarray(p + k, p + k + 4) : null
    const daten = Buffer.from(puffer.subarray(p + k + (maskiert ? 4 : 0), p + gesamt))
    if (maske) for (let i = 0; i < daten.length; i++) daten[i]! ^= maske[i % 4]!
    rahmen.push({ opcode: b0 & 15, fin: (b0 & 128) !== 0, daten })
    p += gesamt
  }
  return { rahmen, rest: puffer.subarray(p) }
}

export function starteWsServer(port: number, beiVerbindung: (v: WsVerbindung, nachricht: (cb: (text: string) => void) => void, ende: (cb: () => void) => void) => void): Promise<Server> {
  const server = createServer((_req, res) => {
    res.writeHead(426, { 'content-type': 'text/plain' })
    res.end('ContentStudio bridge: WebSocket only')
  })
  server.on('upgrade', (req, socket: Duplex) => {
    const key = req.headers['sec-websocket-key']
    if (typeof key !== 'string') return socket.destroy()
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${annahmeSchluessel(key)}`, '', ''].join('\r\n'))
    let puffer: Buffer = Buffer.alloc(0)
    let teile: Buffer[] = []
    const hoerer: ((t: string) => void)[] = []
    const endeHoerer: (() => void)[] = []
    const v: WsVerbindung = {
      senden: (text) => {
        if (!socket.destroyed) socket.write(textRahmen(text))
      },
      schliessen: () => {
        if (!socket.destroyed) socket.end(Buffer.from([0x88, 0]))
      }
    }
    socket.on('data', (d: Buffer) => {
      const r = leseRahmen(Buffer.concat([puffer, d]))
      puffer = r.rest
      for (const f of r.rahmen) {
        if (f.opcode === 8) return v.schliessen()
        if (f.opcode === 9) socket.write(Buffer.concat([Buffer.from([0x8a, f.daten.length]), f.daten])) // Ping → Pong
        if (f.opcode === 1 || f.opcode === 0) {
          teile.push(f.daten)
          if (f.fin) {
            const text = Buffer.concat(teile).toString('utf8')
            teile = []
            hoerer.forEach((h) => h(text))
          }
        }
      }
    })
    socket.on('close', () => endeHoerer.forEach((h) => h()))
    socket.on('error', () => socket.destroy())
    beiVerbindung(v, (cb) => hoerer.push(cb), (cb) => endeHoerer.push(cb))
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
