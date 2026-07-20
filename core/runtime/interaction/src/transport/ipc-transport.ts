import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'
import type { Transport, RuntimeInteractionRequest, RuntimeInteractionResponse, IpcEnvelope } from '../types.js'

function parseLines(buf: string, chunk: Buffer): { lines: string[]; remainder: string } {
  const all = buf + chunk.toString()
  const parts = all.split('\n')
  return { lines: parts.slice(0, -1), remainder: parts[parts.length - 1] ?? '' }
}

export class IpcTransport implements Transport {
  readonly type = 'IPC' as const

  constructor(private readonly socketPath: string) {}

  send(request: RuntimeInteractionRequest): Promise<RuntimeInteractionResponse> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath)
      let buf = ''

      socket.on('data', (chunk) => {
        const { lines, remainder } = parseLines(buf, chunk)
        buf = remainder
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const envelope = JSON.parse(line) as IpcEnvelope
            if (envelope.type === 'response') {
              socket.destroy()
              resolve(envelope.payload as RuntimeInteractionResponse)
            } else if (envelope.type === 'error') {
              socket.destroy()
              const err = envelope.payload as { message: string }
              reject(new Error(err.message ?? 'IPC error'))
            }
          } catch {
            socket.destroy()
            reject(new Error('Invalid IPC response'))
          }
        }
      })

      socket.once('connect', () => {
        const envelope: IpcEnvelope = { protocol: 1, type: 'request', payload: request }
        socket.write(JSON.stringify(envelope) + '\n')
      })

      socket.once('error', (err) => {
        socket.destroy()
        reject(err)
      })
    })
  }

  ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection(this.socketPath)
      const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 500)
      let buf = ''

      socket.on('data', (chunk) => {
        const { lines, remainder } = parseLines(buf, chunk)
        buf = remainder
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const envelope = JSON.parse(line) as IpcEnvelope
            if (envelope.type === 'pong') {
              clearTimeout(timer)
              socket.destroy()
              resolve(true)
            }
          } catch {
            clearTimeout(timer)
            socket.destroy()
            resolve(false)
          }
        }
      })

      socket.once('connect', () => {
        const envelope: IpcEnvelope = { protocol: 1, type: 'ping', payload: {} }
        socket.write(JSON.stringify(envelope) + '\n')
      })

      socket.once('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
    })
  }

  // ponytail: IpcTransport is stateless per-request (new socket each send/ping); nothing to close
  close(): Promise<void> {
    return Promise.resolve()
  }
}

export function makeTestResponse(overrides: Partial<RuntimeInteractionResponse> = {}): RuntimeInteractionResponse {
  return {
    executionId: randomUUID(),
    output: 'test output',
    events: [],
    metadata: {},
    durationMs: 0,
    ...overrides,
  }
}

