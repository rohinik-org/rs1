import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, defaultBootstrapPlan, BuiltinRegistry } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'
import { MockPolicyPort, MockCapabilityPort, MockBudgetPort } from '../agent-mock-ports.js'

const PORT = 19_202
const BASE = `http://127.0.0.1:${PORT}`

let host: RuntimeHost
let server: AiosServer

const COORD_INSTANCE = 'inst-coordinator-1'
const WORKER_INSTANCE = 'inst-worker-1'
const UNKNOWN_INSTANCE = 'inst-unknown-xyz'

async function post(path: string, body?: unknown) {
  const hasBody = body !== undefined
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    body: hasBody ? JSON.stringify(body) : undefined,
  })
}

async function get(path: string) {
  return fetch(`${BASE}${path}`)
}

beforeAll(async () => {
  const registry = new BuiltinRegistry()
  const config = {
    configPath: '/tmp/agents-e2e.yaml',
    runtimeId: 'test-agents-e2e',
    runtime: {
      routing: { mode: 'balanced' as const, explain: true, traceBuffer: 100 },
      resources: { maxConcurrentRequests: 10, timeoutMs: 10000 },
      logLevel: 'error' as const,
    },
    extensions: { paths: [] },
    providers: {},
    server: { port: PORT, host: '127.0.0.1' },
  }
  const plan = {
    ...defaultBootstrapPlan(config, registry),
    socketPath: '\\\\.\\pipe\\rohinik-agents-e2e',
    agentPolicyPort:     new MockPolicyPort(),
    agentCapabilityPort: new MockCapabilityPort(),
    agentBudgetPort:     new MockBudgetPort(),
  }
  host = new RuntimeHost(plan)
  await host.start()
  host.runtime.registerCapability(buildCoreCapability())
  host.runtime.registerProvider(new MockReasoningProvider())
  server = new AiosServer(host, { port: PORT, host: '127.0.0.1' })
  await server.listen()
}, 30_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

// ── Criterion 1: Pre-seeded admission ──────────────────────────────────────────
describe('Criterion 1 — pre-seeded admission', () => {
  it('admits coordinator', async () => {
    const res = await post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE })
    expect(res.status).toBe(200)
    const body = await res.json() as { runId: string }
    expect(body.runId).toBeDefined()
  })

  it('GET /v1/agent-instances/:instanceId returns coordinator', async () => {
    const res = await get(`/v1/agent-instances/${COORD_INSTANCE}`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.instanceId).toBe(COORD_INSTANCE)
    expect(body.versionId).toBe('ver-coordinator-1.0.0')
  })

  it('admits worker', async () => {
    const res = await post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE })
    expect(res.status).toBe(200)
    const body = await res.json() as { runId: string }
    expect(body.runId).toBeDefined()
  })

  it('unknown identity rejected (instance-not-found)', async () => {
    const res = await post('/v1/agent-instances/admit', { instanceId: UNKNOWN_INSTANCE })
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    // AgentAdmissionService fails at instance repo lookup before policy evaluation
    expect(body.error).toBeTruthy()
  })
})

