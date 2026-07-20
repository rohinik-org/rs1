import { describe, it, expect, vi } from 'vitest'
import { HttpTransport } from '../transport/http-transport.js'
import type { HttpTransportClient } from '../transport/http-transport.js'
import { randomUUID } from 'node:crypto'

function makeRequest() {
  const sessionId = randomUUID()
  return {
    id: randomUUID(), sessionId, workspaceId: randomUUID(),
    input: 'hello', type: 'conversation' as const,
    context: {
      sessionId, workspaceId: randomUUID(), adapterId: 'test',
      transport: 'HTTP' as const, interactive: false, cwd: '/tmp',
      locale: 'en-US', identity: { runtimeId: 'test', version: '0.0.0' },
      requestNumber: 1, timestamp: new Date(),
    },
  }
}

describe('HttpTransport', () => {
  it('type is HTTP', () => {
    const client: HttpTransportClient = { execute: vi.fn() }
    expect(new HttpTransport(client).type).toBe('HTTP')
  })

  it('send() delegates to client.execute and maps response', async () => {
    const executionId = randomUUID()
    const client: HttpTransportClient = {
      execute: vi.fn().mockResolvedValue({
        executionId, output: 'result', events: [], metadata: {}, durationMs: 42,
      }),
    }
    const transport = new HttpTransport(client)
    const result = await transport.send(makeRequest())
    expect(result.executionId).toBe(executionId)
    expect(result.output).toBe('result')
    expect(result.durationMs).toBe(42)
  })

  it('close() resolves', async () => {
    const client: HttpTransportClient = { execute: vi.fn() }
    await expect(new HttpTransport(client).close()).resolves.toBeUndefined()
  })
})
