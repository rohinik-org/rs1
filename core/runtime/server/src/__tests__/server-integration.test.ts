import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'

const PORT = 19_080

let host: RuntimeHost
let server: AiosServer

beforeAll(async () => {
  host = createProductionHost({
    configPath: '/tmp/test.yaml',
    runtimeId: 'test-server-001',
    runtime: {
      routing: { mode: 'balanced', explain: true, traceBuffer: 100 },
      resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
      logLevel: 'error',
    },
    extensions: { paths: [] },
    providers: {},
    server: { port: PORT, host: '127.0.0.1' },
  })
  await host.start()
  host.runtime.registerCapability(buildCoreCapability())
  server = new AiosServer(host, { port: PORT, host: '127.0.0.1' })
  await server.listen()
}, 15_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

const base = `http://127.0.0.1:${PORT}`

describe('GET /v1/runtime', () => {
  it('returns runtime identity', async () => {
    const res = await fetch(`${base}/v1/runtime`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.runtimeId).toBe('test-server-001')
    expect(body.state).toBe('READY')
    expect(body.requestId).toBeDefined()
    expect((body.features as Record<string, unknown>).simulation).toBe(true)
    expect((body.features as Record<string, unknown>).decisionReplay).toBe(true)
  })
})

describe('GET /v1/health', () => {
  it('returns hierarchical health', async () => {
    const res = await fetch(`${base}/v1/health`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(['HEALTHY', 'DEGRADED']).toContain(body.status)
    expect(body.requestId).toBeDefined()
    expect(Array.isArray(body.checks)).toBe(true)
    expect((body.checks as unknown[]).length).toBeGreaterThan(0)
  })
})

describe('POST /v1/execute', () => {
  it('routes CSV to csv.parse skill', async () => {
    const res = await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'name,age\nAlice,30\nBob,25',
        contentType: 'CSV',
        intentHint: 'csv parse',
        constraints: { allowReasoning: false },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.skillId).toBe('csv.parse')
    expect(body.tierId).toBe('DETERMINISTIC')
    expect(body.reasoningInvoked).toBe(false)
    expect(body.requestId).toBeDefined()
    expect(Array.isArray(body.output)).toBe(true)
  })

  it('returns 400 for missing content', async () => {
    const res = await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'TEXT' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /v1/simulate', () => {
  it('plans routing without executing', async () => {
    const res = await fetch(`${base}/v1/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'name,age\nAlice,30',
        contentType: 'CSV',
        intentHint: 'csv parse',
        constraints: { allowReasoning: false },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.wouldRoute).toBe(true)
    expect(body.selectedSkill).toBe('csv.parse')
    expect(body.selectedTier).toBe('DETERMINISTIC')
    expect(body.requestId).toBeDefined()
  })
})

describe('GET /v1/decisions/:requestId', () => {
  it('returns trace for a prior execute call', async () => {
    const execRes = await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'decisions-test-001',
        content: 'name,age\nAlice,30',
        contentType: 'CSV',
        intentHint: 'csv parse',
        constraints: { allowReasoning: false },
      }),
    })
    expect(execRes.status).toBe(200)
    const decRes = await fetch(`${base}/v1/decisions/decisions-test-001`)
    expect(decRes.status).toBe(200)
    const body = await decRes.json() as Record<string, unknown>
    expect(body.requestId).toBeDefined()
    expect(body.trace).toBeDefined()
  })

  it('returns 404 for unknown requestId', async () => {
    const res = await fetch(`${base}/v1/decisions/does-not-exist`)
    expect(res.status).toBe(404)
  })
})

describe('GET /v1/capabilities', () => {
  it('returns list of capabilities', async () => {
    const res = await fetch(`${base}/v1/capabilities`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(Array.isArray(body.capabilities)).toBe(true)
    expect((body.capabilities as unknown[]).length).toBeGreaterThan(0)
  })

  it('returns non-empty list when capability-core is loaded', async () => {
    const res = await fetch(`${base}/v1/capabilities`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const caps = body.capabilities as Array<{ skillId: string }>
    expect(caps.length).toBeGreaterThan(0)
    expect(caps.some(c => c.skillId === 'csv.parse')).toBe(true)
  })
})

describe('POST /v1/memory/store', () => {
  it('returns 503 MEMORY_UNAVAILABLE when no provider installed', async () => {
    const res = await fetch(`${base}/v1/memory/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'test', value: 'hello' }),
    })
    expect(res.status).toBe(503)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('MEMORY_UNAVAILABLE')
  })
})
