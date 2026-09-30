import { createServer, connect, type Server, type Socket } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { PipeInfo, RpcRequest, RpcResponse } from '@shared/rpc'

export type RpcMethod = (params: unknown) => Promise<unknown> | unknown

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Pipe-Server in der App: nimmt Anfragen des MCP-Servers entgegen und ruft registrierte Methoden auf. */
export class RpcServer {
  readonly token = randomBytes(24).toString('hex')
  private server: Server | null = null
  private methods = new Map<string, RpcMethod>()

  constructor(readonly pipe: string) {}

  handle(method: string, fn: RpcMethod): void {
    this.methods.set(method, fn)
  }

  info(version: string): PipeInfo {
    return { pipe: this.pipe, token: this.token, pid: process.pid, version }
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.serve(socket))
      this.server.once('error', reject)
      this.server.listen(this.pipe, () => resolve())
    })
  }

  close(): void {
    this.server?.close()
  }

  private serve(socket: Socket): void {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > 4 * 1024 * 1024) return void socket.destroy()
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line.trim()) void this.answer(socket, line)
      }
    })
    socket.on('error', () => undefined)
  }

  private async answer(socket: Socket, line: string): Promise<void> {
    let req: RpcRequest
    try {
      req = JSON.parse(line) as RpcRequest
    } catch {
      return
    }
    const reply = (r: RpcResponse): void => {
      if (!socket.destroyed) socket.write(`${JSON.stringify(r)}\n`)
    }
    if (typeof req.token !== 'string' || !safeEqual(req.token, this.token)) return reply({ id: req.id, error: 'Not authorized' })
    const fn = this.methods.get(req.method)
    if (!fn) return reply({ id: req.id, error: `Unknown method: ${req.method}` })
    try {
      reply({ id: req.id, result: (await fn(req.params)) ?? null })
    } catch (err) {
      reply({ id: req.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

/** Pipe-Client (im MCP-Server): eine Verbindung, beliebig viele parallele Anfragen. */
export class RpcClient {
  private socket: Socket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  constructor(private readonly info: { pipe: string; token: string }) {}

  connect(timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.info.pipe)
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('Timed out connecting to ContentStudio'))
      }, timeoutMs)
      socket.once('connect', () => {
        clearTimeout(timer)
        this.socket = socket
        resolve()
      })
      socket.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      let buffer = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => {
        buffer += chunk
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          try {
            const res = JSON.parse(line) as RpcResponse
            const p = this.pending.get(res.id)
            if (!p) continue
            this.pending.delete(res.id)
            if ('error' in res) p.reject(new Error(res.error))
            else p.resolve(res.result)
          } catch {
            // ungültige Zeile ignorieren
          }
        }
      })
      socket.on('close', () => {
        for (const p of this.pending.values()) p.reject(new Error('Connection to ContentStudio closed'))
        this.pending.clear()
        this.socket = null
      })
    })
  }

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.socket) return Promise.reject(new Error('Not connected to ContentStudio'))
    const id = this.nextId++
    const req: RpcRequest = { id, token: this.info.token, method, params }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.socket!.write(`${JSON.stringify(req)}\n`)
    })
  }

  close(): void {
    this.socket?.end()
  }
}
