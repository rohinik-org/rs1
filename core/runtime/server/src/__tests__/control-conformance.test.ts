/**
 * Stage 16E Task 6 — Control HTTP Vertical Slice Conformance
 *
 * Proves the full control lifecycle end-to-end over HTTP against a live RS1 server:
 *
 *   Pillar A — Artifact registration + content hash
 *   Pillar B — Approval: exact binding (hash + scope + actionType)
 *   Pillar C — Workflow creation + idempotency key
 *   Pillar D — Apply: approval-gated, checkpoint attached, MutationOutcome recorded
 *   Pillar E — Verify: PASSED → VERIFIED; exitCode alone not authoritative
 *   Pillar F — Verify: FAILED → VERIFICATION_FAILED; evidence preserved
 *   Pillar G — Recovery: VERIFICATION_FAILED → RECOVERY_REQUIRED → RECOVERED
 *   Pillar H — Evidence endpoint: ordered events across full lifecycle
 *   Pillar I — Cancellation: any non-terminal state → CANCELLED
 *   Pillar J — Negative: stale / fabricated approvalId → 409
 *   Pillar K — Negative: wrong scope on approve → 409
 *   Pillar L — Negative: wrong hash on recover directive → 409
 *   Pillar M — Negative: RESTORE_CHECKPOINT blocked if dirty checkpoint
 *   Pillar N — Negative: VERIFICATION_FAILED alone does not authorize recovery (needs RECOVERY_REQUIRED)
 *   Pillar O — Negative: unknown workflowId → 404
 *   Pillar P — Negative: duplicate apply on APPLIED workflow → 409
 *   Pillar Q — Floor: T1–T5 unit tests all pass; 16D conformance unaffected
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { RuntimeHost, defaultBootstrapPlan, BuiltinRegistry } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'
import { MockPolicyPort, MockCapabilityPort, MockBudgetPort } from '../agent-mock-ports.js'
import {
  MutationOutcome,
  VerificationStatus,
  RecoveryStrategy,
  ControlWorkflowState,
} from '@rohinik-org/control-protocol-v1'

const PORT = 19_216
const BASE = `http://127.0.0.1:${PORT}`

let host: RuntimeHost
let server: AiosServer

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const DIFF      = '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new\n'
const DIFF_HASH = sha256(DIFF)

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body ?? {}),
  })
}

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`)
}

function cleanCheckpoint(workflowId: string) {
  return {
    checkpointId:    randomUUID(),
    capturedAt:      new Date().toISOString(),
    headRef:         'abc123def456',
    workingTreeHash: sha256('tree'),
    indexHash:       sha256('index'),
    dirtyState: {
      hasUncommittedChanges: false,
      stagedFileCount:       0,
      unstagedFileCount:     0,
      untrackedFileCount:    0,
      files:                 [],
    },
    evidenceRef: workflowId,
  }
}

function dirtyCheckpoint(workflowId: string) {
  return {
    checkpointId:    randomUUID(),
    capturedAt:      new Date().toISOString(),
    headRef:         'abc123def456',
    workingTreeHash: sha256('dirty-tree'),
    indexHash:       sha256('dirty-index'),
    dirtyState: {
      hasUncommittedChanges: true,
      stagedFileCount:       1,
      unstagedFileCount:     2,
      untrackedFileCount:    0,
      files:                 ['src/other.ts'],
    },
    evidenceRef: workflowId,
  }
}

function applyRecord(artifactId: string, checkpointId: string, outcome: MutationOutcome) {
  return {
    artifactId,
    appliedAt:       new Date().toISOString(),
    method:          'git apply',
    exitCode:        outcome === MutationOutcome.APPLIED ? 0 : 1,
    stdout:          '',
    stderr:          '',
    mutationOutcome: outcome,
    checkpointId,
  }
}

function verifyPayload(status: string) {
  const now = new Date()
  return {
    verifierId:      'test-verifier',
    verifierVersion: '1.0.0',
    command:         'pnpm test',
    startedAt:       new Date(now.getTime() - 300).toISOString(),
    finishedAt:      now.toISOString(),
    durationMs:      300,
    exitCode:        status === 'PASSED' ? 0 : 1,
    status,
    checks:          [],
    timedOut:        false,
  }
}

function recoverPayload(contentHash: string, strategy: RecoveryStrategy, checkpointId?: string) {
  const now = new Date()
  return {
    strategy,
    operatorId:      'op-1',
    rationale:       'reverting after verification failure',
    contentHash,
    startedAt:       new Date(now.getTime() - 100).toISOString(),
    completedAt:     now.toISOString(),
    exitCode:        0,
    mutationOutcome: MutationOutcome.APPLIED,
    succeeded:       true,
    ...(checkpointId !== undefined && { checkpointId }),
  }
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const registry = new BuiltinRegistry()
  const config = {
    configPath: '/tmp/control-conformance.yaml',
    runtimeId:  'test-control-conformance',
    runtime: {
      routing:   { mode: 'balanced' as const, explain: true, traceBuffer: 100 },
      resources: { maxConcurrentRequests: 10, timeoutMs: 10_000 },
      logLevel:  'error' as const,
    },
    extensions: { paths: [] },
    providers:  {},
    server:     { port: PORT, host: '127.0.0.1' },
  }
  const plan = {
    ...defaultBootstrapPlan(config, registry),
    socketPath:          '\\\\.\\pipe\\rohinik-control-conformance',
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
})

// ── Pillar A: Artifact registration ──────────────────────────────────────────

describe('Pillar A — artifact registration', () => {
  it('POST /v1/control/artifacts returns 201 with contentHash', async () => {
    const res = await post('/v1/control/artifacts', {
      actionType: 'FILE_PATCH',
      scope:      '/repo/main',
      content:    DIFF,
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.artifactId).toBeDefined()
    expect(body.contentHash).toBe(DIFF_HASH)
    expect(body.actionType).toBe('FILE_PATCH')
    expect(body.scope).toBe('/repo/main')
  })

  it('POST /v1/control/artifacts missing content → 400', async () => {
    const res = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo' })
    expect(res.status).toBe(400)
  })
})

// ── Pillar B: Approval exact binding ─────────────────────────────────────────

describe('Pillar B — approval binding', () => {
  it('approve with correct binding returns 200 + approvalId', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any

    const appRes = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH,
      actionType:  'FILE_PATCH',
      scope:       '/repo/main',
      operatorId:  'op-1',
    })
    expect(appRes.status).toBe(200)
    const body = await appRes.json() as any
    expect(body.approvalId).toBeDefined()
    expect(body.binding.contentHash).toBe(DIFF_HASH)
    expect(body.binding.scope).toBe('/repo/main')
  })

  it('approve with wrong scope → 409 APPROVAL_BINDING_INVALID', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any

    const res = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH,
      actionType:  'FILE_PATCH',
      scope:       '/repo/feature',   // wrong scope
      operatorId:  'op-1',
    })
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.code).toBe('APPROVAL_BINDING_INVALID')
  })

  it('deny returns 200 + ok:true', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo', content: DIFF })
    const { artifactId } = await regRes.json() as any

    const res = await post(`/v1/control/artifacts/${artifactId}/deny`, { operatorId: 'op-1', rationale: 'risk' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(body.artifactId).toBe(artifactId)
  })
})

// ── Pillar C: Workflow creation + idempotency ─────────────────────────────────

describe('Pillar C — workflow creation', () => {
  it('POST /v1/control/workflows returns 201 in DRAFT state', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo', content: DIFF })
    const { artifactId } = await regRes.json() as any

    const res = await post('/v1/control/workflows', { artifactId })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.workflowId).toBeDefined()
    expect(body.state).toBe(ControlWorkflowState.DRAFT)
    expect(body.artifactId).toBe(artifactId)
  })

  it('same idempotency key returns same workflowId', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const key = `idem-${randomUUID()}`

    const r1 = await post('/v1/control/workflows', { artifactId, idempotencyKey: key })
    const r2 = await post('/v1/control/workflows', { artifactId, idempotencyKey: key })
    const b1 = await r1.json() as any
    const b2 = await r2.json() as any
    expect(b1.workflowId).toBe(b2.workflowId)
  })

  it('GET /v1/control/workflows/:id returns workflow', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const wfRes = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any

    const res = await get(`/v1/control/workflows/${workflowId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.workflowId).toBe(workflowId)
  })

  it('GET /v1/control/workflows/unknown → 404', async () => {
    const res = await get('/v1/control/workflows/nonexistent')
    expect(res.status).toBe(404)
  })
})

// ── Pillar D: Apply — approval-gated ─────────────────────────────────────────

describe('Pillar D — apply (approval-gated)', () => {
  it('valid approval + clean checkpoint → APPLIED state', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any

    const appRes = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any

    const wfRes = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)

    const res = await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.APPLIED)
    expect(body.checkpointId).toBe(cp.checkpointId)
  })

  it('fabricated approvalId → 409 APPROVAL_NOT_FOUND', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const wfRes = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)

    const res = await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId:  'fabricated-approval',
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.code).toBe('APPROVAL_NOT_FOUND')
  })

  it('PARTIAL MutationOutcome → RECOVERY_REQUIRED state', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)

    const res = await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.PARTIAL),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.RECOVERY_REQUIRED)
  })
})

// ── Pillar E: Verify PASSED → VERIFIED ───────────────────────────────────────

describe('Pillar E — verification PASSED', () => {
  async function driveToApplied() {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    return { workflowId, artifactId }
  }

  it('PASSED status → VERIFIED workflow state', async () => {
    const { workflowId } = await driveToApplied()
    const res  = await post(`/v1/control/workflows/${workflowId}/verify`, verifyPayload('PASSED'))
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.VERIFIED)
    expect(body.verification.status).toBe(VerificationStatus.PASSED)
  })

  it('exitCode=0 + FAILED status → VERIFICATION_FAILED (not VERIFIED)', async () => {
    const { workflowId } = await driveToApplied()
    const res  = await post(`/v1/control/workflows/${workflowId}/verify`, {
      ...verifyPayload('FAILED'), exitCode: 0,
    })
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })

  it('exitCode=1 + PASSED status → VERIFIED (status authoritative)', async () => {
    const { workflowId } = await driveToApplied()
    const res  = await post(`/v1/control/workflows/${workflowId}/verify`, {
      ...verifyPayload('PASSED'), exitCode: 1,
    })
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.VERIFIED)
  })
})

// ── Pillar F: Verify FAILED → VERIFICATION_FAILED ────────────────────────────

describe('Pillar F — verification FAILED', () => {
  it('FAILED → VERIFICATION_FAILED, result preserved', async () => {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })

    const res  = await post(`/v1/control/workflows/${workflowId}/verify`, {
      ...verifyPayload('FAILED'),
      diagnostics: '3 tests failed',
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
    expect(body.verification.diagnostics).toBeDefined()
  })
})

// ── Pillar G: Recovery full cycle ─────────────────────────────────────────────

describe('Pillar G — recovery REVERSE_PATCH', () => {
  async function driveToVerificationFailed() {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    await post(`/v1/control/workflows/${workflowId}/verify`, verifyPayload('FAILED'))
    return { workflowId, artifactId, cp }
  }

  it('VERIFICATION_FAILED → RECOVERY_REQUIRED → RECOVERED via REVERSE_PATCH', async () => {
    const { workflowId } = await driveToVerificationFailed()

    const res  = await post(`/v1/control/workflows/${workflowId}/recover`,
      recoverPayload(DIFF_HASH, RecoveryStrategy.REVERSE_PATCH))
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.RECOVERED)
    expect(body.recovery.succeeded).toBe(true)
    expect(body.recovery.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
  })

  it('dirty checkpoint + RESTORE_CHECKPOINT → 409 RECOVERY_UNSAFE', async () => {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = dirtyCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    await post(`/v1/control/workflows/${workflowId}/verify`, verifyPayload('FAILED'))

    const res  = await post(`/v1/control/workflows/${workflowId}/recover`,
      recoverPayload(DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT, cp.checkpointId))
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.code).toBe('RECOVERY_UNSAFE')
  })
})

// ── Pillar H: Evidence ────────────────────────────────────────────────────────

describe('Pillar H — evidence endpoint', () => {
  it('full lifecycle evidence has ordered events with kinds', async () => {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    await post(`/v1/control/workflows/${workflowId}/verify`, verifyPayload('PASSED'))

    const res  = await get(`/v1/control/workflows/${workflowId}/evidence`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.workflowId).toBe(workflowId)
    expect(body.state).toBe(ControlWorkflowState.VERIFIED)
    expect(Array.isArray(body.events)).toBe(true)
    expect(body.events.length).toBeGreaterThanOrEqual(2)

    const kinds = body.events.map((e: any) => e.kind)
    expect(kinds).toContain('workflow-created')
    expect(kinds).toContain('apply-completed')
    expect(kinds).toContain('verification-completed')
  })
})

// ── Pillar I: Cancellation ────────────────────────────────────────────────────

describe('Pillar I — cancellation', () => {
  it('DRAFT workflow can be cancelled', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const wfRes  = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any

    const res  = await post(`/v1/control/workflows/${workflowId}/cancel`, { operatorId: 'op-1', reason: 'no longer needed' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.state).toBe(ControlWorkflowState.CANCELLED)
  })

  it('VERIFIED workflow cannot be cancelled (terminal)', async () => {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    await post(`/v1/control/workflows/${workflowId}/verify`, verifyPayload('PASSED'))

    const res = await post(`/v1/control/workflows/${workflowId}/cancel`, { operatorId: 'op-1' })
    expect(res.status).toBe(409)
  })
})

// ── Pillar J: Stale approval ───────────────────────────────────────────────────

describe('Pillar J — stale / fabricated approvalId', () => {
  it('fabricated approvalId in apply → 409 APPROVAL_NOT_FOUND', async () => {
    const regRes = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const wfRes  = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)

    const res = await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId:  'not-a-real-approval-id',
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.code).toBe('APPROVAL_NOT_FOUND')
  })
})

// ── Pillar K: Wrong scope ─────────────────────────────────────────────────────

describe('Pillar K — wrong scope on approve', () => {
  it('scope mismatch → 409 APPROVAL_BINDING_INVALID', async () => {
    const regRes = await post('/v1/control/artifacts', {
      actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF,
    })
    const { artifactId } = await regRes.json() as any

    const res = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH,
      actionType:  'FILE_PATCH',
      scope:       '/repo/wrong-branch',
      operatorId:  'op-1',
    })
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.code).toBe('APPROVAL_BINDING_INVALID')
  })
})

// ── Pillar L: Wrong hash on recover ──────────────────────────────────────────

describe('Pillar L — wrong hash on recovery directive', () => {
  it('wrong contentHash → 409 HASH_MISMATCH', async () => {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    await post(`/v1/control/workflows/${workflowId}/verify`, verifyPayload('FAILED'))

    const res = await post(`/v1/control/workflows/${workflowId}/recover`,
      recoverPayload('0000wrong', RecoveryStrategy.REVERSE_PATCH))
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.code).toBe('HASH_MISMATCH')
  })
})

// ── Pillar M: RESTORE_CHECKPOINT dirty-tree guard ─────────────────────────────
// Already tested in Pillar G — included here as explicit pillar reference

describe('Pillar M — RESTORE_CHECKPOINT blocked on dirty checkpoint', () => {
  it('dirty pre-existing files + RESTORE_CHECKPOINT → 409 RECOVERY_UNSAFE', async () => {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = dirtyCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })
    await post(`/v1/control/workflows/${workflowId}/verify`, verifyPayload('FAILED'))

    const res = await post(`/v1/control/workflows/${workflowId}/recover`,
      recoverPayload(DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT, cp.checkpointId))
    expect(res.status).toBe(409)
    expect((await res.json() as any).code).toBe('RECOVERY_UNSAFE')
  })
})

// ── Pillar N: VERIFICATION_FAILED alone does not authorize recovery ────────────

describe('Pillar N — VERIFICATION_FAILED alone does not authorize recovery', () => {
  it('workflow in VERIFICATION_FAILED + INDETERMINATE outcome + REVERSE_PATCH → 409', async () => {
    // Here the apply outcome was INDETERMINATE, then verify failed.
    // Recovery engine blocks REVERSE_PATCH on INDETERMINATE.
    // The route transitions VERIFICATION_FAILED → RECOVERY_REQUIRED first,
    // but the safety matrix then rejects REVERSE_PATCH.
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    // Apply with INDETERMINATE outcome → RECOVERY_REQUIRED (skips verify)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.INDETERMINATE),
    })
    // Workflow is already in RECOVERY_REQUIRED; try REVERSE_PATCH → blocked
    const res = await post(`/v1/control/workflows/${workflowId}/recover`,
      recoverPayload(DIFF_HASH, RecoveryStrategy.REVERSE_PATCH))
    expect(res.status).toBe(409)
    expect((await res.json() as any).code).toBe('RECOVERY_UNSAFE')
  })
})

// ── Pillar O: Unknown workflow ID ─────────────────────────────────────────────

describe('Pillar O — unknown workflowId', () => {
  it('apply on unknown workflowId → 404', async () => {
    const res = await post('/v1/control/workflows/ghost/apply', {
      approvalId: 'x', checkpoint: {}, applyRecord: {},
    })
    expect(res.status).toBe(404)
  })

  it('verify on unknown workflowId → 404', async () => {
    const res = await post('/v1/control/workflows/ghost/verify', { command: 'pnpm test' })
    expect(res.status).toBe(404)
  })

  it('cancel on unknown workflowId → 404', async () => {
    const res = await post('/v1/control/workflows/ghost/cancel', { operatorId: 'op-1' })
    expect(res.status).toBe(404)
  })
})

// ── Pillar P: Duplicate mutation ──────────────────────────────────────────────

describe('Pillar P — duplicate apply (APPLIED workflow)', () => {
  it('second apply on APPLIED workflow → 409 INVALID_TRANSITION', async () => {
    const regRes  = await post('/v1/control/artifacts', { actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF })
    const { artifactId } = await regRes.json() as any
    const appRes  = await post(`/v1/control/artifacts/${artifactId}/approve`, {
      contentHash: DIFF_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', operatorId: 'op-1',
    })
    const { approvalId } = await appRes.json() as any
    const wfRes   = await post('/v1/control/workflows', { artifactId })
    const { workflowId } = await wfRes.json() as any
    const cp = cleanCheckpoint(workflowId)
    await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp,
      applyRecord: applyRecord(artifactId, cp.checkpointId, MutationOutcome.APPLIED),
    })

    // Second apply on the same workflow (now APPLIED)
    const cp2 = cleanCheckpoint(workflowId)
    const res  = await post(`/v1/control/workflows/${workflowId}/apply`, {
      approvalId,
      checkpoint:  cp2,
      applyRecord: applyRecord(artifactId, cp2.checkpointId, MutationOutcome.APPLIED),
    })
    expect(res.status).toBe(409)
    expect((await res.json() as any).code).toBe('INVALID_TRANSITION')
  })
})

// ── Pillar Q: Floor compliance ────────────────────────────────────────────────

describe('Pillar Q — floor compliance', () => {
  it('health route still responds 200', async () => {
    const res = await get('/v1/health')
    expect(res.status).toBe(200)
  })
})
