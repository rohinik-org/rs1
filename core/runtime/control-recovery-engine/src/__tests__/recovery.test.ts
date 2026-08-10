/**
 * Stage 16E — Task 5: @rohinik-org/control-recovery-engine
 *
 * Tests establish the safety matrix that governs recovery strategy selection
 * and the negative invariants that prevent unauthorized rollback:
 *
 * Safety matrix (MutationOutcome × checkpoint condition):
 *   NOT_STARTED  × any                 → no rollback needed / allowed
 *   NO_MUTATION  × any                 → no rollback needed / allowed
 *   APPLIED      × clean (no dirty)    → REVERSE_PATCH admissible
 *   APPLIED      × dirty pre-existing  → REVERSE_PATCH still admissible (reverses only the patch)
 *                                         RESTORE_CHECKPOINT blocked (would destroy user work)
 *   PARTIAL      × attributable        → REVERSE_PATCH required; RESTORE_CHECKPOINT blocked if dirty
 *   PARTIAL      × uncertain           → MANUAL only
 *   INDETERMINATE × any                → MANUAL only; automatic reverse blocked
 *
 * Negative invariants:
 *   — VERIFICATION_FAILED alone does not authorize rollback (operator + directive required)
 *   — dirty checkpoint + RESTORE_CHECKPOINT → RECOVERY_UNSAFE
 *   — INDETERMINATE mutation + REVERSE_PATCH → RECOVERY_UNSAFE
 *   — stale checkpoint (not in store) → CHECKPOINT_NOT_FOUND
 *   — hash mismatch on directive vs artifact → HASH_MISMATCH
 *   — wrong artifactId → ARTIFACT_NOT_FOUND (surfaced via workflow)
 *   — repeated identical directiveId → idempotent (returns existing record)
 *   — different strategy on already-RECOVERED workflow → INVALID_TRANSITION
 *   — workflow not in RECOVERY_REQUIRED/RECOVERING → INVALID_TRANSITION
 *
 * Positive invariants:
 *   — REVERSE_PATCH with clean APPLIED outcome → RECOVERING → RECOVERED
 *   — REVERSE_PATCH with dirty APPLIED outcome → allowed (patch-scoped only)
 *   — MANUAL always admissible regardless of outcome
 *   — directive carries hash-bound artifact reference
 *   — recovery record correlates directiveId, workflowId, artifactId
 *   — post-recovery workflow state is RECOVERED (success) or FAILED (failure)
 *   — evidence fields on RecoveryRecord (diagnostics, stdoutRef, stderrRef)
 */

import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import {
  RecoveryEngine,
  RecoveryEngineError,
  type IssueRecoveryDirectiveRequest,
  type ExecuteRecoveryRequest,
} from '../index.js'
import {
  InMemoryWorkflowRepository,
  InMemoryCheckpointRepository,
  ControlWorkflowService,
} from '@rohinik-org/control-workflow-engine'
import {
  InMemoryControlArtifactStore,
  InMemoryApprovalStore,
  ControlApprovalService,
} from '@rohinik-org/control-approval-store'
import {
  ControlArtifactActionType,
  ControlWorkflowState,
  MutationOutcome,
  RecoveryStrategy,
  type PreMutationCheckpoint,
} from '@rohinik-org/control-protocol-v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const DIFF      = '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new\n'
const DIFF_HASH = sha256(DIFF)

function makeApprovalService() {
  return new ControlApprovalService(
    new InMemoryControlArtifactStore(),
    new InMemoryApprovalStore(),
  )
}

function makeCleanCheckpoint(workflowId: string): PreMutationCheckpoint {
  return {
    checkpointId:    randomUUID(),
    capturedAt:      new Date().toISOString(),
    headRef:         'abc123def456',
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
    headRef:         'abc123def456',
    workingTreeHash: sha256('dirty-tree'),
    indexHash:       sha256('dirty-index'),
    dirtyState: {
      hasUncommittedChanges: true,
      stagedFileCount:       1,
      unstagedFileCount:     2,
      untrackedFileCount:    0,
      files:                 ['src/other.ts', 'README.md'],
    },
    evidenceRef: workflowId,
  }
}

