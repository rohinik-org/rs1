import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RohinikHttpClient, RohinikClientError } from '../client.js'
import { defineJsonSchema } from '@rohinik-org/schema'
import type { TypedResult } from '../typed-executions.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

const personSchema = defineJsonSchema('person', '1', {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
} as const)

type Person = { name: string }

beforeEach(() => { mockFetch.mockReset() })

describe('client.executions.startTyped — happy path', () => {
  it('registers schema, submits execution, polls, returns typed result', async () => {
    // 1. POST /v1/schemas → 201
    // 2. POST /v1/executions → 202
    // 3. GET /v1/executions/:id (COMPLETED)
    // 4. GET /v1/executions/:id/result
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse({ schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash }, 201))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-1', idempotencyKey: null }, 202))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-1', state: 'COMPLETED' }))
      .mockResolvedValueOnce(makeJsonResponse({
        executionId: 'exec-1',
        output: { name: 'Alice' },
        validationResult: {
          outcome: 'VALID',
          errorCount: 0,
          schemaRef: { schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash },
        },
      }))

    const client = new RohinikHttpClient('http://localhost:8080')
    const execution = await client.executions.startTyped<Person>(personSchema, {
      content: 'get-person',
      contentType: 'text/plain',
    })
    const result: TypedResult<Person> = await execution.waitForTypedResult()

    expect(result.output).toEqual({ name: 'Alice' })
    expect(result.validation.outcome).toBe('VALID')
    expect(result.executionId).toBe('exec-1')
  })

  it('registers schema, 409 on duplicate registration is ok (idempotent)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse({ code: 'SCHEMA_ALREADY_EXISTS', message: 'exists' }, 409))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-2', idempotencyKey: null }, 202))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-2', state: 'COMPLETED' }))
      .mockResolvedValueOnce(makeJsonResponse({
        executionId: 'exec-2',
        output: { name: 'Bob' },
        validationResult: {
          outcome: 'VALID',
          errorCount: 0,
          schemaRef: { schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash },
        },
      }))

    const client = new RohinikHttpClient('http://localhost:8080')
    const execution = await client.executions.startTyped<Person>(personSchema, { content: 'x', contentType: 'text/plain' })
    const result = await execution.waitForTypedResult()
    expect(result.output).toEqual({ name: 'Bob' })
  })
})

describe('client.executions.startTyped — error paths', () => {
  it('throws RohinikClientError if execution FAILED', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse({ schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash }, 201))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-3', idempotencyKey: null }, 202))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-3', state: 'FAILED' }))
      .mockResolvedValueOnce(makeJsonResponse({
        executionId: 'exec-3',
        output: null,
        validationResult: { outcome: 'INVALID', errorCount: 1, firstError: 'type mismatch', schemaRef: { schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash } },
      }))

    const client = new RohinikHttpClient('http://localhost:8080')
    const execution = await client.executions.startTyped<Person>(personSchema, { content: 'x', contentType: 'text/plain' })
    await expect(execution.waitForTypedResult()).rejects.toBeInstanceOf(RohinikClientError)
  })

  it('throws SchemaHashMismatchError if returned hash does not match schema', async () => {
    const wrongHash = 'a'.repeat(64)
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse({ schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash }, 201))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-4', idempotencyKey: null }, 202))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-4', state: 'COMPLETED' }))
      .mockResolvedValueOnce(makeJsonResponse({
        executionId: 'exec-4',
        output: { name: 'Mallory' },
        validationResult: {
          outcome: 'VALID',
          errorCount: 0,
          schemaRef: { schemaId: 'person', version: '1', semanticHash: wrongHash },
        },
      }))

    const client = new RohinikHttpClient('http://localhost:8080')
    const execution = await client.executions.startTyped<Person>(personSchema, { content: 'x', contentType: 'text/plain' })
    await expect(execution.waitForTypedResult()).rejects.toThrow('hash mismatch')
  })

  it('submits correct outputSchemaRef in POST /v1/executions', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse({ schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash }, 201))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-5', idempotencyKey: null }, 202))
      .mockResolvedValueOnce(makeJsonResponse({ executionId: 'exec-5', state: 'COMPLETED' }))
      .mockResolvedValueOnce(makeJsonResponse({
        executionId: 'exec-5',
        output: { name: 'Carol' },
        validationResult: {
          outcome: 'VALID',
          errorCount: 0,
          schemaRef: { schemaId: 'person', version: '1', semanticHash: personSchema.semanticHash },
        },
      }))

    const client = new RohinikHttpClient('http://localhost:8080')
    await (await client.executions.startTyped<Person>(personSchema, { content: 'x', contentType: 'text/plain' })).waitForTypedResult()

    // Second call is POST /v1/executions
    const submitCall = mockFetch.mock.calls[1]!
    const body = JSON.parse(submitCall[1].body as string)
    expect(body.outputSchemaRef).toEqual({
      schemaId: 'person',
      version: '1',
      semanticHash: personSchema.semanticHash,
    })
  })
})
