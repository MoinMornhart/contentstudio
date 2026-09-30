import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { RpcClient, RpcServer } from '../../src/main/rpc/pipe'
import { pipeName } from '../../src/shared/rpc'

describe('Named-Pipe-RPC', () => {
  let server: RpcServer | null = null
  afterEach(() => server?.close())

  const starte = async (): Promise<RpcServer> => {
    server = new RpcServer(pipeName(`test-${randomBytes(4).toString('hex')}`))
    server.handle('echo', (p) => ({ zurueck: p }))
    server.handle('kaputt', () => {
      throw new Error('absichtlich')
    })
    await server.listen()
    return server
  }

  it('beantwortet Anfragen mit dem richtigen Token', async () => {
    const s = await starte()
    const c = new RpcClient({ pipe: s.pipe, token: s.token })
    await c.connect()
    expect(await c.call('echo', { a: 1 })).toEqual({ zurueck: { a: 1 } })
    await expect(c.call('kaputt')).rejects.toThrow('absichtlich')
    await expect(c.call('gibtsnicht')).rejects.toThrow(/Unknown method/)
    c.close()
  })

  it('lehnt einen falschen Token ab', async () => {
    const s = await starte()
    const c = new RpcClient({ pipe: s.pipe, token: 'falsch' })
    await c.connect()
    await expect(c.call('echo', 1)).rejects.toThrow('Not authorized')
    c.close()
  })

  it('Pipe-Name ist je Windows-Benutzer eindeutig und ohne Sonderzeichen', () => {
    expect(pipeName('Max Müller')).toBe('\\\\.\\pipe\\contentstudio-max_m_ller')
  })
})
