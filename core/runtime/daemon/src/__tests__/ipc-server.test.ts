import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RuntimeCommand, RuntimeResponse } from '@rohinik-org/compiler'
import { ProtocolCodec } from '../ipc/protocol-codec.js'
import { IpcServer } from '../ipc/ipc-server.js'
import { IpcClient } from '../ipc/ipc-client.js'
import { SocketRuntimeTransport } from '../ipc/socket-runtime-transport.js'

function socketPath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\rhkd-test-${randomUUID()}`
  }
  return join(tmpdir(), `rhkd-test-${randomUUID()}.sock`)
}

const echoHandler = async (cmd: RuntimeCommand): Promise<RuntimeResponse> => ({
  requestId: cmd.requestId,
  success: true,
  payload: { echoed: cmd.type },
})

describe('IpcServer + IpcClient (socket round-trip)', () => {
  const servers: IpcServer[] = []
  const clients: IpcClient[] = []

  afterEach(async () => {
    for (const c of clients) c.disconnect()
    clients.length = 0
    for (const s of servers) await s.close()
    servers.length = 0
  })

  it('codec loopback: encode then decode round-trips', () => {
    const codec = new ProtocolCodec()
    const cmd: RuntimeCommand = { requestId: 'r1', type: 'STATUS', payload: {} }
    expect(codec.decode(codec.encode(cmd))).toEqual(cmd)
    const resp: RuntimeResponse = { requestId: 'r1', success: true, payload: { ok: true } }
    expect(codec.decode(codec.encode(resp))).toEqual(resp)
  })

  it('codec loopback: error response round-trips', () => {
    const codec = new ProtocolCodec()
    const resp: RuntimeResponse = { requestId: 'r2', success: false, payload: null, error: 'boom' }
    const decoded = codec.decode(codec.encode(resp)) as RuntimeResponse
    expect(decoded.success).toBe(false)
    expect((decoded as RuntimeResponse).error).toBe('boom')
  })

  it('IpcServer + IpcClient: STATUS command returns echo response', async () => {
    const path = socketPath()
    const server = new IpcServer()
    servers.push(server)
    await server.listen(path, echoHandler)

    const client = new IpcClient(path)
    clients.push(client)
    await client.connect()

    const cmd: RuntimeCommand = { requestId: randomUUID(), type: 'STATUS', payload: {} }
    const resp = await client.send(cmd)
    expect(resp.requestId).toBe(cmd.requestId)
    expect(resp.success).toBe(true)
  })

  it('IpcServer + IpcClient: multiple sequential requests correlate correctly', async () => {
    const path = socketPath()
    const server = new IpcServer()
    servers.push(server)
    await server.listen(path, echoHandler)

    const client = new IpcClient(path)
    clients.push(client)
    await client.connect()

    const ids = [randomUUID(), randomUUID(), randomUUID()]
    const responses = await Promise.all(
      ids.map(id => client.send({ requestId: id, type: 'OBSERVE', payload: null }))
    )
    for (let i = 0; i < ids.length; i++) {
      expect(responses[i]?.requestId).toBe(ids[i])
      expect(responses[i]?.success).toBe(true)
    }
  })

  it('SocketRuntimeTransport: send returns RuntimeResponse', async () => {
    const path = socketPath()
    const server = new IpcServer()
    servers.push(server)
    await server.listen(path, echoHandler)

    const transport = new SocketRuntimeTransport(path)
    await transport.connect()

    const cmd: RuntimeCommand = { requestId: randomUUID(), type: 'REFLECT', payload: {} }
    const resp = await transport.send(cmd)
    expect(resp.requestId).toBe(cmd.requestId)
    expect(resp.success).toBe(true)

    await transport.disconnect()
  })

  it('SocketRuntimeTransport: handler error returns success:false', async () => {
    const path = socketPath()
    const server = new IpcServer()
    servers.push(server)
    await server.listen(path, async () => { throw new Error('handler blew up') })

    const transport = new SocketRuntimeTransport(path)
    await transport.connect()

    const cmd: RuntimeCommand = { requestId: randomUUID(), type: 'EXECUTE', payload: null }
    const resp = await transport.send(cmd)
    expect(resp.success).toBe(false)
    expect(resp.error).toContain('handler blew up')

    await transport.disconnect()
  })
})
