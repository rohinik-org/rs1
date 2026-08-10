/**
 * Stage 16E — Task 3: @rohinik-org/control-workflow-engine
 *
 * Tests prove the workflow state machine, checkpoint persistence,
 * and the critical resume rule before any execution layer is built:
 *
 *   — ControlWorkflowRecord shape and correlation fields
 *   — transition service: valid transitions accepted
 *   — transition service: invalid transitions rejected with INVALID_TRANSITION
 *   — terminal immutability: no transition out of terminal states
 *   — idempotency: same idempotency key returns existing record
 *   — resume rule: AWAITING_APPROVAL + bare approvalId string → REJECTED
 *     (approval store must confirm binding; "I approved it earlier" is not enough)
 *   — resume rule: valid approvalId with correct binding → APPROVED transition accepted
 *   — PreMutationCheckpoint persistence: store, load, correlate to workflow
 *   — dirty working-tree checkpoint: captured state survives round-trip intact
 *   — dirty-tree guard: checkpoint with pre-existing uncommitted changes flags
 *     hasUncommittedChanges=true; transition to APPLYING is still allowed (guard
 *     is informational at this layer — T5 decides recovery safety)
 *   — workflow not found: load returns null, transitions throw WORKFLOW_NOT_FOUND
 *   — artifact/approval correlation: workflow carries artifactId and approvalId
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  InMemoryWorkflowRepository,
  InMemoryCheckpointRepository,
  ControlWorkflowService,
  ControlWorkflowError,
} from '../index.js'
import {
  InMemoryControlArtifactStore,
  InMemoryApprovalStore,
  ControlApprovalService,
} from '@rohinik-org/control-approval-store'
import {
  ControlArtifactActionType,
  ControlWorkflowState,
  type PreMutationCheckpoint,
} from '@rohinik-org/control-protocol-v1'
import { createHash } from 'node:crypto'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const DIFF = '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new\n'
const DIFF_HASH = sha256(DIFF)

function makeApprovalService() {
  return new ControlApprovalService(
    new InMemoryControlArtifactStore(),
    new InMemoryApprovalStore(),
  )
}

function makeServices(approvals = makeApprovalService()) {
  const workflows   = new InMemoryWorkflowRepository()
  const checkpoints = new InMemoryCheckpointRepository()
  const svc         = new ControlWorkflowService(workflows, checkpoints, approvals)
  return { workflows, checkpoints, svc, approvals }
}

async function registerAndApprove(approvals: ControlApprovalService) {
  const art = await approvals.registerArtifact({
    actionType: ControlArtifactActionType.FILE_PATCH,
    scope:      '/repo/main',
    content:    DIFF,
  })
  const decision = await approvals.approve(art.artifactId, {
    contentHash: DIFF_HASH,
    actionType:  ControlArtifactActionType.FILE_PATCH,
    scope:       '/repo/main',
    operatorId:  'op-1',
  })
  return { art, decision }
}

function makeCleanCheckpoint(artifactId: string, workflowId: string): PreMutationCheckpoint {
  return {
    checkpointId:    randomUUID(),
    capturedAt:      new Date().toISOString(),
    headRef:         'abcdef1234567890abcdef1234567890abcdef12',
    workingTreeHash: sha256('clean-tree'),
    indexHash:       sha256('clean-index'),
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

function makeDirtyCheckpoint(workflowId: string): PreMutationCheckpoint {
  return {
    checkpointId:    randomUUID(),
    capturedAt:      new Date().toISOString(),
    headRef:         'abcdef1234567890abcdef1234567890abcdef12',
    workingTreeHash: sha256('dirty-tree'),
    indexHash:       sha256('dirty-index'),
    dirtyState: {
      hasUncommittedChanges: true,
      stagedFileCount:       2,
      unstagedFileCount:     1,
      untrackedFileCount:    3,
      files:                 ['src/foo.ts', 'src/bar.ts', 'README.md'],
    },
    evidenceRef: workflowId,
  }
}

// ── ControlWorkflowRecord ─────────────────────────────────────────────────────

describe('ControlWorkflowRecord shape', () => {
  it('create() returns record with required correlation fields', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)

    expect(wf.workflowId).toBeDefined()
    expect(wf.artifactId).toBe(art.artifactId)
    expect(wf.state).toBe(ControlWorkflowState.DRAFT)
    expect(wf.createdAt).toBeDefined()
    expect(wf.updatedAt).toBeDefined()
    expect(wf.approvalId).toBeUndefined()
    expect(wf.checkpointId).toBeUndefined()
  })

  it('load() returns created workflow', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)

    const loaded = await svc.load(wf.workflowId)
    expect(loaded).not.toBeNull()
    expect(loaded!.workflowId).toBe(wf.workflowId)
    expect(loaded!.artifactId).toBe(art.artifactId)
  })

  it('load() returns null for unknown workflowId', async () => {
    const { svc } = makeServices()
    expect(await svc.load('nonexistent')).toBeNull()
  })
})

// ── Transition service ────────────────────────────────────────────────────────

describe('valid state transitions', () => {
  it('DRAFT → AWAITING_APPROVAL', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)

    const updated = await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    expect(updated.state).toBe(ControlWorkflowState.AWAITING_APPROVAL)
    expect(updated.updatedAt >= wf.updatedAt).toBe(true)
  })

  it('DRAFT → CANCELLED', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)

    const updated = await svc.transition(wf.workflowId, ControlWorkflowState.CANCELLED)
    expect(updated.state).toBe(ControlWorkflowState.CANCELLED)
  })

  it('AWAITING_APPROVAL → APPROVED sets approvalId', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)

    const approved = await svc.approve(wf.workflowId, decision.approvalId)
    expect(approved.state).toBe(ControlWorkflowState.APPROVED)
    expect(approved.approvalId).toBe(decision.approvalId)
  })

  it('APPROVED → APPLYING sets checkpointId', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)

    const cp = makeCleanCheckpoint(art.artifactId, wf.workflowId)
    await svc.saveCheckpoint(cp)

    const applying = await svc.beginApply(wf.workflowId, cp.checkpointId)
    expect(applying.state).toBe(ControlWorkflowState.APPLYING)
    expect(applying.checkpointId).toBe(cp.checkpointId)
  })
})

describe('invalid transitions', () => {
  it('INVALID_TRANSITION: DRAFT → APPROVED (skips AWAITING_APPROVAL)', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)

    await expect(svc.transition(wf.workflowId, ControlWorkflowState.APPROVED))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('INVALID_TRANSITION: DRAFT → APPLYING (skips multiple states)', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)

    await expect(svc.transition(wf.workflowId, ControlWorkflowState.APPLYING))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('WORKFLOW_NOT_FOUND: transition on unknown workflowId', async () => {
    const { svc } = makeServices()

    await expect(svc.transition('bad-id', ControlWorkflowState.AWAITING_APPROVAL))
      .rejects.toMatchObject({ code: 'WORKFLOW_NOT_FOUND' })
  })
})

// ── Terminal immutability ─────────────────────────────────────────────────────

describe('terminal immutability', () => {
  it('VERIFIED: no further transitions', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    // Drive to VERIFIED via direct state injection (test helper)
    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)
    const cp = makeCleanCheckpoint(art.artifactId, wf.workflowId)
    await svc.saveCheckpoint(cp)
    await svc.beginApply(wf.workflowId, cp.checkpointId)
    await svc.forceState(wf.workflowId, ControlWorkflowState.VERIFIED)

    await expect(svc.transition(wf.workflowId, ControlWorkflowState.CANCELLED))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('CANCELLED: no further transitions', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.CANCELLED)

    await expect(svc.transition(wf.workflowId, ControlWorkflowState.DRAFT))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('FAILED: no further transitions', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)
    await svc.forceState(wf.workflowId, ControlWorkflowState.FAILED)

    await expect(svc.transition(wf.workflowId, ControlWorkflowState.RECOVERING))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('RECOVERED: no further transitions', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)
    await svc.forceState(wf.workflowId, ControlWorkflowState.RECOVERED)

    await expect(svc.transition(wf.workflowId, ControlWorkflowState.FAILED))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })
})

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('idempotency keys', () => {
  it('create with same idempotency key returns existing workflow', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const key = `idem-${randomUUID()}`

    const wf1 = await svc.create(art.artifactId, { idempotencyKey: key })
    const wf2 = await svc.create(art.artifactId, { idempotencyKey: key })

    expect(wf1.workflowId).toBe(wf2.workflowId)
  })

  it('create with different idempotency keys creates distinct workflows', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)

    const wf1 = await svc.create(art.artifactId, { idempotencyKey: 'key-a' })
    const wf2 = await svc.create(art.artifactId, { idempotencyKey: 'key-b' })

    expect(wf1.workflowId).not.toBe(wf2.workflowId)
  })

  it('create without idempotency key always creates new workflow', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)

    const wf1 = await svc.create(art.artifactId)
    const wf2 = await svc.create(art.artifactId)

    expect(wf1.workflowId).not.toBe(wf2.workflowId)
  })
})

// ── THE RESUME RULE ───────────────────────────────────────────────────────────
// Resume continues from durable authoritative state.
// "I approved this earlier" does not authorize a transition.
// The approval store must confirm the exact binding.

describe('resume rule — approval must be confirmed by store', () => {
  it('AWAITING_APPROVAL + fabricated approvalId string → NO_APPROVAL error', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)

    // Client claims approval with a fabricated ID not in the store
    await expect(svc.approve(wf.workflowId, 'fabricated-approval-id'))
      .rejects.toMatchObject({ code: 'APPROVAL_NOT_FOUND' })
  })

  it('AWAITING_APPROVAL + real approvalId but binding scope mismatch → APPROVAL_BINDING_INVALID', async () => {
    const { svc, approvals } = makeServices()

    // Register artifact scoped to /repo/main
    const art = await approvals.registerArtifact({
      actionType: ControlArtifactActionType.FILE_PATCH,
      scope:      '/repo/main',
      content:    DIFF,
    })
    // Get approval for /repo/main
    const decision = await approvals.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo/main',
      operatorId:  'op-1',
    })

    // Create a SECOND artifact with a different scope
    const art2 = await approvals.registerArtifact({
      actionType: ControlArtifactActionType.FILE_PATCH,
      scope:      '/repo/feature-branch',
      content:    DIFF,
    })
    const wf2 = await svc.create(art2.artifactId)
    await svc.transition(wf2.workflowId, ControlWorkflowState.AWAITING_APPROVAL)

    // Try to use art1's approval for art2's workflow — different artifactId in binding
    await expect(svc.approve(wf2.workflowId, decision.approvalId))
      .rejects.toMatchObject({ code: 'APPROVAL_BINDING_INVALID' })
  })

  it('AWAITING_APPROVAL + expired approvalId → APPROVAL_EXPIRED', async () => {
    const { svc, approvals } = makeServices()
    const art = await approvals.registerArtifact({
      actionType: ControlArtifactActionType.FILE_PATCH,
      scope:      '/repo/main',
      content:    DIFF,
    })
    const past = new Date(Date.now() - 5000).toISOString()
    const decision = await approvals.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo/main',
      operatorId:  'op-1',
      expiresAt:   past,
    })

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)

    await expect(svc.approve(wf.workflowId, decision.approvalId))
      .rejects.toMatchObject({ code: 'APPROVAL_EXPIRED' })
  })

  it('approve() on non-AWAITING_APPROVAL workflow throws INVALID_TRANSITION', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    // Workflow still in DRAFT — not yet awaiting approval
    const wf = await svc.create(art.artifactId)

    await expect(svc.approve(wf.workflowId, decision.approvalId))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('valid approvalId with correct binding advances state to APPROVED', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    const approved = await svc.approve(wf.workflowId, decision.approvalId)

    expect(approved.state).toBe(ControlWorkflowState.APPROVED)
    expect(approved.approvalId).toBe(decision.approvalId)
  })
})

// ── PreMutationCheckpoint persistence ────────────────────────────────────────

describe('PreMutationCheckpoint persistence', () => {
  it('saveCheckpoint() stores and loadCheckpoint() retrieves clean checkpoint', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)

    const cp = makeCleanCheckpoint(art.artifactId, wf.workflowId)
    await svc.saveCheckpoint(cp)

    const loaded = await svc.loadCheckpoint(cp.checkpointId)
    expect(loaded).not.toBeNull()
    expect(loaded!.checkpointId).toBe(cp.checkpointId)
    expect(loaded!.headRef).toBe(cp.headRef)
    expect(loaded!.workingTreeHash).toBe(cp.workingTreeHash)
    expect(loaded!.indexHash).toBe(cp.indexHash)
    expect(loaded!.dirtyState.hasUncommittedChanges).toBe(false)
    expect(loaded!.dirtyState.files).toHaveLength(0)
  })

  it('loadCheckpoint() returns null for unknown checkpointId', async () => {
    const { svc } = makeServices()
    expect(await svc.loadCheckpoint('nonexistent')).toBeNull()
  })

  it('dirty working-tree checkpoint: all dirty-state fields survive round-trip', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)
    const wf = await svc.create(art.artifactId)

    const cp = makeDirtyCheckpoint(wf.workflowId)
    await svc.saveCheckpoint(cp)

    const loaded = await svc.loadCheckpoint(cp.checkpointId)
    expect(loaded!.dirtyState.hasUncommittedChanges).toBe(true)
    expect(loaded!.dirtyState.stagedFileCount).toBe(2)
    expect(loaded!.dirtyState.unstagedFileCount).toBe(1)
    expect(loaded!.dirtyState.untrackedFileCount).toBe(3)
    expect(loaded!.dirtyState.files).toEqual(['src/foo.ts', 'src/bar.ts', 'README.md'])
  })

  it('dirty-tree: transition to APPLYING still allowed (guard is informational at this layer)', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)

    const cp = makeDirtyCheckpoint(wf.workflowId)
    await svc.saveCheckpoint(cp)

    // T5 decides whether this is safe for recovery; T3 does not block it
    const applying = await svc.beginApply(wf.workflowId, cp.checkpointId)
    expect(applying.state).toBe(ControlWorkflowState.APPLYING)
    expect(applying.checkpointId).toBe(cp.checkpointId)
  })

  it('beginApply() requires CHECKPOINT_REQUIRED if no checkpointId provided', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)

    await expect(svc.beginApply(wf.workflowId, undefined as unknown as string))
      .rejects.toMatchObject({ code: 'CHECKPOINT_REQUIRED' })
  })

  it('beginApply() requires CHECKPOINT_NOT_FOUND if checkpointId not in store', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)

    await expect(svc.beginApply(wf.workflowId, 'ghost-checkpoint-id'))
      .rejects.toMatchObject({ code: 'CHECKPOINT_NOT_FOUND' })
  })
})

// ── Workflow artifact/approval correlation ────────────────────────────────────

describe('workflow correlation', () => {
  it('workflow carries artifactId throughout lifecycle', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    const approved = await svc.approve(wf.workflowId, decision.approvalId)

    expect(approved.artifactId).toBe(art.artifactId)
  })

  it('workflow correlates to approvalId after approve()', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)

    const loaded = await svc.load(wf.workflowId)
    expect(loaded!.approvalId).toBe(decision.approvalId)
  })

  it('workflow correlates to checkpointId after beginApply()', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)
    const cp = makeCleanCheckpoint(art.artifactId, wf.workflowId)
    await svc.saveCheckpoint(cp)
    await svc.beginApply(wf.workflowId, cp.checkpointId)

    const loaded = await svc.load(wf.workflowId)
    expect(loaded!.checkpointId).toBe(cp.checkpointId)
  })

  it('listByArtifact() returns all workflows for an artifact', async () => {
    const { svc, approvals } = makeServices()
    const { art } = await registerAndApprove(approvals)

    await svc.create(art.artifactId)
    await svc.create(art.artifactId)

    const list = await svc.listByArtifact(art.artifactId)
    expect(list).toHaveLength(2)
    expect(list.every(w => w.artifactId === art.artifactId)).toBe(true)
  })
})

// ── Resume by reference ───────────────────────────────────────────────────────

describe('resume by workflow/checkpoint reference', () => {
  it('resumed workflow reads authoritative state from repository', async () => {
    const approvals = makeApprovalService()
    const workflows = new InMemoryWorkflowRepository()
    const checkpoints = new InMemoryCheckpointRepository()
    const svc = new ControlWorkflowService(workflows, checkpoints, approvals)
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)

    // Simulate resume: new service instance, same stores
    const svc2 = new ControlWorkflowService(workflows, checkpoints, approvals)
    const resumed = await svc2.load(wf.workflowId)

    expect(resumed!.state).toBe(ControlWorkflowState.APPROVED)
    expect(resumed!.approvalId).toBe(decision.approvalId)
  })

  it('resumed workflow cannot re-approve if already APPROVED', async () => {
    const { svc, approvals } = makeServices()
    const { art, decision } = await registerAndApprove(approvals)

    const wf = await svc.create(art.artifactId)
    await svc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
    await svc.approve(wf.workflowId, decision.approvalId)

    // Already in APPROVED — approve() again should fail INVALID_TRANSITION
    await expect(svc.approve(wf.workflowId, decision.approvalId))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })
})
