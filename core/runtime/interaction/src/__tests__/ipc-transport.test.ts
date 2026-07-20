import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { platform } from 'node:os'
import { unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { IpcTransport, makeTestResponse } from '../transport/ipc-transport.js'
import type { IpcEnvelope } from '../types.js'

const SOCKET = platform() === 'win32'
  ? '\\\\.\\pipe\\rohinik-test-ipc-transport'
  : '/tmp/rohinik-test-ipc-transport.sock'

function makeRequest() {
  const sessionId = randomUUID()
  return {
    id: randomUUID(), sessionId, workspaceId: randomUUID(),
    input: 'hello', type: 'conversation' as const,
    context: {
      sessionId, workspaceId: randomUUID(), adapterId: 'test',
      transport: 'IPC' as const, interactive: false, cwd: '/tmp',
      locale: 'en-US', identity: { runtimeId: 'test', version: '0.0.0' },
      requestNumber: 1, timestamp: new Date(),
    },
  }
}

describe('IpcTransport', () => {
  let server: Server

  beforeEach(async () => {
    if (platform() !== 'win32') {
      await unlink(SOCKET).catch(() => undefined)
    }
    server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.listen(SOCKET, resolve)
      server.once('error', reject)
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    if (platform() !== 'win32') {
      await unlink(SOCKET).catch(() => undefined)
    }
  })

  it('type is IPC', () => {
    expect(new IpcTransport(SOCKET).type).toBe('IPC')
  })

  it('ping() returns true when server responds with pong', async () => {
    if (platform() === 'win32') return
    server.on('connection', (socket) => {
      let buf = ''
      socket.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const env = JSON.parse(line) as IpcEnvelope
          if (env.type === 'ping') {
            socket.write(JSON.stringify({ protocol: 1, type: 'pong', payload: {} }) + '\n')
          }
        }
      })
    })
    const transport = new IpcTransport(SOCKET)
    expect(await transport.ping()).toBe(true)
  })

  it('ping() returns false when server does not respond within 500ms', async () => {
    if (platform() === 'win32') return
    // server accepts connection but never responds
    const transport = new IpcTransport(SOCKET)
    const result = await transport.ping()
    expect(result).toBe(false)
  })

  it('send() resolves with response from server', async () => {
    if (platform() === 'win32') return
    const expected = makeTestResponse({ output: 'hello world' })
    server.on('connection', (socket) => {
      let buf = ''
      socket.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const env = JSON.parse(line) as IpcEnvelope
          if (env.type === 'request') {
            socket.write(JSON.stringify({ protocol: 1, type: 'response', payload: expected }) + '\n')
          }
        }
      })
    })
    const transport = new IpcTransport(SOCKET)
    const result = await transport.send(makeRequest())
    expect(result.output).toBe('hello world')
  })

  it('send() rejects on error envelope', async () => {
    if (platform() === 'win32') return
    server.on('connection', (socket) => {
      let buf = ''
      socket.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const env = JSON.parse(line) as IpcEnvelope
          if (env.type === 'request') {
            socket.write(JSON.stringify({ protocol: 1, type: 'error', payload: { message: 'boom' } }) + '\n')
          }
        }
      })
    })
    const transport = new IpcTransport(SOCKET)
    await expect(transport.send(makeRequest())).rejects.toThrow('boom')
  })

  it('close() resolves', async () => {
    await expect(new IpcTransport(SOCKET).close()).resolves.toBeUndefined()
  })
})
