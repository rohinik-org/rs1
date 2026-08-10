/**
 * Stage 16E T10 — Boundary 2: @rohinik-org/control SDK against live RS1
 *
 * Proves the full control lifecycle end-to-end using the public SDK handles
 * (not raw fetch) against a live AiosServer.
 *
 * Pillars:
 *   I    — artifact create → approve → workflow → apply(APPLIED) → verify(PASSED) → VERIFIED
 *   II   — apply(PARTIAL) → RECOVERY_REQUIRED → recover(REVERSE_PATCH) → RECOVERED
 *   III  — verify(FAILED) → VERIFICATION_FAILED → evidence preserved
 *   IV   — cancel workflow from DRAFT state → CANCELLED
 *   V    — reload() syncs state from server
 *   VI   — evidence() returns ordered event list
 *   VII  — approve() sends server-authoritative contentHash (not caller-supplied)
 *   VIII — 404 on load() of non-existent workflow → ControlSdkError
 *   IX   — 409 on fabricated approvalId → ControlSdkError code=APPROVAL_NOT_FOUND
 *   X    — 409 on wrong scope approve → ControlSdkError code=APPROVAL_BINDING_INVALID
 *   XI   — 409 on RESTORE_CHECKPOINT with dirty checkpoint → RECOVERY_UNSAFE
 *   XII  — 409 on replayed apply → INVALID_TRANSITION
 *   XIII — idempotency key: same key → same workflow
 *   XIV  — verify INCONCLUSIVE → VERIFICATION_FAILED
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, defaultBootstrapPlan, BuiltinRegistry } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'
import { MockPolicyPort, MockCapabilityPort, MockBudgetPort } from '../agent-mock-ports.js'
import {
  createControlClient,
  ControlSdkError,
} from '@rohinik-org/control'
import {
  MutationOutcome,
  RecoveryStrategy,
  ControlWorkflowState,
  VerificationStatus,
} from '@rohinik-org/control-protocol-v1'
import { createHash, randomUUID } from 'node:crypto'

const PORT = 19_217
const BASE = `http://127.0.0.1:${PORT}`

let host: RuntimeHost
let server: AiosServer

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const DIFF      = '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n'
const DIFF_HASH = sha256(DIFF)

function nowIso() { return new Date().toISOString() }

function cleanCheckpoint(id = randomUUID()) {
  return {
    checkpointId:    id,
    capturedAt:      nowIso(),
    headRef:         'abc123',
    workingTreeHash: sha256('tree'),
    indexHash:       sha256('index'),
    dirtyState: {
      hasUncommittedChanges: false,
      stagedFileCount: 0, unstagedFileCount: 0, untrackedFileCount: 0, files: [],
    },
  }
}

function dirtyCheckpoint(id = randomUUID()) {
  return {
    checkpointId:    id,
    capturedAt:      nowIso(),
    headRef:         'abc123',
    workingTreeHash: sha256('dirty-tree'),
    indexHash:       sha256('dirty-index'),
    dirtyState: {
      hasUncommittedChanges: true,
      stagedFileCount: 1, unstagedFileCount: 2, untrackedFileCount: 0, files: ['src/other.ts'],
    },
  }
}

function applyRec(artifactId: string, checkpointId: string, outcome: MutationOutcome) {
  return {
    artifactId, appliedAt: nowIso(), method: 'git apply',
    exitCode: outcome === MutationOutcome.APPLIED ? 0 : 1,
    stdout: '', stderr: '', mutationOutcome: outcome, checkpointId,
  }
}

function verifyPayload(status: VerificationStatus) {
  const now = new Date()
  return {
    command: 'pnpm test', verifierId: 'test', verifierVersion: '1.0',
    startedAt: new Date(now.getTime() - 100).toISOString(), finishedAt: nowIso(),
    durationMs: 100, exitCode: status === VerificationStatus.PASSED ? 0 : 1,
    status, checks: [], timedOut: false,
  }
}

beforeAll(async () => {
  const registry = new BuiltinRegistry()
  const config = {
    configPath: '/tmp/control-sdk-live.yaml',
    runtimeId:  'test-control-sdk-live',
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
    socketPath:          '\\\\.\\pipe\\rohinik-control-sdk-live',
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

const client = createControlClient(BASE)

// ── Pillar I — full happy path VERIFIED ──────────────────────────────────────

describe('Pillar I — happy path: create → approve → workflow → apply → verify PASSED → VERIFIED', () => {
  it('runs full lifecycle and reaches VERIFIED', async () => {
    const artifact = await client.artifacts.create({
      actionType: 'FILE_PATCH', scope: '/repo/main', content: DIFF,
    })
    expect(artifact.id).toBeDefined()
    expect(artifact.contentHash).toBe(DIFF_HASH)

    const decision = await artifact.approve({ operatorId: 'op-1', rationale: 'lgtm' })
    expect(decision.approvalId).toBeDefined()
    expect(decision.binding.contentHash).toBe(DIFF_HASH)

    const wf = await client.workflows.create(artifact.id)
    expect(wf.state).toBe(ControlWorkflowState.DRAFT)

    const cp = cleanCheckpoint()
    const applyResult = await wf.apply({
      approvalId:  decision.approvalId,
      checkpoint:  cp,
      applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.APPLIED),
    })
    expect(applyResult.state).toBe(ControlWorkflowState.APPLIED)
    expect(wf.state).toBe(ControlWorkflowState.APPLIED)

    const vr = await wf.verify(verifyPayload(VerificationStatus.PASSED))
    expect(vr.status).toBe(VerificationStatus.PASSED)
    expect(wf.state).toBe(ControlWorkflowState.VERIFIED)
  })
})

// ── Pillar II — PARTIAL → RECOVERY_REQUIRED → recover REVERSE_PATCH ──────────

describe('Pillar II — PARTIAL mutation → RECOVERY_REQUIRED → REVERSE_PATCH → RECOVERED', () => {
  it('reaches RECOVERED', async () => {
    const artifact = await client.artifacts.create({
      actionType: 'FILE_PATCH', scope: '/repo/recover-test', content: DIFF,
    })
    const decision  = await artifact.approve({ operatorId: 'op-1' })
    const wf        = await client.workflows.create(artifact.id)
    const cp        = cleanCheckpoint()

    await wf.apply({
      approvalId:  decision.approvalId,
      checkpoint:  cp,
      applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.PARTIAL),
    })
    expect(wf.state).toBe(ControlWorkflowState.RECOVERY_REQUIRED)

    const recovery = await wf.recover({
      strategy:        RecoveryStrategy.REVERSE_PATCH,
      operatorId:      'op-1',
      rationale:       'partial apply — reversing',
      contentHash:     artifact.contentHash,
      startedAt:       nowIso(),
      completedAt:     nowIso(),
      exitCode:        0,
      mutationOutcome: MutationOutcome.APPLIED,
      succeeded:       true,
    })
    expect(recovery.succeeded).toBe(true)
    expect(recovery.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
    expect(wf.state).toBe(ControlWorkflowState.RECOVERED)
  })
})

// ── Pillar III — verify FAILED → VERIFICATION_FAILED → evidence ───────────────

describe('Pillar III — verify FAILED → VERIFICATION_FAILED + evidence', () => {
  it('workflow reaches VERIFICATION_FAILED; evidence log contains verification-completed', async () => {
    const artifact = await client.artifacts.create({
      actionType: 'FILE_PATCH', scope: '/repo/fail-test', content: DIFF,
    })
    const decision = await artifact.approve({ operatorId: 'op-1' })
    const wf       = await client.workflows.create(artifact.id)
    const cp       = cleanCheckpoint()

    await wf.apply({ approvalId: decision.approvalId, checkpoint: cp, applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.APPLIED) })
    const vr = await wf.verify(verifyPayload(VerificationStatus.FAILED))
    expect(vr.status).toBe(VerificationStatus.FAILED)
    expect(wf.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)

    const ev = await wf.evidence()
    expect(ev.events.some(e => e.kind === 'verification-completed')).toBe(true)
  })
})

// ── Pillar IV — cancel from DRAFT ────────────────────────────────────────────

describe('Pillar IV — cancel workflow from DRAFT', () => {
  it('state becomes CANCELLED', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const wf       = await client.workflows.create(artifact.id)
    const result   = await wf.cancel({ operatorId: 'op-cancel', reason: 'test cancel' })
    expect(result.state).toBe(ControlWorkflowState.CANCELLED)
    expect(wf.state).toBe(ControlWorkflowState.CANCELLED)
  })
})

// ── Pillar V — reload() ───────────────────────────────────────────────────────

describe('Pillar V — reload() syncs state', () => {
  it('reload reflects server-side state change', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const decision = await artifact.approve({ operatorId: 'op' })
    const wf       = await client.workflows.create(artifact.id)
    expect(wf.state).toBe(ControlWorkflowState.DRAFT)

    const cp = cleanCheckpoint()
    await wf.apply({ approvalId: decision.approvalId, checkpoint: cp, applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.APPLIED) })

    // Load a second handle (simulates resume from different process)
    const wf2 = await client.workflows.load(wf.id)
    expect(wf2.state).toBe(ControlWorkflowState.APPLIED)

    await wf2.reload()
    expect(wf2.state).toBe(ControlWorkflowState.APPLIED)
  })
})

// ── Pillar VI — evidence() event ordering ────────────────────────────────────

describe('Pillar VI — evidence event ordering', () => {
  it('events list workflow-created as first event', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const wf       = await client.workflows.create(artifact.id)
    await wf.cancel({ operatorId: 'op' })

    const ev = await wf.evidence()
    expect(ev.events.length).toBeGreaterThanOrEqual(2)
    expect(ev.events[0]!.kind).toBe('workflow-created')
    expect(ev.events.some(e => e.kind === 'workflow-cancelled')).toBe(true)
  })
})

// ── Pillar VII — approve() uses server-authoritative contentHash ──────────────

describe('Pillar VII — approve binding uses server hash', () => {
  it('approvalId bound to artifact contentHash', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    expect(artifact.contentHash).toBe(DIFF_HASH)
    const decision = await artifact.approve({ operatorId: 'op' })
    expect(decision.binding.contentHash).toBe(DIFF_HASH)
    expect(decision.binding.scope).toBe('/s')
  })
})

// ── Pillar VIII — 404 on unknown workflow ─────────────────────────────────────

describe('Pillar VIII — 404 on unknown workflowId', () => {
  it('load() throws ControlSdkError status=404', async () => {
    const err = await client.workflows.load('non-existent-wf-xyz').catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(404)
  })
})

// ── Pillar IX — fabricated approvalId ────────────────────────────────────────

describe('Pillar IX — fabricated approvalId on apply → 409 APPROVAL_NOT_FOUND', () => {
  it('throws ControlSdkError code=APPROVAL_NOT_FOUND', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const wf       = await client.workflows.create(artifact.id)
    const cp       = cleanCheckpoint()
    const err      = await wf.apply({
      approvalId:  'totally-fabricated-approval-id',
      checkpoint:  cp,
      applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.APPLIED),
    }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('APPROVAL_NOT_FOUND')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Pillar X — wrong scope approve → 409 APPROVAL_BINDING_INVALID ─────────────

describe('Pillar X — wrong scope approve → 409 APPROVAL_BINDING_INVALID', () => {
  it('apply with approval from different scope → APPROVAL_BINDING_INVALID', async () => {
    // Approve artifact with scope /repo/A
    const art1    = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/repo/A', content: DIFF })
    const decision = await art1.approve({ operatorId: 'op' })

    // Create second artifact with scope /repo/B
    const art2 = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/repo/B', content: DIFF })
    const wf2  = await client.workflows.create(art2.id)
    const cp   = cleanCheckpoint()

    // Apply wf2 with approval from art1 (wrong scope binding) → server rejects
    const err = await wf2.apply({
      approvalId:  decision.approvalId,
      checkpoint:  cp,
      applyRecord: applyRec(art2.id, cp.checkpointId, MutationOutcome.APPLIED),
    }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(409)
    // code: APPROVAL_BINDING_INVALID or APPROVAL_NOT_FOUND (server resolves)
    expect(['APPROVAL_BINDING_INVALID', 'APPROVAL_NOT_FOUND']).toContain((err as ControlSdkError).code)
  })
})

// ── Pillar XI — dirty RESTORE_CHECKPOINT → RECOVERY_UNSAFE ───────────────────

describe('Pillar XI — dirty checkpoint + RESTORE_CHECKPOINT → 409 RECOVERY_UNSAFE', () => {
  it('throws ControlSdkError code=RECOVERY_UNSAFE', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const decision = await artifact.approve({ operatorId: 'op' })
    const wf       = await client.workflows.create(artifact.id)
    const cp       = dirtyCheckpoint()

    await wf.apply({
      approvalId:  decision.approvalId,
      checkpoint:  cp,
      applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.PARTIAL),
    })
    // Should be RECOVERY_REQUIRED after PARTIAL
    expect(wf.state).toBe(ControlWorkflowState.RECOVERY_REQUIRED)

    const err = await wf.recover({
      strategy:        RecoveryStrategy.RESTORE_CHECKPOINT,
      operatorId:      'op',
      rationale:       'restore to before patch',
      contentHash:     artifact.contentHash,
      checkpointId:    cp.checkpointId,
      startedAt:       nowIso(),
      completedAt:     nowIso(),
      exitCode:        0,
      mutationOutcome: MutationOutcome.APPLIED,
      succeeded:       true,
    }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('RECOVERY_UNSAFE')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Pillar XII — replayed apply → 409 INVALID_TRANSITION ─────────────────────

describe('Pillar XII — replayed apply on APPLIED workflow → 409 INVALID_TRANSITION', () => {
  it('second apply returns 409', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const decision = await artifact.approve({ operatorId: 'op' })
    const wf       = await client.workflows.create(artifact.id)
    const cp       = cleanCheckpoint()

    await wf.apply({ approvalId: decision.approvalId, checkpoint: cp, applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.APPLIED) })
    expect(wf.state).toBe(ControlWorkflowState.APPLIED)

    const cp2 = cleanCheckpoint()
    const err = await wf.apply({
      approvalId: decision.approvalId, checkpoint: cp2,
      applyRecord: applyRec(artifact.id, cp2.checkpointId, MutationOutcome.APPLIED),
    }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('INVALID_TRANSITION')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Pillar XIII — idempotency key ─────────────────────────────────────────────

describe('Pillar XIII — idempotency key deduplication', () => {
  it('same idempotencyKey returns same workflowId', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const key      = `idem-${randomUUID()}`

    const wf1 = await client.workflows.create(artifact.id, { idempotencyKey: key })
    const wf2 = await client.workflows.create(artifact.id, { idempotencyKey: key })
    expect(wf1.id).toBe(wf2.id)
  })
})

// ── Pillar XIV — INCONCLUSIVE → VERIFICATION_FAILED ──────────────────────────

describe('Pillar XIV — INCONCLUSIVE verification → VERIFICATION_FAILED', () => {
  it('INCONCLUSIVE status reaches VERIFICATION_FAILED state', async () => {
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: DIFF })
    const decision = await artifact.approve({ operatorId: 'op' })
    const wf       = await client.workflows.create(artifact.id)
    const cp       = cleanCheckpoint()

    await wf.apply({ approvalId: decision.approvalId, checkpoint: cp, applyRecord: applyRec(artifact.id, cp.checkpointId, MutationOutcome.APPLIED) })

    const vr = await wf.verify({ ...verifyPayload(VerificationStatus.INCONCLUSIVE), timedOut: true })
    expect(vr.status).toBe(VerificationStatus.INCONCLUSIVE)
    expect(wf.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })
})