async function driveToRecoveryRequired(mutationOutcome: MutationOutcome, dirtyCheckpoint = false) {
  const approvals   = makeApprovalService()
  const workflows   = new InMemoryWorkflowRepository()
  const checkpoints = new InMemoryCheckpointRepository()
  const wfSvc       = new ControlWorkflowService(workflows, checkpoints, approvals)
  const engine      = new RecoveryEngine(wfSvc)

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
  const wf = await wfSvc.create(art.artifactId)
  await wfSvc.transition(wf.workflowId, ControlWorkflowState.AWAITING_APPROVAL)
  await wfSvc.approve(wf.workflowId, decision.approvalId)

  const cp = dirtyCheckpoint
    ? makeDirtyCheckpoint(wf.workflowId)
    : makeCleanCheckpoint(wf.workflowId)
  await wfSvc.saveCheckpoint(cp)
  await wfSvc.beginApply(wf.workflowId, cp.checkpointId)

  // Simulate apply result by attaching applyRecord and moving to RECOVERY_REQUIRED
  await wfSvc.attachApplyRecord(wf.workflowId, {
    artifactId:      art.artifactId,
    appliedAt:       new Date().toISOString(),
    method:          'git apply',
    exitCode:        mutationOutcome === MutationOutcome.APPLIED ? 0 : 1,
    stdout:          '',
    stderr:          '',
    mutationOutcome,
    checkpointId:    cp.checkpointId,
  })
  await wfSvc.forceState(wf.workflowId, ControlWorkflowState.RECOVERY_REQUIRED)

  return { engine, wfSvc, wf, art, cp, approvals }
}

function directiveRequest(
  workflowId: string,
  artifactId: string,
  contentHash: string,
  strategy: RecoveryStrategy,
  checkpointId?: string,
): IssueRecoveryDirectiveRequest {
  return {
    workflowId,
    artifactId,
    contentHash,
    strategy,
    operatorId: 'op-1',
    rationale:  'reverting after failed verification',
    ...(checkpointId !== undefined && { checkpointId }),
  }
}

function executeRequest(
  workflowId: string,
  directiveId: string,
  succeeded: boolean,
): ExecuteRecoveryRequest {
  const now = new Date()
  return {
    workflowId,
    directiveId,
    startedAt:       new Date(now.getTime() - 200).toISOString(),
    completedAt:     now.toISOString(),
    exitCode:        succeeded ? 0 : 1,
    mutationOutcome: succeeded ? MutationOutcome.APPLIED : MutationOutcome.INDETERMINATE,
    succeeded,
    diagnostics:     succeeded ? undefined : 'reverse patch failed',
  }
}

// ── Negative: VERIFICATION_FAILED alone does not authorize rollback ───────────

describe('VERIFICATION_FAILED alone does not authorize rollback', () => {
  it('workflow in VERIFICATION_FAILED → must transition to RECOVERY_REQUIRED first', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    // Put it back in VERIFICATION_FAILED (not RECOVERY_REQUIRED)
    await wfSvc.forceState(wf.workflowId, ControlWorkflowState.VERIFICATION_FAILED)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('operator must explicitly transition to RECOVERY_REQUIRED before directive is accepted', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    // Confirm: once in RECOVERY_REQUIRED, directive is accepted
    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    expect(directive.directiveId).toBeDefined()
    expect(directive.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
  })
})

// ── Safety matrix: NOT_STARTED / NO_MUTATION ──────────────────────────────────

describe('safety matrix: no-op outcomes', () => {
  it('NOT_STARTED + REVERSE_PATCH → RECOVERY_UNSAFE (nothing was applied)', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.NOT_STARTED)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )).rejects.toMatchObject({ code: 'RECOVERY_UNSAFE' })
  })

  it('NO_MUTATION + REVERSE_PATCH → RECOVERY_UNSAFE (no changes to reverse)', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.NO_MUTATION)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )).rejects.toMatchObject({ code: 'RECOVERY_UNSAFE' })
  })

  it('NOT_STARTED + MANUAL → allowed (operator override)', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.NOT_STARTED)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.MANUAL)
    )
    expect(directive.strategy).toBe(RecoveryStrategy.MANUAL)
  })
})

// ── Safety matrix: APPLIED ────────────────────────────────────────────────────

