/**
 * Stage 16C — Schema Conformance Suite
 *
 * Proves all four 16C pillars end-to-end against a real RS1 server:
 *
 *   Pillar 1 — Schema Registry
 *     A. POST /v1/schemas registers schema, returns semanticHash
 *     B. GET /v1/schemas/:id/:version retrieves stored record
 *     C. Duplicate registration returns 409
 *     D. Unknown schemaId returns 404
 *     E. Hash computed canonically (key-order invariant)
 *
 *   Pillar 2 — Execution Admission
 *     F. Missing schemaId → 400 SCHEMA_NOT_FOUND
 *     G. Hash mismatch → 400 SCHEMA_HASH_MISMATCH
 *     H. Valid ref admitted → 202
 *
 *   Pillar 3 — Server-Side Output Validation
 *     I. Schema-less execution → validationResult.outcome = NOT_REQUESTED
 *     J. Null output + { type:'null' } schema → VALID, COMPLETED
 *     K. Null output + { type:'number' } schema → INVALID, FAILED, output null
 *     L. INVALID evidence entry present in evidence trail
 *
 *   Pillar 4 — Normalization + Fallback Guard
 *     M. No SCHEMA_FALLBACK_PERMITTED_DEGRADATION evidence on FAILED execution
 *     N. No schema-fallback evidence when schema not bound
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'

const PORT = 19_970
const base = `http://127.0.0.1:${PORT}`

let host: RuntimeHost
let server: AiosServer

const BASE_CONFIG = {
  configPath: '/tmp/schema-conformance-test.yaml',
  runtimeId:  'test-schema-conformance',
  runtime: {
    routing:   { mode: 'balanced' as const, explain: true, traceBuffer: 50 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel:  'error' as const,
  },
  extensions: { paths: [] },
  providers:  {},
  server:     { port: PORT, host: '127.0.0.1' },
}

async function post(path: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method:  'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function get(path: string) {
  return fetch(`${base}${path}`)
}

async function pollUntilTerminal(executionId: string, maxMs = 10_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxMs
  const terminal = ['COMPLETED', 'FAILED', 'CANCELLED']
  while (Date.now() < deadline) {
    const res = await get(`/v1/executions/${executionId}`)
    const body = await res.json() as Record<string, unknown>
    if (terminal.includes(body.state as string)) return body
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`Execution ${executionId} did not reach terminal within ${maxMs}ms`)
}

async function registerSchema(schemaId: string, version: string, schema: object): Promise<{ res: Response; hash: string }> {
  const res = await post('/v1/schemas', { schemaId, version, schema })
  const body = await res.json() as Record<string, unknown>
  return { res, hash: body.semanticHash as string }
}

beforeAll(async () => {
  host = createProductionHost(BASE_CONFIG, '\\\\.\\pipe\\rohinik-schema-conformance-test')
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

// ── Pillar 1 — Schema Registry ────────────────────────────────────────────────

describe('Pillar 1 — Schema Registry', () => {
  it('A: POST /v1/schemas returns 201 with semanticHash', async () => {
    const { res, hash } = await registerSchema('conf-p1a', '1', { type: 'string' })
    expect(res.status).toBe(201)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('B: GET /v1/schemas/:id/:version retrieves stored record', async () => {
    await registerSchema('conf-p1b', '1', { type: 'boolean' })
    const res = await get('/v1/schemas/conf-p1b/1')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.schemaId).toBe('conf-p1b')
    expect(body.version).toBe('1')
    expect(body.semanticHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('C: duplicate registration returns 409', async () => {
    await registerSchema('conf-p1c', '1', { type: 'array' })
    const second = await post('/v1/schemas', { schemaId: 'conf-p1c', version: '1', schema: { type: 'array' } })
    expect(second.status).toBe(409)
  })

  it('D: GET unknown schemaId returns 404', async () => {
    const res = await get('/v1/schemas/does-not-exist/1')
    expect(res.status).toBe(404)
  })

  it('E: semanticHash is key-order invariant (canonical JSON)', async () => {
    const schemaA = { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }
    const schemaB = { properties: { id: { type: 'string' } }, required: ['id'], type: 'object' }
    const { hash: hashA } = await registerSchema('conf-p1e-a', '1', schemaA)
    const resB = await post('/v1/schemas', { schemaId: 'conf-p1e-b', version: '1', schema: schemaB })
    const bodyB = await resB.json() as Record<string, unknown>
    expect(hashA).toBe(bodyB.semanticHash as string)
  })
})

// ── Pillar 2 — Execution Admission ───────────────────────────────────────────

describe('Pillar 2 — Execution Admission', () => {
  it('F: unregistered schemaId → 400 SCHEMA_NOT_FOUND', async () => {
    const res = await post('/v1/executions', {
      content:         'admission-test',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'no-such-schema', version: '1', semanticHash: 'a'.repeat(64) },
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('SCHEMA_NOT_FOUND')
  })

  it('G: registered schema but wrong hash → 400 SCHEMA_HASH_MISMATCH', async () => {
    const { hash } = await registerSchema('conf-p2g', '1', { type: 'string' })
    const wrongHash = hash.replace(/^.{2}/, 'ff')
    const res = await post('/v1/executions', {
      content:         'admission-hash-test',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'conf-p2g', version: '1', semanticHash: wrongHash },
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('SCHEMA_HASH_MISMATCH')
  })

  it('H: valid ref admitted → 202', async () => {
    const { hash } = await registerSchema('conf-p2h', '1', { type: 'null' })
    const res = await post('/v1/executions', {
      content:         'admission-valid',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'conf-p2h', version: '1', semanticHash: hash },
    })
    expect(res.status).toBe(202)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body.executionId).toBe('string')
  })
})

// ── Pillar 3 — Server-Side Output Validation ──────────────────────────────────

describe('Pillar 3 — Server-Side Output Validation', () => {
  it('I: no outputSchemaRef → validationResult.outcome = NOT_REQUESTED', async () => {
    const res = await post('/v1/executions', { content: 'no-schema', contentType: 'text/plain' })
    const { executionId } = await res.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const resultRes = await get(`/v1/executions/${executionId}/result`)
    const result = await resultRes.json() as Record<string, unknown>
    const vr = result.validationResult as Record<string, unknown>
    expect(vr.outcome).toBe('NOT_REQUESTED')
  })

  it('J: null output + { type:"null" } → VALID, state COMPLETED', async () => {
    const { hash } = await registerSchema('conf-p3j', '1', { type: 'null' })
    const res = await post('/v1/executions', {
      content:         'valid-null',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'conf-p3j', version: '1', semanticHash: hash },
    })
    const { executionId } = await res.json() as Record<string, unknown>
    const status = await pollUntilTerminal(executionId as string)
    expect(status.state).toBe('COMPLETED')
    const resultRes = await get(`/v1/executions/${executionId}/result`)
    const result = await resultRes.json() as Record<string, unknown>
    const vr = result.validationResult as Record<string, unknown>
    expect(vr.outcome).toBe('VALID')
    expect(vr.errorCount).toBe(0)
  })

  it('K: null output + { type:"number" } → INVALID, state FAILED, output null', async () => {
    const { hash } = await registerSchema('conf-p3k', '1', { type: 'number' })
    const res = await post('/v1/executions', {
      content:         'invalid-type',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'conf-p3k', version: '1', semanticHash: hash },
    })
    const { executionId } = await res.json() as Record<string, unknown>
    const status = await pollUntilTerminal(executionId as string)
    expect(status.state).toBe('FAILED')
    const resultRes = await get(`/v1/executions/${executionId}/result`)
    const result = await resultRes.json() as Record<string, unknown>
    const vr = result.validationResult as Record<string, unknown>
    expect(vr.outcome).toBe('INVALID')
    expect(result.output).toBeNull()
  })

  it('L: INVALID evidence entry present in evidence trail', async () => {
    const { hash } = await registerSchema('conf-p3l', '1', { type: 'number' })
    const res = await post('/v1/executions', {
      content:         'evidence-check',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'conf-p3l', version: '1', semanticHash: hash },
    })
    const { executionId } = await res.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const evRes = await get(`/v1/executions/${executionId}/evidence`)
    const evBody = await evRes.json() as Record<string, unknown>
    const entries = evBody.entries as Array<Record<string, unknown>>
    const validationEntry = entries.find(e =>
      typeof e.kind === 'string' && e.kind === 'validation:INVALID'
    )
    expect(validationEntry).toBeDefined()
    const detail = validationEntry!.detail as Record<string, unknown>
    expect(detail.errorCount).toBeGreaterThan(0)
  })
})

// ── Pillar 4 — Normalization + Fallback Guard ─────────────────────────────────

describe('Pillar 4 — Normalization + Fallback Guard', () => {
  it('M: FAILED execution with schema has no SCHEMA_FALLBACK_PERMITTED_DEGRADATION evidence', async () => {
    const { hash } = await registerSchema('conf-p4m', '1', { type: 'number' })
    const res = await post('/v1/executions', {
      content:         'fallback-guard',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'conf-p4m', version: '1', semanticHash: hash },
    })
    const { executionId } = await res.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const evRes = await get(`/v1/executions/${executionId}/evidence`)
    const evBody = await evRes.json() as Record<string, unknown>
    const entries = evBody.entries as Array<Record<string, unknown>>
    const degradation = entries.find(e =>
      typeof e.detail === 'object' &&
      e.detail !== null &&
      (e.detail as Record<string, unknown>).code === 'SCHEMA_FALLBACK_PERMITTED_DEGRADATION'
    )
    expect(degradation).toBeUndefined()
  })

  it('N: no schema bound → no schema-fallback evidence', async () => {
    const res = await post('/v1/executions', { content: 'no-schema-fallback', contentType: 'text/plain' })
    const { executionId } = await res.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const evRes = await get(`/v1/executions/${executionId}/evidence`)
    const evBody = await evRes.json() as Record<string, unknown>
    const entries = evBody.entries as Array<Record<string, unknown>>
    const schemaFallback = entries.find(e =>
      typeof e.detail === 'object' &&
      e.detail !== null &&
      String((e.detail as Record<string, unknown>).code ?? '').startsWith('SCHEMA_FALLBACK')
    )
    expect(schemaFallback).toBeUndefined()
  })
})
