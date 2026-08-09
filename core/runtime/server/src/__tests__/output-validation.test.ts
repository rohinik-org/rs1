import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'
import { computeSchemaHash } from '@rohinik-org/schema-registry'

const PORT = 19_950
const base = `http://127.0.0.1:${PORT}`

let host: RuntimeHost
let server: AiosServer

const BASE_CONFIG = {
  configPath: '/tmp/validation-test.yaml',
  runtimeId:  'test-output-validation',
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

async function registerSchema(schemaId: string, version: string, schema: object): Promise<string> {
  const res = await post('/v1/schemas', { schemaId, version, schema })
  const body = await res.json() as Record<string, unknown>
  return body.semanticHash as string
}

beforeAll(async () => {
  host = createProductionHost(BASE_CONFIG, '\\\\.\\pipe\\rohinik-validation-test')
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

// ── NOT_REQUESTED — no outputSchemaRef ────────────────────────────────────────

describe('Output validation — NOT_REQUESTED', () => {
  it('result carries validationResult.outcome=NOT_REQUESTED when no schema bound', async () => {
    const submitRes = await post('/v1/executions', {
      content:     'hello',
      contentType: 'text/plain',
    })
    expect(submitRes.status).toBe(202)
    const { executionId } = await submitRes.json() as Record<string, unknown>
    const status = await pollUntilTerminal(executionId as string)
    // Should complete (not fail — no schema to violate)
    expect(status.state).toBe('COMPLETED')

    const resultRes = await get(`/v1/executions/${executionId}/result`)
    expect(resultRes.status).toBe(200)
    const result = await resultRes.json() as Record<string, unknown>
    expect(result.validationResult).toBeDefined()
    const vr = result.validationResult as Record<string, unknown>
    expect(vr.outcome).toBe('NOT_REQUESTED')
    expect(vr.errorCount).toBe(0)
  })
})

// ── VALID — output conforms to bound schema ────────────────────────────────────

describe('Output validation — VALID', () => {
  let semanticHash: string

  beforeAll(async () => {
    // Mock provider async output is null (no step produces a return value in the async pipeline).
    // Bind { type: 'null' } — validates null as VALID.
    semanticHash = await registerSchema('null-out', '1', { type: 'null' })
  })

  it('state is COMPLETED and validationResult.outcome=VALID', async () => {
    const submitRes = await post('/v1/executions', {
      content:         'ping',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'null-out', version: '1', semanticHash },
    })
    expect(submitRes.status).toBe(202)
    const { executionId } = await submitRes.json() as Record<string, unknown>
    const status = await pollUntilTerminal(executionId as string)
    expect(status.state).toBe('COMPLETED')

    const resultRes = await get(`/v1/executions/${executionId}/result`)
    expect(resultRes.status).toBe(200)
    const result = await resultRes.json() as Record<string, unknown>
    expect(result.validationResult).toBeDefined()
    const vr = result.validationResult as Record<string, unknown>
    expect(vr.outcome).toBe('VALID')
    expect(vr.errorCount).toBe(0)
    // schemaRef present and matches
    expect((vr.schemaRef as Record<string, unknown>)?.schemaId).toBe('null-out')
    expect((vr.schemaRef as Record<string, unknown>)?.semanticHash).toBe(semanticHash)
  })

  it('output is accessible on VALID result', async () => {
    const submitRes = await post('/v1/executions', {
      content:         'accessible',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'null-out', version: '1', semanticHash },
    })
    const { executionId } = await submitRes.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const resultRes = await get(`/v1/executions/${executionId}/result`)
    const result = await resultRes.json() as Record<string, unknown>
    // output field is null (async pipeline output is null) but present — VALID schema accepts null
    expect(result.output).toBeNull()
    const vr = result.validationResult as Record<string, unknown>
    expect(vr.outcome).toBe('VALID')
  })
})

// ── INVALID — output does not conform ────────────────────────────────────────

describe('Output validation — INVALID', () => {
  let semanticHash: string

  beforeAll(async () => {
    // Mock provider returns a string. Bind a number schema → always INVALID.
    semanticHash = await registerSchema('number-out', '1', { type: 'number' })
  })

  it('state is FAILED when output is INVALID', async () => {
    const submitRes = await post('/v1/executions', {
      content:         'must-fail-validation',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'number-out', version: '1', semanticHash },
    })
    expect(submitRes.status).toBe(202)
    const { executionId } = await submitRes.json() as Record<string, unknown>
    const status = await pollUntilTerminal(executionId as string)
    expect(status.state).toBe('FAILED')
  })

  it('result endpoint still accessible (409 would mean not terminal — FAILED IS terminal)', async () => {
    const submitRes = await post('/v1/executions', {
      content:         'invalid-schema-test',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'number-out', version: '1', semanticHash },
    })
    const { executionId } = await submitRes.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const resultRes = await get(`/v1/executions/${executionId}/result`)
    expect(resultRes.status).toBe(200)
    const result = await resultRes.json() as Record<string, unknown>
    expect(result.validationResult).toBeDefined()
    const vr = result.validationResult as Record<string, unknown>
    expect(vr.outcome).toBe('INVALID')
    expect(Number(vr.errorCount)).toBeGreaterThan(0)
    expect(typeof vr.firstError).toBe('string')
  })

  it('output field is null on INVALID result (blocked)', async () => {
    const submitRes = await post('/v1/executions', {
      content:         'blocked-output',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'number-out', version: '1', semanticHash },
    })
    const { executionId } = await submitRes.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const resultRes = await get(`/v1/executions/${executionId}/result`)
    const result = await resultRes.json() as Record<string, unknown>
    expect(result.output).toBeNull()
  })

  it('validation evidence appended to execution', async () => {
    const submitRes = await post('/v1/executions', {
      content:         'evidence-test',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'number-out', version: '1', semanticHash },
    })
    const { executionId } = await submitRes.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const evRes = await get(`/v1/executions/${executionId}/evidence`)
    const evBody = await evRes.json() as Record<string, unknown>
    const entries = evBody.entries as Array<Record<string, unknown>>
    const validationEntry = entries.find(e => (e.kind as string).startsWith('validation:'))
    expect(validationEntry).toBeDefined()
    expect(validationEntry!.kind).toBe('validation:INVALID')
  })

  it('VALID result also gets validation evidence entry', async () => {
    const hash = await registerSchema('null-ev', '1', { type: 'null' })
    const submitRes = await post('/v1/executions', {
      content:         'valid-evidence',
      contentType:     'text/plain',
      outputSchemaRef: { schemaId: 'null-ev', version: '1', semanticHash: hash },
    })
    const { executionId } = await submitRes.json() as Record<string, unknown>
    await pollUntilTerminal(executionId as string)
    const evRes = await get(`/v1/executions/${executionId}/evidence`)
    const evBody = await evRes.json() as Record<string, unknown>
    const entries = evBody.entries as Array<Record<string, unknown>>
    const validationEntry = entries.find(e => (e.kind as string).startsWith('validation:'))
    expect(validationEntry).toBeDefined()
    expect(validationEntry!.kind).toBe('validation:VALID')
  })
})

// ── Backward compatibility ─────────────────────────────────────────────────────

describe('Output validation — backward compatibility', () => {
  it('16A/16B consumer: execution without schema still COMPLETES and result is accessible', async () => {
    const submitRes = await post('/v1/executions', {
      content:     'compat-test',
      contentType: 'text/plain',
    })
    const { executionId } = await submitRes.json() as Record<string, unknown>
    const status = await pollUntilTerminal(executionId as string)
    expect(status.state).toBe('COMPLETED')
    const resultRes = await get(`/v1/executions/${executionId}/result`)
    expect(resultRes.status).toBe(200)
    const result = await resultRes.json() as Record<string, unknown>
    // NOT_REQUESTED validation outcome, result still accessible
    expect(result.validationResult).toBeDefined()
    expect((result.validationResult as Record<string, unknown>).outcome).toBe('NOT_REQUESTED')
  })
})