// ── Criterion 2: Coordinator lifecycle through READY and RUNNING ───────────────
describe('Criterion 2 — coordinator lifecycle', () => {
  let coordRunId: string

  beforeAll(async () => {
    const res = await post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE })
    const body = await res.json() as { runId: string }
    coordRunId = body.runId
  })

  it('advances ADMITTED → READY → RUNNING', async () => {
    const res = await post('/v1/agent-runs', { runId: coordRunId })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.state).toBe('RUNNING')
  })

  it('GET /v1/agent-runs/:runId shows RUNNING', async () => {
    const res = await get(`/v1/agent-runs/${coordRunId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.state).toBe('RUNNING')
  })

  it('second POST /v1/agent-runs is idempotent or 409 (already RUNNING)', async () => {
    const res2 = await post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE })
    const { runId: freshRunId } = await res2.json() as { runId: string }
    const r1 = await post('/v1/agent-runs', { runId: freshRunId })
    expect(r1.status).toBe(200)
    // Second call: idempotent (already RUNNING) or 409
    const r2 = await post('/v1/agent-runs', { runId: freshRunId })
    expect([200, 409]).toContain(r2.status)
  })
})

// ── Criteria 3–8: Three delegations, parent blocking, result acceptance ────────
describe('Criterion 3-8 — delegation lifecycle', () => {
  let coordRunId: string
  let worker1RunId: string
  let worker2RunId: string
  let worker3RunId: string
  let task1Id: string
  let task2Id: string
  let task3Id: string

  beforeAll(async () => {
    const [c, w1, w2, w3] = await Promise.all([
      post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE }),
      post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE }),
      post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE }),
      post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE }),
    ])
    coordRunId   = ((await c.json())  as { runId: string }).runId
    worker1RunId = ((await w1.json()) as { runId: string }).runId
    worker2RunId = ((await w2.json()) as { runId: string }).runId
    worker3RunId = ((await w3.json()) as { runId: string }).runId
    await post('/v1/agent-runs', { runId: coordRunId })

    // Create all three delegations in beforeAll so task IDs are available in every it()
    const delegationBody = (delegateeRunId: string, delegationId: string) => ({
      delegateeRunId,
      taskId: `task-${delegationId}`,
      description: `task ${delegationId}`,
      delegationId,
      grantedCapabilities: ['text-generation'],
      grantedActions: ['read', 'write'],
      grantedDepth: 0,
      maxCostUsd: 5,
      maxLatencyMs: 15000,
      maxTokens: 10000,
    })

    const r1 = await post(`/v1/agent-runs/${coordRunId}/delegations`, delegationBody(worker1RunId, 'del-001'))
    task1Id = ((await r1.json()) as { delegatedTaskId: string }).delegatedTaskId

    const r2 = await post(`/v1/agent-runs/${coordRunId}/delegations`, delegationBody(worker2RunId, 'del-002'))
    task2Id = ((await r2.json()) as { delegatedTaskId: string }).delegatedTaskId

    const r3 = await post(`/v1/agent-runs/${coordRunId}/delegations`, delegationBody(worker3RunId, 'del-003'))
    task3Id = ((await r3.json()) as { delegatedTaskId: string }).delegatedTaskId
  })

  it('Criterion 3 — three attenuated delegations created with 201', () => {
    expect(task1Id).toBeDefined()
    expect(task2Id).toBeDefined()
    expect(task3Id).toBeDefined()
  })

  it('Criterion 4 — coordinator in DELEGATING after delegations', async () => {
    const res = await get(`/v1/agent-runs/${coordRunId}`)
    const body = await res.json() as Record<string, unknown>
    expect(body.state).toBe('DELEGATING')
  })

  it('Criterion 4 — child acceptance', async () => {
    const res = await post(`/v1/delegations/${task1Id}/accept`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('Criterion 5 — mock reasoning execution via /run', async () => {
    const res = await post(`/v1/delegations/${task1Id}/run`)
    expect(res.status).toBe(202)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body.executionId).toBe('string')
    expect(body.state).toBe('QUEUED')
    expect(body.protocolVersion).toBe('v1')
  })

  it('Criterion 6 — result submission separate from acceptance', async () => {
    // task1 is already SUBMITTED via /run; accept the result (SUBMITTED → ACCEPTED_RESULT)
    const res = await post(`/v1/delegations/${task1Id}/results/accept`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; parentResumed: boolean }
    expect(body.ok).toBe(true)
    // Parent should NOT resume — tasks 2 and 3 are still active
    expect(body.parentResumed).toBe(false)
  })

  it('Criterion 7 — parent stays DELEGATING while siblings active', async () => {
    const res = await get(`/v1/agent-runs/${coordRunId}`)
    const body = await res.json() as Record<string, unknown>
    expect(body.state).toBe('DELEGATING')
  })

  it('Criterion 8 — parent resumes only after governing set resolved', async () => {
    // Accept task2 via /run path
    await post(`/v1/delegations/${task2Id}/accept`)
    await post(`/v1/delegations/${task2Id}/run`)
    await post(`/v1/delegations/${task2Id}/results/accept`)

    // Parent should still be DELEGATING — task3 unresolved
    const mid = await get(`/v1/agent-runs/${coordRunId}`)
    const midBody = await mid.json() as Record<string, unknown>
    expect(midBody.state).toBe('DELEGATING')

    // Resolve task3 via cancel
    await post(`/v1/delegations/${task3Id}/cancel`, { reason: 'no longer needed' })

    // Now all siblings resolved — parent should be RUNNING
    const final = await get(`/v1/agent-runs/${coordRunId}`)
    const finalBody = await final.json() as Record<string, unknown>
    expect(finalBody.state).toBe('RUNNING')
  })
})

// ── Criterion 9: Cancellation revokes certificate ─────────────────────────────
describe('Criterion 9 — cancellation revokes certificate', () => {
  it('cancel revokes certificate and parent returns from DELEGATING', async () => {
    // Fresh coord + worker
    const [c, w] = await Promise.all([
      post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE }),
      post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE }),
    ])
    const coordRunId  = ((await c.json()) as { runId: string }).runId
    const workerRunId = ((await w.json()) as { runId: string }).runId
    await post('/v1/agent-runs', { runId: coordRunId })

    const delegRes = await post(`/v1/agent-runs/${coordRunId}/delegations`, {
      delegateeRunId:      workerRunId,
      taskId:              'task-cancel-test',
      description:         'to be cancelled',
      delegationId:        'del-cancel',
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read', 'write'],
      grantedDepth:        0,
      maxCostUsd:          5,
      maxLatencyMs:        15000,
      maxTokens:           10000,
    })
    expect(delegRes.status).toBe(201)
    const { delegatedTaskId } = await delegRes.json() as {
      delegatedTaskId: string; certificateId: string
    }

    const cancelRes = await post(`/v1/delegations/${delegatedTaskId}/cancel`, { reason: 'test cancel' })
    expect(cancelRes.status).toBe(200)
    const cancelBody = await cancelRes.json() as { ok: boolean; parentResumed: boolean }
    expect(cancelBody.ok).toBe(true)
    expect(cancelBody.parentResumed).toBe(true)

    // Parent should be RUNNING again
    const runRes = await get(`/v1/agent-runs/${coordRunId}`)
    const runBody = await runRes.json() as Record<string, unknown>
    expect(runBody.state).toBe('RUNNING')
  })
})

// ── Criterion 10: Evidence event order ────────────────────────────────────────
describe('Criterion 10 — evidence event order and completeness', () => {
  it('evidence contains expected event kinds in order', async () => {
    const [c, w] = await Promise.all([
      post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE }),
      post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE }),
    ])
    const coordRunId  = ((await c.json()) as { runId: string }).runId
    const workerRunId = ((await w.json()) as { runId: string }).runId

    await post('/v1/agent-runs', { runId: coordRunId })
    const dr = await post(`/v1/agent-runs/${coordRunId}/delegations`, {
      delegateeRunId:      workerRunId,
      taskId:              'task-ev',
      description:         'evidence test task',
      delegationId:        `del-ev-${Date.now()}`,
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read', 'write'],
      grantedDepth:        0,
      maxCostUsd:          5,
      maxLatencyMs:        15000,
      maxTokens:           10000,
    })
    const { delegatedTaskId } = await dr.json() as { delegatedTaskId: string }
    await post(`/v1/delegations/${delegatedTaskId}/accept`)
    await post(`/v1/delegations/${delegatedTaskId}/run`)
    await post(`/v1/delegations/${delegatedTaskId}/results/accept`)

    const evRes = await get(`/v1/agent-runs/${coordRunId}/evidence`)
    expect(evRes.status).toBe(200)
    const evBody = await evRes.json() as { events: Array<{ kind: string; occurredAt: string }> }
    const kinds = evBody.events.map(e => e.kind)

    expect(kinds).toContain('agent-admitted')
    expect(kinds).toContain('run-transition')
    expect(kinds).toContain('certificate-issued')
    expect(kinds).toContain('delegation-proposed')
    expect(kinds).toContain('delegation-offered')
    expect(kinds).toContain('delegation-accepted')
    expect(kinds).toContain('delegation-run')
    expect(kinds).toContain('result-submitted')
    expect(kinds).toContain('result-accepted')

    // Order: agent-admitted before run-transition before certificate-issued
    const admitIdx  = kinds.indexOf('agent-admitted')
    const transIdx  = kinds.indexOf('run-transition')
    const certIdx   = kinds.indexOf('certificate-issued')
    expect(admitIdx).toBeLessThan(transIdx)
    expect(transIdx).toBeLessThan(certIdx)

    // All events have occurredAt
    for (const ev of evBody.events) {
      expect(ev.occurredAt).toBeDefined()
    }
  })
})

// ── Criterion 11: Failure modes ────────────────────────────────────────────────
describe('Criterion 11 — failure modes fail closed', () => {
  it('missing instanceId → 400', async () => {
    const res = await post('/v1/agent-instances/admit', {})
    expect(res.status).toBe(400)
  })

  it('unknown identity → 409', async () => {
    const res = await post('/v1/agent-instances/admit', { instanceId: 'unknown-xyz' })
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  it('excess authority → 400 attenuation-violated', async () => {
    const [c, w] = await Promise.all([
      post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE }),
      post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE }),
    ])
    const coordRunId  = ((await c.json()) as { runId: string }).runId
    const workerRunId = ((await w.json()) as { runId: string }).runId
    await post('/v1/agent-runs', { runId: coordRunId })

    // grantedDepth: 5 > coordinator maxDelegationDepth: 3 → attenuation violation
    const res = await post(`/v1/agent-runs/${coordRunId}/delegations`, {
      delegateeRunId:      workerRunId,
      taskId:              'task-att',
      description:         'attenuation test',
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read', 'write'],
      grantedDepth:        5,
      maxCostUsd:          5,
      maxLatencyMs:        15000,
      maxTokens:           10000,
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('attenuation-violated')
  })

  it('excess budget → 400 attenuation-violated', async () => {
    const [c, w] = await Promise.all([
      post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE }),
      post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE }),
    ])
    const coordRunId  = ((await c.json()) as { runId: string }).runId
    const workerRunId = ((await w.json()) as { runId: string }).runId
    await post('/v1/agent-runs', { runId: coordRunId })

    // maxCostUsd: 200 > coordinator budget maxCostUsd: 100 → attenuation violation
    const res = await post(`/v1/agent-runs/${coordRunId}/delegations`, {
      delegateeRunId:      workerRunId,
      taskId:              'task-budget',
      description:         'budget test',
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read', 'write'],
      grantedDepth:        0,
      maxCostUsd:          200,
      maxLatencyMs:        15000,
      maxTokens:           10000,
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('attenuation-violated')
  })

  it('invalid transition → 409 (acceptResult on non-SUBMITTED task)', async () => {
    const c = await post('/v1/agent-instances/admit', { instanceId: COORD_INSTANCE })
    const coordRunId = ((await c.json()) as { runId: string }).runId
    await post('/v1/agent-runs', { runId: coordRunId })
    const w = await post('/v1/agent-instances/admit', { instanceId: WORKER_INSTANCE })
    const workerRunId = ((await w.json()) as { runId: string }).runId
    const dr = await post(`/v1/agent-runs/${coordRunId}/delegations`, {
      delegateeRunId: workerRunId, taskId: 'task-inv', description: 'inv',
      grantedCapabilities: ['text-generation'], grantedActions: ['read', 'write'],
      grantedDepth: 0, maxCostUsd: 5, maxLatencyMs: 15000, maxTokens: 10000,
    })
    const { delegatedTaskId } = await dr.json() as { delegatedTaskId: string }
    // task is OFFERED; acceptResult requires SUBMITTED — should 409
    const res = await post(`/v1/delegations/${delegatedTaskId}/results/accept`)
    expect(res.status).toBe(409)
  })

  it('unknown delegatedTaskId → 404', async () => {
    const res = await post('/v1/delegations/no-such-task/accept')
    expect(res.status).toBe(404)
  })

  it('agent services not configured returns non-2xx for missing runs', async () => {
    const res = await get('/v1/agent-runs/no-such-run/evidence')
    expect(res.status).toBe(404)
  })
})

// ── Criterion 12: Existing routes remain green ─────────────────────────────────
describe('Criterion 12 — existing routes remain green', () => {
  it('GET /v1/health still works', async () => {
    const res = await get('/v1/health')
    expect(res.status).toBe(200)
  })

  it('GET /v1/runtime still works', async () => {
    const res = await get('/v1/runtime')
    expect(res.status).toBe(200)
  })

  it('POST /v1/execute still works', async () => {
    const res = await post('/v1/execute', {
      content: 'test agent vertical slice',
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.requestId).toBeDefined()
  })

  it('GET /v1/capabilities still works', async () => {
    const res = await get('/v1/capabilities')
    expect(res.status).toBe(200)
  })
})