describe('safety matrix: APPLIED outcome', () => {
  it('APPLIED + clean checkpoint + REVERSE_PATCH → admissible', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED, false)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    expect(directive.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
  })

  it('APPLIED + dirty checkpoint + REVERSE_PATCH → admissible (reverses only the patch, not dirty files)', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED, true)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    expect(directive.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
  })

  it('APPLIED + dirty checkpoint + RESTORE_CHECKPOINT → RECOVERY_UNSAFE (would destroy user work)', async () => {
    const { engine, wf, art, cp } = await driveToRecoveryRequired(MutationOutcome.APPLIED, true)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT, cp.checkpointId)
    )).rejects.toMatchObject({ code: 'RECOVERY_UNSAFE' })
  })

  it('APPLIED + clean checkpoint + RESTORE_CHECKPOINT → admissible', async () => {
    const { engine, wf, art, cp } = await driveToRecoveryRequired(MutationOutcome.APPLIED, false)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT, cp.checkpointId)
    )
    expect(directive.strategy).toBe(RecoveryStrategy.RESTORE_CHECKPOINT)
    expect(directive.checkpointId).toBe(cp.checkpointId)
  })
})

// ── Safety matrix: PARTIAL ────────────────────────────────────────────────────

describe('safety matrix: PARTIAL outcome', () => {
  it('PARTIAL + clean checkpoint + REVERSE_PATCH → admissible', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.PARTIAL, false)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    expect(directive.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
  })

  it('PARTIAL + dirty checkpoint + RESTORE_CHECKPOINT → RECOVERY_UNSAFE', async () => {
    const { engine, wf, art, cp } = await driveToRecoveryRequired(MutationOutcome.PARTIAL, true)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT, cp.checkpointId)
    )).rejects.toMatchObject({ code: 'RECOVERY_UNSAFE' })
  })
})

// ── Safety matrix: INDETERMINATE ──────────────────────────────────────────────

describe('safety matrix: INDETERMINATE outcome', () => {
  it('INDETERMINATE + REVERSE_PATCH → RECOVERY_UNSAFE (automatic reverse blocked)', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.INDETERMINATE)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )).rejects.toMatchObject({ code: 'RECOVERY_UNSAFE' })
  })

  it('INDETERMINATE + RESTORE_CHECKPOINT → RECOVERY_UNSAFE', async () => {
    const { engine, wf, art, cp } = await driveToRecoveryRequired(MutationOutcome.INDETERMINATE)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT, cp.checkpointId)
    )).rejects.toMatchObject({ code: 'RECOVERY_UNSAFE' })
  })

  it('INDETERMINATE + MANUAL → admissible (operator takes explicit responsibility)', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.INDETERMINATE)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.MANUAL)
    )
    expect(directive.strategy).toBe(RecoveryStrategy.MANUAL)
  })
})

// ── Stale / missing checkpoint ────────────────────────────────────────────────

describe('stale or missing checkpoint', () => {
  it('RESTORE_CHECKPOINT with unknown checkpointId → CHECKPOINT_NOT_FOUND', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED, false)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT, 'ghost-cp-id')
    )).rejects.toMatchObject({ code: 'CHECKPOINT_NOT_FOUND' })
  })

  it('RESTORE_CHECKPOINT without checkpointId → CHECKPOINT_REQUIRED', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED, false)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.RESTORE_CHECKPOINT)
      // no checkpointId
    )).rejects.toMatchObject({ code: 'CHECKPOINT_REQUIRED' })
  })
})

// ── Hash / artifact binding ───────────────────────────────────────────────────

describe('hash and artifact binding', () => {
  it('REVERSE_PATCH with wrong contentHash → HASH_MISMATCH', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, 'deadbeef', RecoveryStrategy.REVERSE_PATCH)
    )).rejects.toMatchObject({ code: 'HASH_MISMATCH' })
  })

  it('directive carries contentHash bound to artifact at issuance', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    expect(directive.contentHash).toBe(DIFF_HASH)
    expect(directive.artifactId).toBe(art.artifactId)
    expect(directive.workflowId).toBe(wf.workflowId)
  })
})

// ── Workflow state guard ──────────────────────────────────────────────────────

