import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'
import { computeSchemaHash } from '@rohinik-org/schema-registry'

const PORT = 19_900
const base = `http://127.0.0.1:${PORT}`

let host: RuntimeHost
let server: AiosServer

const BASE_CONFIG = {
  configPath: '/tmp/schemas-test.yaml',
  runtimeId:  'test-schemas',
  runtime: {
    routing:   { mode: 'balanced' as const, explain: true, traceBuffer: 50 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel:  'error' as const,
  },
  extensions: { paths: [] },
  providers:  {},
  server:     { port: PORT, host: '127.0.0.1' },
}

const PERSON_SCHEMA = {
  type: 'object',
  required: ['name', 'age'],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    age:  { type: 'integer', minimum: 0 },
  },
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

beforeAll(async () => {
  host = createProductionHost(BASE_CONFIG, '\\\\.\\pipe\\rohinik-schemas-test')
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

// ── POST /v1/schemas ──────────────────────────────────────────────────────────

describe('POST /v1/schemas', () => {
  it('registers schema → 201 + SchemaRecord', async () => {
    const res = await post('/v1/schemas', { schemaId: 'person', version: '1.0', schema: PERSON_SCHEMA })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.schemaId).toBe('person')
    expect(body.version).toBe('1.0')
    expect(typeof body.semanticHash).toBe('string')
    expect((body.semanticHash as string)).toHaveLength(64)
    expect(typeof body.registeredAt).toBe('string')
    expect(body.schema).toEqual(PERSON_SCHEMA)
  })

  it('stored hash matches computeSchemaHash', async () => {
    const res = await post('/v1/schemas', { schemaId: 'hashcheck', version: '1.0', schema: PERSON_SCHEMA })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.semanticHash).toBe(computeSchemaHash(PERSON_SCHEMA as Record<string, unknown>))
  })

  it('400 — missing schemaId', async () => {
    const res = await post('/v1/schemas', { version: '1.0', schema: PERSON_SCHEMA })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('400 — schema is not an object', async () => {
    const res = await post('/v1/schemas', { schemaId: 'x', version: '1', schema: 'string-schema' })
    expect(res.status).toBe(400)
  })

  it('409 — duplicate schemaId+version', async () => {
    await post('/v1/schemas', { schemaId: 'dupe', version: '1.0', schema: { type: 'string' } })
    const res = await post('/v1/schemas', { schemaId: 'dupe', version: '1.0', schema: { type: 'string' } })
    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('SCHEMA_ALREADY_EXISTS')
  })

  it('same schemaId, different version → both 201', async () => {
    const r1 = await post('/v1/schemas', { schemaId: 'versioned', version: '1.0', schema: { type: 'string' } })
    const r2 = await post('/v1/schemas', { schemaId: 'versioned', version: '2.0', schema: { type: 'integer' } })
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
  })
})

// ── GET /v1/schemas/:schemaId/:version ────────────────────────────────────────

describe('GET /v1/schemas/:schemaId/:version', () => {
  it('200 + full SchemaRecord for registered schema', async () => {
    await post('/v1/schemas', { schemaId: 'getme', version: '1', schema: { type: 'boolean' } })
    const res = await get('/v1/schemas/getme/1')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.schemaId).toBe('getme')
    expect(body.version).toBe('1')
    expect(typeof body.semanticHash).toBe('string')
  })

  it('404 for unknown schema', async () => {
    const res = await get('/v1/schemas/ghost/99')
    expect(res.status).toBe(404)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('SCHEMA_NOT_FOUND')
  })
})

// ── POST /v1/schemas/:schemaId/:version/validate ──────────────────────────────

describe('POST /v1/schemas/:schemaId/:version/validate', () => {
  beforeAll(async () => {
    await post('/v1/schemas', { schemaId: 'val-person', version: '1', schema: PERSON_SCHEMA })
  })

  it('200 VALID for conforming value', async () => {
    const res = await post('/v1/schemas/val-person/1/validate', { value: { name: 'Alice', age: 30 } })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.outcome).toBe('VALID')
    expect(body.errorCount).toBe(0)
  })

  it('200 INVALID for non-conforming value', async () => {
    const res = await post('/v1/schemas/val-person/1/validate', { value: { name: 'Bob' } })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.outcome).toBe('INVALID')
    expect(body.errorCount).toBeGreaterThan(0)
  })

  it('response carries schemaId, version, semanticHash', async () => {
    const res = await post('/v1/schemas/val-person/1/validate', { value: { name: 'C', age: 1 } })
    const body = await res.json() as Record<string, unknown>
    expect(body.schemaId).toBe('val-person')
    expect(body.version).toBe('1')
    expect(typeof body.semanticHash).toBe('string')
  })

  it('400 when value field absent', async () => {
    const res = await post('/v1/schemas/val-person/1/validate', { notValue: 42 })
    expect(res.status).toBe(400)
  })

  it('404 when schema not registered', async () => {
    const res = await post('/v1/schemas/nope/1/validate', { value: {} })
    expect(res.status).toBe(404)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('SCHEMA_NOT_FOUND')
  })
})

// ── Schema admission at POST /v1/executions ───────────────────────────────────

describe('POST /v1/executions outputSchemaRef admission', () => {
  let storedHash: string

  beforeAll(async () => {
    const res = await post('/v1/schemas', { schemaId: 'exec-out', version: '1', schema: { type: 'object' } })
    const body = await res.json() as Record<string, unknown>
    storedHash = body.semanticHash as string
  })

  it('202 when outputSchemaRef valid + hash matches', async () => {
    const res = await post('/v1/executions', {
      content:        'hello',
      contentType:    'text/plain',
      outputSchemaRef: { schemaId: 'exec-out', version: '1', semanticHash: storedHash },
    })
    expect(res.status).toBe(202)
  })

  it('400 SCHEMA_NOT_FOUND when schema not registered', async () => {
    const res = await post('/v1/executions', {
      content:        'hello',
      contentType:    'text/plain',
      outputSchemaRef: { schemaId: 'unknown-schema', version: '1', semanticHash: 'a'.repeat(64) },
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('SCHEMA_NOT_FOUND')
  })

  it('400 SCHEMA_HASH_MISMATCH when hash wrong', async () => {
    const res = await post('/v1/executions', {
      content:        'hello',
      contentType:    'text/plain',
      outputSchemaRef: { schemaId: 'exec-out', version: '1', semanticHash: 'b'.repeat(64) },
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe('SCHEMA_HASH_MISMATCH')
  })

  it('202 when no outputSchemaRef (backward compat)', async () => {
    const res = await post('/v1/executions', {
      content:     'hello',
      contentType: 'text/plain',
    })
    expect(res.status).toBe(202)
  })
})
