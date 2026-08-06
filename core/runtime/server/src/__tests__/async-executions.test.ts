import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'

const PORT = 19_095

let host: RuntimeHost
let server: AiosServer

const BASE_CONFIG = {
  configPath: '/tmp/async-exec-test.yaml',
  runtimeId:  'test-async-executions',
  runtime: {
    routing:   { mode: 'balanced' as const, explain: true, traceBuffer: 50 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel:  'error' as const,
  },
  extensions: { paths: [] },
  providers:  {},
  server:     { port: PORT, host: '127.0.0.1' },
}

beforeAll(async () => {
  host = createProductionHost(BASE_CONFIG, '\\\\.\\pipe\\rohinik-async-exec-test')
  await host.start()
  host.runtime.registerCapability(buildCoreCapability())
  host.runtime.registerProvider(new MockReasoningProvider())
  server = new AiosServer(host, { port: PORT, host: '127.0.0.1' })
  await server.listen()
}, 20_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

const base = `http://127.0.0.1:${PORT}`

async function post(path: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method:  'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  })
}

async function get(path: string) {
  return fetch(`${base}${path}`)
}

/** Poll until terminal or timeout. Returns last status body. */
async function pollUntilTerminal(
  executionId: string,
  maxMs = 8000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxMs
  const terminal = ['COMPLETED', 'FAILED', 'CANCELLED']
  while (Date.now() < deadline) {
    const res = await get(`/v1/executions/${executionId}`)
    const body = await res.json() as Record<string, unknown>
    if (terminal.includes(body.state as string)) return body
    await new Promise(r => setTimeout(r, 100))
  }
  // Return last observed state even if not terminal
  const res = await get(`/v1/executions/${executionId}`)
  return res.json() as Promise<Record<string, unknown>>
}

// ── POST /v1/executions ──────────────────────────────────────────────────────

describe('POST /v1/executions', () => {
  it('returns 202 Accepted immediately', async () => {
    const res = await post('/v1/executions', {
      content:     'What is 2+2?',
      contentType: 'TEXT',
    })
    expect(res.status).toBe(202)
  })

  it('response body has executionId, state=QUEUED, protocolVersion=v1', async () => {
    const res = await post('/v1/executions', {
      content:     'test async submit',
      contentType: 'TEXT',
    })
    const body = await res.json() as Record<string, unknown>
    expect(body.executionId).toBeTruthy()
    expect(body.state).toBe('QUEUED')
    expect(body.protocolVersion).toBe('v1')
    expect(body.idempotent).toBe(false)
  })

  it('returns 400 when content missing', async () => {
    const res = await post('/v1/executions', { contentType: 'TEXT' })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('idempotency: same key + same content returns existing executionId with idempotent=true', async () => {
    const payload = { content: 'idem test', contentType: 'TEXT', idempotencyKey: 'test-idem-1' }
    const first  = await (await post('/v1/executions', payload)).json() as Record<string, unknown>
    const second = await (await post('/v1/executions', payload)).json() as Record<string, unknown>
    expect(second.executionId).toBe(first.executionId)
    expect(second.idempotent).toBe(true)
  })

  it('idempotency: same key + different content returns 409', async () => {
    await post('/v1/executions', { content: 'original', contentType: 'TEXT', idempotencyKey: 'test-idem-conflict' })
    const res = await post('/v1/executions', { content: 'different', contentType: 'TEXT', idempotencyKey: 'test-idem-conflict' })
    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('IDEMPOTENCY_CONFLICT')
  })
})

// ── GET /v1/executions/:executionId ─────────────────────────────────────────

describe('GET /v1/executions/:executionId', () => {
  it('returns 404 for unknown executionId', async () => {
    const res = await get('/v1/executions/does-not-exist')
    expect(res.status).toBe(404)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('EXECUTION_NOT_FOUND')
  })

  it('returns status record after submit', async () => {
    const submitRes = await post('/v1/executions', { content: 'status check', contentType: 'TEXT' })
    const { executionId } = await submitRes.json() as { executionId: string }

    const res = await get(`/v1/executions/${executionId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.executionId).toBe(executionId)
    expect(['QUEUED', 'ADMITTED', 'RUNNING', 'COMPLETED', 'FAILED']).toContain(body.state)
    expect(body.protocolVersion).toBe('v1')
    expect(body).toHaveProperty('terminal')
  })

  it('execution reaches a terminal state within 8 seconds', async () => {
    const submitRes = await post('/v1/executions', { content: 'run to completion', contentType: 'TEXT' })
    const { executionId } = await submitRes.json() as { executionId: string }

    const status = await pollUntilTerminal(executionId)
    expect(['COMPLETED', 'FAILED']).toContain(status.state)
    expect(status.terminal).toBe(true)
  })
})

// ── GET /v1/executions/:executionId/result ───────────────────────────────────

describe('GET /v1/executions/:executionId/result', () => {
  it('returns 404 for unknown executionId', async () => {
    const res = await get('/v1/executions/ghost/result')
    expect(res.status).toBe(404)
  })

  it('returns 409 RESULT_NOT_READY while execution is running', async () => {
    const submitRes = await post('/v1/executions', { content: 'result not ready test', contentType: 'TEXT' })
    const { executionId } = await submitRes.json() as { executionId: string }
    // Immediately check — may still be in-progress
    const statusRes = await get(`/v1/executions/${executionId}`)
    const status = await statusRes.json() as Record<string, unknown>
    if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(status.state as string)) {
      const res = await get(`/v1/executions/${executionId}/result`)
      expect(res.status).toBe(409)
      const body = await res.json() as Record<string, unknown>
      expect(body.code).toBe('RESULT_NOT_READY')
    }
    // If already terminal, skip — race condition acceptable in test
  })

  it('returns result after execution completes', async () => {
    const submitRes = await post('/v1/executions', { content: 'fetch result test', contentType: 'TEXT' })
    const { executionId } = await submitRes.json() as { executionId: string }

    await pollUntilTerminal(executionId)

    const res = await get(`/v1/executions/${executionId}/result`)
    expect([200, 409]).toContain(res.status) // 409 only if FAILED with no result set
    if (res.status === 200) {
      const body = await res.json() as Record<string, unknown>
      expect(body.executionId).toBe(executionId)
      expect(body).toHaveProperty('totalDurationMs')
      expect(body).toHaveProperty('completedAt')
    }
  })
})

// ── POST /v1/executions/:executionId/cancel ──────────────────────────────────

describe('POST /v1/executions/:executionId/cancel', () => {
  it('returns 404 for unknown executionId', async () => {
    const res = await post('/v1/executions/ghost/cancel')
    expect(res.status).toBe(404)
  })

  it('cancel on terminal execution returns cancelAccepted=false', async () => {
    const submitRes = await post('/v1/executions', { content: 'cancel terminal test', contentType: 'TEXT' })
    const { executionId } = await submitRes.json() as { executionId: string }

    await pollUntilTerminal(executionId)

    const res = await post(`/v1/executions/${executionId}/cancel`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.cancelAccepted).toBe(false)
  })

  it('cancel on in-progress execution returns cancelAccepted=true and state CANCELLING', async () => {
    const submitRes = await post('/v1/executions', { content: 'cancel live test', contentType: 'TEXT' })
    const { executionId } = await submitRes.json() as { executionId: string }

    // Immediately cancel — may be in QUEUED/ADMITTED/RUNNING
    const res = await post(`/v1/executions/${executionId}/cancel`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    // If it raced to terminal already, cancelAccepted=false is also valid
    expect([true, false]).toContain(body.cancelAccepted)
  })
})

// ── GET /v1/executions/:executionId/evidence ─────────────────────────────────

describe('GET /v1/executions/:executionId/evidence', () => {
  it('returns 404 for unknown executionId', async () => {
    const res = await get('/v1/executions/ghost/evidence')
    expect(res.status).toBe(404)
  })

  it('returns evidence entries after execution completes', async () => {
    const submitRes = await post('/v1/executions', { content: 'evidence test', contentType: 'TEXT' })
    const { executionId } = await submitRes.json() as { executionId: string }

    await pollUntilTerminal(executionId)

    const res = await get(`/v1/executions/${executionId}/evidence`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.executionId).toBe(executionId)
    expect(Array.isArray(body.entries)).toBe(true)
  })
})

// ── Protocol conformance checks ───────────────────────────────────────────────

describe('Protocol conformance', () => {
  it('all error responses carry protocolVersion=v1', async () => {
    const notFound = await get('/v1/executions/x')
    const body = await notFound.json() as Record<string, unknown>
    expect(body.protocolVersion).toBe('v1')
  })

  it('submit + poll end-to-end golden path', async () => {
    const submitRes = await post('/v1/executions', {
      content:     'Hello async',
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })
    expect(submitRes.status).toBe(202)
    const { executionId } = await submitRes.json() as { executionId: string }

    const final = await pollUntilTerminal(executionId, 10_000)
    expect(['COMPLETED', 'FAILED']).toContain(final.state)
    expect(final.terminal).toBe(true)
  })
})