describe('workflow state guard for issueDirective', () => {
  it('workflow not in RECOVERY_REQUIRED → INVALID_TRANSITION', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    await wfSvc.forceState(wf.workflowId, ControlWorkflowState.VERIFICATION_FAILED)

    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('unknown workflowId → WORKFLOW_NOT_FOUND', async () => {
    const engine = new RecoveryEngine(
      new ControlWorkflowService(
        new InMemoryWorkflowRepository(),
        new InMemoryCheckpointRepository(),
        makeApprovalService(),
      )
    )
    await expect(engine.issueDirective(
      directiveRequest('bad-id', 'art-1', DIFF_HASH, RecoveryStrategy.MANUAL)
    )).rejects.toMatchObject({ code: 'WORKFLOW_NOT_FOUND' })
  })
})

// ── Execute recovery ──────────────────────────────────────────────────────────

describe('executeRecovery()', () => {
  it('successful REVERSE_PATCH execution → RECOVERED workflow state', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )

    const record = await engine.executeRecovery(executeRequest(wf.workflowId, directive.directiveId, true))

    expect(record.succeeded).toBe(true)
    expect(record.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.RECOVERED)
  })

  it('failed REVERSE_PATCH execution → FAILED workflow state', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )

    const record = await engine.executeRecovery(executeRequest(wf.workflowId, directive.directiveId, false))

    expect(record.succeeded).toBe(false)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.FAILED)
  })

  it('recovery record correlates directiveId, workflowId, artifactId', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    const record = await engine.executeRecovery(executeRequest(wf.workflowId, directive.directiveId, true))

    expect(record.directiveId).toBe(directive.directiveId)
    expect(record.workflowId).toBe(wf.workflowId)
    expect(record.artifactId).toBe(art.artifactId)
  })

  it('workflow carries recovery record after executeRecovery()', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    const record = await engine.executeRecovery(executeRequest(wf.workflowId, directive.directiveId, true))

    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.recovery).toBeDefined()
    expect(updated!.recovery!.directiveId).toBe(record.directiveId)
  })

  it('evidence fields on RecoveryRecord', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    const record = await engine.executeRecovery({
      ...executeRequest(wf.workflowId, directive.directiveId, true),
      stdoutRef: 'evidence://recovery-1/stdout',
      stderrRef: 'evidence://recovery-1/stderr',
    })

    expect(record.stdoutRef).toBe('evidence://recovery-1/stdout')
    expect(record.stderrRef).toBe('evidence://recovery-1/stderr')
  })

  it('executeRecovery() on unknown directiveId → DIRECTIVE_NOT_FOUND', async () => {
    const { engine, wf } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    // Still need to enter RECOVERING state
    await expect(engine.executeRecovery(executeRequest(wf.workflowId, 'ghost-dir-id', true)))
      .rejects.toMatchObject({ code: 'DIRECTIVE_NOT_FOUND' })
  })
})

// ── Idempotent replay ─────────────────────────────────────────────────────────

describe('idempotent / conflict detection', () => {
  it('repeated issueDirective with same directiveId → returns existing directive', async () => {
    const { engine, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    const id = randomUUID()
    const req = { ...directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH), directiveId: id }

    const d1 = await engine.issueDirective(req)
    const d2 = await engine.issueDirective(req)

    expect(d1.directiveId).toBe(d2.directiveId)
  })

  it('different strategy against already-RECOVERED workflow → INVALID_TRANSITION', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.APPLIED)
    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.REVERSE_PATCH)
    )
    await engine.executeRecovery(executeRequest(wf.workflowId, directive.directiveId, true))

    // Workflow is now RECOVERED — issuing another directive must fail
    await expect(engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.MANUAL)
    )).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })
})

// ── MANUAL recovery ───────────────────────────────────────────────────────────

describe('MANUAL recovery', () => {
  it('MANUAL directive → RECOVERING → RECOVERED on success', async () => {
    const { engine, wfSvc, wf, art } = await driveToRecoveryRequired(MutationOutcome.INDETERMINATE)

    const directive = await engine.issueDirective(
      directiveRequest(wf.workflowId, art.artifactId, DIFF_HASH, RecoveryStrategy.MANUAL)
    )
    const record = await engine.executeRecovery(executeRequest(wf.workflowId, directive.directiveId, true))

    expect(record.strategy).toBe(RecoveryStrategy.MANUAL)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.RECOVERED)
  })
})
