/**
 * Stage 16D Tasks 5+6 — @rohinik-org/agent SDK handles
 *
 * Unit tests with mocked fetch. Verifies:
 *   - AgentHandle metadata() calls GET /v1/agent-instances/:id
 *   - admit() calls POST /v1/agent-instances/admit, returns AgentRunHandle
 *   - AgentRunHandle: status, cancel, delegate, evidence
 *   - DelegationHandle: accept, run, submitResult, acceptResult, rejectResult, cancel, evidence
 *   - DelegationHandle.run() returns ExecutionHandle with executionId
 *   - DelegationHandle.runAndWaitTyped() registers schema, passes outputSchemaRef, verifies hash
 *   - No auto-acceptance anywhere
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  admit,
  AgentHandle,
  AgentRunHandle,
  DelegationHandle,
} from '../index.js'
import { defineJsonSchema } from '@rohinik-org/schema'

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const queue = [...responses]
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = queue.shift()
    if (!next) throw new Error('Unexpected fetch call — queue exhausted')
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    } as Response
  })
}

const BASE = 'http://localhost:19980'

beforeEach(() => {
  vi.stubGlobal('fetch', undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// ── admit() ───────────────────────────────────────────────────────────────────

describe('admit()', () => {
  it('calls POST /v1/agent-instances/admit and returns AgentRunHandle', async () => {
    const f = mockFetch([{ status: 200, body: { runId: 'run-1' } }])
    vi.stubGlobal('fetch', f)

    const { run } = await admit(BASE, 'inst-1')

    expect(f).toHaveBeenCalledOnce()
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/agent-instances/admit`)
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ instanceId: 'inst-1' })

    expect(run).toBeInstanceOf(AgentRunHandle)
    expect(run.runId).toBe('run-1')
  })

  it('throws on non-200 response', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 409, body: { error: 'admission-denied' } }]))
    await expect(admit(BASE, 'inst-bad')).rejects.toThrow()
  })
})

// ── AgentHandle ───────────────────────────────────────────────────────────────

describe('AgentHandle.metadata()', () => {
  it('calls GET /v1/agent-instances/:instanceId', async () => {
    const body = { instanceId: 'inst-1', definitionId: 'd1', versionId: 'v1', createdAt: '2026-01-01T00:00:00.000Z' }
    const f = mockFetch([{ status: 200, body }])
    vi.stubGlobal('fetch', f)

    const handle = new AgentHandle(BASE, 'inst-1')
    const result = await handle.metadata()

    expect(f).toHaveBeenCalledOnce()
    const [url] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/agent-instances/inst-1`)
    expect(result.instanceId).toBe('inst-1')
  })
})

// ── AgentRunHandle ────────────────────────────────────────────────────────────

describe('AgentRunHandle.status()', () => {
  it('calls GET /v1/agent-runs/:runId', async () => {
    const body = { runId: 'run-1', instanceId: 'i', definitionId: 'd', versionId: 'v', state: 'RUNNING', startedAt: '' }
    const f = mockFetch([{ status: 200, body }])
    vi.stubGlobal('fetch', f)

    const run = new AgentRunHandle(BASE, 'run-1')
    const result = await run.status()

    expect(result.state).toBe('RUNNING')
    const [url] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/agent-runs/run-1`)
  })
})

describe('AgentRunHandle.cancel()', () => {
  it('calls POST /v1/agent-runs/:runId/cancel with optional reason', async () => {
    const f = mockFetch([{ status: 200, body: { ok: true, state: 'CANCELLED' } }])
    vi.stubGlobal('fetch', f)

    const run = new AgentRunHandle(BASE, 'run-1')
    const result = await run.cancel('timeout')

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/agent-runs/run-1/cancel`)
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: 'timeout' })
    expect(result.ok).toBe(true)
    expect(result.state).toBe('CANCELLED')
  })

  it('cancel without reason sends empty body', async () => {
    const f = mockFetch([{ status: 200, body: { ok: true, state: 'CANCELLED' } }])
    vi.stubGlobal('fetch', f)

    const run = new AgentRunHandle(BASE, 'run-1')
    await run.cancel()

    const [, init] = f.mock.calls[0]!
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({})
  })
})

describe('AgentRunHandle.delegate()', () => {
  it('calls POST /v1/agent-runs/:runId/delegations and returns DelegationHandle', async () => {
    const body = {
      certificateId: 'cert-1', fingerprint: 'fp', delegatedTaskId: 'dtask-1', delegationId: 'del-1',
    }
    const f = mockFetch([{ status: 201, body }])
    vi.stubGlobal('fetch', f)

    const run = new AgentRunHandle(BASE, 'run-1')
    const delegation = await run.delegate({
      delegateeRunId: 'run-worker',
      taskId: 'task-1',
      description: 'do work',
      grantedCapabilities: ['text-generation'],
      grantedActions: ['read'],
      grantedDepth: 0,
      maxCostUsd: 5,
      maxLatencyMs: 60_000,
      maxTokens: 100_000,
    })

    const [url] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/agent-runs/run-1/delegations`)
    expect(delegation).toBeInstanceOf(DelegationHandle)
    expect(delegation.delegatedTaskId).toBe('dtask-1')
    expect(delegation.delegationId).toBe('del-1')
  })
})

describe('AgentRunHandle.evidence()', () => {
  it('calls GET /v1/agent-runs/:runId/evidence', async () => {
    const body = { runId: 'run-1', state: 'RUNNING', events: [] }
    const f = mockFetch([{ status: 200, body }])
    vi.stubGlobal('fetch', f)

    const run = new AgentRunHandle(BASE, 'run-1')
    const result = await run.evidence()

    const [url] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/agent-runs/run-1/evidence`)
    expect(result.events).toHaveLength(0)
  })
})

// ── DelegationHandle ──────────────────────────────────────────────────────────

describe('DelegationHandle.accept()', () => {
  it('calls POST /v1/delegations/:id/accept', async () => {
    const f = mockFetch([{ status: 200, body: { ok: true } }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const result = await d.accept()

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/delegations/dtask-1/accept`)
    expect((init as RequestInit).method).toBe('POST')
    expect(result.ok).toBe(true)
  })
})

describe('DelegationHandle.run()', () => {
  it('calls POST /v1/delegations/:id/run and returns ExecutionHandle', async () => {
    const body = {
      executionId: 'exec-1', idempotencyKey: null, state: 'QUEUED',
      protocolVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z', idempotent: false,
      delegationId: 'del-1', delegatedTaskId: 'dtask-1',
    }
    const f = mockFetch([{ status: 202, body }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const exec = await d.run()

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/delegations/dtask-1/run`)
    expect((init as RequestInit).method).toBe('POST')
    expect(exec.executionId).toBe('exec-1')
  })

  it('passes outputSchemaRef in body when provided', async () => {
    const body = {
      executionId: 'exec-2', idempotencyKey: null, state: 'QUEUED',
      protocolVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z', idempotent: false,
      delegationId: 'del-1', delegatedTaskId: 'dtask-1',
    }
    const f = mockFetch([{ status: 202, body }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const schemaRef = { schemaId: 'my-schema', version: '1', semanticHash: 'a'.repeat(64) }
    await d.run(schemaRef)

    const [, init] = f.mock.calls[0]!
    const sent = JSON.parse((init as RequestInit).body as string)
    expect(sent.outputSchemaRef).toEqual(schemaRef)
  })
})

describe('DelegationHandle.submitResult()', () => {
  it('calls POST /v1/delegations/:id/results', async () => {
    const f = mockFetch([{ status: 200, body: { ok: true, state: 'SUBMITTED' } }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    await d.submitResult({ answer: 42 })

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/delegations/dtask-1/results`)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ result: { answer: 42 } })
  })
})

describe('DelegationHandle.acceptResult()', () => {
  it('calls POST /v1/delegations/:id/results/accept', async () => {
    const f = mockFetch([{ status: 200, body: { ok: true, parentResumed: true } }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const result = await d.acceptResult()

    const [url] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/delegations/dtask-1/results/accept`)
    expect(result.parentResumed).toBe(true)
  })
})

describe('DelegationHandle.rejectResult()', () => {
  it('calls POST /v1/delegations/:id/results/reject with optional reason', async () => {
    const f = mockFetch([{ status: 200, body: { ok: true } }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    await d.rejectResult('bad output')

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/delegations/dtask-1/results/reject`)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: 'bad output' })
  })
})

describe('DelegationHandle.cancel()', () => {
  it('calls POST /v1/delegations/:id/cancel', async () => {
    const f = mockFetch([{ status: 200, body: { ok: true, parentResumed: false } }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const result = await d.cancel('abort')

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/delegations/dtask-1/cancel`)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: 'abort' })
    expect(result.ok).toBe(true)
  })
})

describe('DelegationHandle.evidence()', () => {
  it('calls GET /v1/delegations/:id/evidence', async () => {
    const body = { delegationId: 'del-1', events: [{ eventId: 'e1', kind: 'delegation-run', occurredAt: '' }] }
    const f = mockFetch([{ status: 200, body }])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const result = await d.evidence()

    const [url] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/delegations/dtask-1/evidence`)
    expect(result.events).toHaveLength(1)
  })
})

// ── T6: DelegationHandle.runAndWaitTyped() ────────────────────────────────────

describe('DelegationHandle.runAndWaitTyped()', () => {
  const schema = defineJsonSchema<{ value: number }>('test-schema', '1', { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] })

  it('registers schema, calls run, polls until COMPLETED, returns typed result', async () => {
    const f = mockFetch([
      // 1. register schema → 201
      { status: 201, body: { schemaId: 'test-schema', version: '1', semanticHash: schema.semanticHash } },
      // 2. run → 202
      { status: 202, body: { executionId: 'exec-t', idempotencyKey: null, state: 'QUEUED', protocolVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z', idempotent: false, delegationId: 'del-1', delegatedTaskId: 'dtask-1' } },
      // 3. status poll → COMPLETED
      { status: 200, body: { state: 'COMPLETED', executionId: 'exec-t' } },
      // 4. result
      { status: 200, body: { executionId: 'exec-t', output: { value: 7 }, validationResult: { outcome: 'VALID', errorCount: 0, schemaRef: { schemaId: 'test-schema', version: '1', semanticHash: schema.semanticHash } } } },
    ])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const result = await d.runAndWaitTyped(schema, { pollIntervalMs: 0 })

    expect(result.output).toEqual({ value: 7 })
    expect(result.validation.outcome).toBe('VALID')
    // 4 calls: register, run, status, result
    expect(f).toHaveBeenCalledTimes(4)
  })

  it('409 on schema registration is treated as success (already registered)', async () => {
    const f = mockFetch([
      { status: 409, body: { error: 'already-exists' } },
      { status: 202, body: { executionId: 'exec-t2', idempotencyKey: null, state: 'QUEUED', protocolVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z', idempotent: false, delegationId: 'del-1', delegatedTaskId: 'dtask-1' } },
      { status: 200, body: { state: 'COMPLETED', executionId: 'exec-t2' } },
      { status: 200, body: { executionId: 'exec-t2', output: { value: 1 }, validationResult: { outcome: 'VALID', errorCount: 0, schemaRef: { schemaId: 'test-schema', version: '1', semanticHash: schema.semanticHash } } } },
    ])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    const result = await d.runAndWaitTyped(schema, { pollIntervalMs: 0 })

    expect(result.output).toEqual({ value: 1 })
  })

  it('throws on hash mismatch in validationResult', async () => {
    const wrongHash = 'b'.repeat(64)
    const f = mockFetch([
      { status: 201, body: { schemaId: 'test-schema', version: '1', semanticHash: schema.semanticHash } },
      { status: 202, body: { executionId: 'exec-t3', idempotencyKey: null, state: 'QUEUED', protocolVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z', idempotent: false, delegationId: 'del-1', delegatedTaskId: 'dtask-1' } },
      { status: 200, body: { state: 'COMPLETED', executionId: 'exec-t3' } },
      { status: 200, body: { executionId: 'exec-t3', output: { value: 1 }, validationResult: { outcome: 'VALID', errorCount: 0, schemaRef: { schemaId: 'test-schema', version: '1', semanticHash: wrongHash } } } },
    ])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    await expect(d.runAndWaitTyped(schema, { pollIntervalMs: 0 })).rejects.toThrow()
  })

  it('does NOT call acceptResult automatically', async () => {
    const f = mockFetch([
      { status: 201, body: { schemaId: 'test-schema', version: '1', semanticHash: schema.semanticHash } },
      { status: 202, body: { executionId: 'exec-t4', idempotencyKey: null, state: 'QUEUED', protocolVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z', idempotent: false, delegationId: 'del-1', delegatedTaskId: 'dtask-1' } },
      { status: 200, body: { state: 'COMPLETED', executionId: 'exec-t4' } },
      { status: 200, body: { executionId: 'exec-t4', output: { value: 2 }, validationResult: { outcome: 'VALID', errorCount: 0, schemaRef: { schemaId: 'test-schema', version: '1', semanticHash: schema.semanticHash } } } },
    ])
    vi.stubGlobal('fetch', f)

    const d = new DelegationHandle(BASE, 'dtask-1', 'del-1')
    await d.runAndWaitTyped(schema, { pollIntervalMs: 0 })

    // Only 4 calls: register, run, status, result — no acceptResult call
    expect(f).toHaveBeenCalledTimes(4)
    for (const call of f.mock.calls) {
      const url = call[0] as string
      expect(url).not.toContain('results/accept')
    }
  })
})
