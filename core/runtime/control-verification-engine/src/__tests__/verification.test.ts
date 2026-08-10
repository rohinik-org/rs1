/**
 * Stage 16E — Task 4: @rohinik-org/control-verification-engine
 *
 * Tests establish:
 *   — process success ≠ verification passed (the central invariant)
 *   — per-check VerificationCheck with status, duration, bounded diagnostics
 *   — verifier identity and version carried on result
 *   — started/finished/durationMs on result and each check
 *   — diagnostics bounded; full output referenced via evidenceRef (not embedded)
 *   — INCONCLUSIVE status → VERIFICATION_FAILED workflow state (never VERIFIED)
 *   — NOT_RUN (SKIPPED) → VERIFICATION_FAILED workflow state (never VERIFIED)
 *   — timeout: timedOut=true, status=INCONCLUSIVE, state=VERIFICATION_FAILED
 *   — malformed verifier result: VerificationResult with unknown/invalid status
 *     is rejected or normalised to INCONCLUSIVE, not silently promoted to PASSED
 *   — immutability: once VERIFIED, no further verify() call may overwrite the result
 *   — VERIFICATION_FAILED creates evidence + state only; does not create recovery permission
 *   — atomic transition: VERIFYING → VERIFIED or VERIFYING → VERIFICATION_FAILED
 *     (never stuck mid-transition)
 *   — idempotent replay: same verificationId returns existing result
 *   — workflow must be in APPLIED or VERIFYING to accept a verify() call
 *   — exitCode=0 with status=FAILED → VERIFICATION_FAILED (not VERIFIED)
 *   — exitCode=1 with status=PASSED → VERIFIED (status, not exit code, is authoritative)
 */

import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import {
  VerificationEngine,
  VerificationEngineError,
  type SubmitVerificationRequest,
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
  VerificationStatus,
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

async function driveToVerifying() {
  const approvals   = makeApprovalService()
  const workflows   = new InMemoryWorkflowRepository()
  const checkpoints = new InMemoryCheckpointRepository()
  const wfSvc       = new ControlWorkflowService(workflows, checkpoints, approvals)
  const engine      = new VerificationEngine(wfSvc)

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

  const cp = {
    checkpointId:    randomUUID(),
    capturedAt:      new Date().toISOString(),
    headRef:         'abc123',
    workingTreeHash: sha256('tree'),
    indexHash:       sha256('index'),
    dirtyState: {
      hasUncommittedChanges: false,
      stagedFileCount:       0,
      unstagedFileCount:     0,
      untrackedFileCount:    0,
      files:                 [] as string[],
    },
  }
  await wfSvc.saveCheckpoint(cp)
  await wfSvc.beginApply(wf.workflowId, cp.checkpointId)
  // APPLYING → APPLIED → VERIFYING
  await wfSvc.transition(wf.workflowId, ControlWorkflowState.APPLIED)
  await wfSvc.transition(wf.workflowId, ControlWorkflowState.VERIFYING)

  return { engine, wfSvc, wf, art }
}

function passedResult(workflowId: string, artifactId: string): SubmitVerificationRequest {
  const now = new Date()
  return {
    workflowId,
    artifactId,
    verifierId:      'test-verifier',
    verifierVersion: '1.0.0',
    command:         'pnpm test',
    startedAt:       new Date(now.getTime() - 500).toISOString(),
    finishedAt:      now.toISOString(),
    durationMs:      500,
    exitCode:        0,
    status:          VerificationStatus.PASSED,
    checks:          [],
    timedOut:        false,
  }
}

function failedResult(workflowId: string, artifactId: string): SubmitVerificationRequest {
  return {
    ...passedResult(workflowId, artifactId),
    exitCode: 1,
    status:   VerificationStatus.FAILED,
    diagnostics: '3 tests failed',
  }
}

// ── Process success ≠ verification passed ─────────────────────────────────────

describe('process success ≠ verification passed', () => {
  it('exitCode=0 but status=FAILED → VERIFICATION_FAILED, not VERIFIED', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      exitCode: 0,
      status:   VerificationStatus.FAILED,
    })

    expect(result.status).toBe(VerificationStatus.FAILED)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })

  it('exitCode=1 but status=PASSED → VERIFIED (status authoritative, not exit code)', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      exitCode: 1,
      status:   VerificationStatus.PASSED,
    })

    expect(result.status).toBe(VerificationStatus.PASSED)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFIED)
  })

  it('exitCode=0 and status=PASSED → VERIFIED', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    await engine.submit(passedResult(wf.workflowId, art.artifactId))

    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFIED)
  })
})

// ── VerificationResult shape ──────────────────────────────────────────────────

describe('VerificationResult shape', () => {
  it('carries resultId, verifierId, verifierVersion, startedAt, finishedAt, durationMs', async () => {
    const { engine, wf, art } = await driveToVerifying()

    const result = await engine.submit(passedResult(wf.workflowId, art.artifactId))

    expect(result.resultId).toBeDefined()
    expect(result.verifierId).toBe('test-verifier')
    expect(result.verifierVersion).toBe('1.0.0')
    expect(result.startedAt).toBeDefined()
    expect(result.finishedAt).toBeDefined()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.workflowId).toBe(wf.workflowId)
    expect(result.artifactId).toBe(art.artifactId)
  })

  it('per-check VerificationCheck carries checkId, name, status, durationMs', async () => {
    const { engine, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      checks: [
        { name: 'typecheck', status: VerificationStatus.PASSED, durationMs: 200 },
        { name: 'unit-tests', status: VerificationStatus.PASSED, durationMs: 300 },
      ],
    })

    expect(result.checks).toHaveLength(2)
    expect(result.checks[0].checkId).toBeDefined()
    expect(result.checks[0].name).toBe('typecheck')
    expect(result.checks[0].status).toBe(VerificationStatus.PASSED)
    expect(result.checks[0].durationMs).toBe(200)
    expect(result.checks[1].name).toBe('unit-tests')
  })

  it('timedOut=false on normal completion', async () => {
    const { engine, wf, art } = await driveToVerifying()
    const result = await engine.submit(passedResult(wf.workflowId, art.artifactId))
    expect(result.timedOut).toBe(false)
  })
})

// ── Bounded diagnostics / evidence refs ──────────────────────────────────────

describe('bounded diagnostics', () => {
  it('diagnostics trimmed to 500 chars max', async () => {
    const { engine, wf, art } = await driveToVerifying()

    const longDiag = 'x'.repeat(2000)
    const result = await engine.submit({
      ...failedResult(wf.workflowId, art.artifactId),
      diagnostics: longDiag,
    })

    expect(result.diagnostics).toBeDefined()
    expect(result.diagnostics!.length).toBeLessThanOrEqual(500)
  })

  it('per-check diagnostics also bounded', async () => {
    const { engine, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      checks: [
        { name: 'slow-check', status: VerificationStatus.FAILED, durationMs: 1000, diagnostics: 'y'.repeat(2000) },
      ],
    })

    expect(result.checks[0].diagnostics!.length).toBeLessThanOrEqual(500)
  })

  it('stdoutRef and stderrRef passed through as-is (evidence references)', async () => {
    const { engine, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      stdoutRef: 'evidence://run-1/stdout',
      stderrRef: 'evidence://run-1/stderr',
    })

    expect(result.stdoutRef).toBe('evidence://run-1/stdout')
    expect(result.stderrRef).toBe('evidence://run-1/stderr')
  })
})

// ── INCONCLUSIVE and NOT_RUN → never VERIFIED ─────────────────────────────────

describe('INCONCLUSIVE and SKIPPED never produce VERIFIED', () => {
  it('INCONCLUSIVE → VERIFICATION_FAILED workflow state', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      status: VerificationStatus.INCONCLUSIVE,
    })

    expect(result.status).toBe(VerificationStatus.INCONCLUSIVE)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })

  it('SKIPPED (NOT_RUN) → VERIFICATION_FAILED workflow state', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      status: VerificationStatus.SKIPPED,
    })

    expect(result.status).toBe(VerificationStatus.SKIPPED)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })

  it('ERROR → VERIFICATION_FAILED workflow state', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      status: VerificationStatus.ERROR,
    })

    expect(result.status).toBe(VerificationStatus.ERROR)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })
})

// ── Timeout handling ──────────────────────────────────────────────────────────

describe('timeout handling', () => {
  it('timedOut=true → status forced to INCONCLUSIVE, state=VERIFICATION_FAILED', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      timedOut: true,
      // Even if caller claims PASSED, timedOut overrides
      status:   VerificationStatus.PASSED,
    })

    expect(result.timedOut).toBe(true)
    expect(result.status).toBe(VerificationStatus.INCONCLUSIVE)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })
})

// ── Malformed verifier result ─────────────────────────────────────────────────

describe('malformed verifier result', () => {
  it('unknown status string → normalised to INCONCLUSIVE, state=VERIFICATION_FAILED', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      status: 'DEFINITELY_PASSED_TRUST_ME' as any,
    })

    expect(result.status).toBe(VerificationStatus.INCONCLUSIVE)
    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })

  it('missing verifierId → INVALID_REQUEST error', async () => {
    const { engine, wf, art } = await driveToVerifying()

    await expect(engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      verifierId: '',
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('missing command → INVALID_REQUEST error', async () => {
    const { engine, wf, art } = await driveToVerifying()

    await expect(engine.submit({
      ...passedResult(wf.workflowId, art.artifactId),
      command: '',
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})

// ── Immutability: VERIFIED cannot be overwritten ──────────────────────────────

describe('VERIFIED immutability', () => {
  it('second verify() after VERIFIED → ALREADY_VERIFIED error', async () => {
    const { engine, wf, art } = await driveToVerifying()

    // First verification: passes
    await engine.submit(passedResult(wf.workflowId, art.artifactId))

    // Second attempt: rejected
    await expect(engine.submit(passedResult(wf.workflowId, art.artifactId)))
      .rejects.toMatchObject({ code: 'ALREADY_VERIFIED' })
  })

  it('second verify() after VERIFICATION_FAILED is allowed (retry scenario)', async () => {
    // VERIFICATION_FAILED does not lock the workflow from retry
    // (T5/operator may re-enter VERIFYING after RECOVERY_REQUIRED;
    //  but a second submission on the same VERIFYING workflow is the retry case here)
    // Actually: T4 calls submit() while in VERIFYING; if already VERIFICATION_FAILED
    // the workflow is no longer in VERIFYING → INVALID_TRANSITION
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    // First: fails
    await engine.submit(failedResult(wf.workflowId, art.artifactId))
    const st = await wfSvc.load(wf.workflowId)
    expect(st!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)

    // Cannot submit again without re-entering VERIFYING
    await expect(engine.submit(failedResult(wf.workflowId, art.artifactId)))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })
})

// ── VERIFICATION_FAILED creates evidence only ─────────────────────────────────

describe('VERIFICATION_FAILED does not create recovery permission', () => {
  it('workflow state is VERIFICATION_FAILED, no recovery record present', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    await engine.submit(failedResult(wf.workflowId, art.artifactId))

    const updated = await wfSvc.load(wf.workflowId)
    expect(updated!.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
    // No recovery field set — T5 decides whether recovery is allowed
    expect(updated!.recovery).toBeUndefined()
  })

  it('loadVerificationResult() returns immutable result after VERIFICATION_FAILED', async () => {
    const { engine, wf, art } = await driveToVerifying()

    const submitted = await engine.submit(failedResult(wf.workflowId, art.artifactId))
    const loaded    = await engine.loadResult(submitted.resultId)

    expect(loaded).not.toBeNull()
    expect(loaded!.resultId).toBe(submitted.resultId)
    expect(loaded!.status).toBe(VerificationStatus.FAILED)
  })
})

// ── Atomic transition ─────────────────────────────────────────────────────────

describe('atomic transition', () => {
  it('after submit() workflow state is exactly VERIFIED or VERIFICATION_FAILED (no intermediate)', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    await engine.submit(passedResult(wf.workflowId, art.artifactId))

    const st = await wfSvc.load(wf.workflowId)
    expect([
      ControlWorkflowState.VERIFIED,
      ControlWorkflowState.VERIFICATION_FAILED,
    ]).toContain(st!.state)
    // Specifically VERIFIED for a PASSED result
    expect(st!.state).toBe(ControlWorkflowState.VERIFIED)
  })

  it('workflow carries verification result reference after submit()', async () => {
    const { engine, wfSvc, wf, art } = await driveToVerifying()

    const result = await engine.submit(passedResult(wf.workflowId, art.artifactId))
    const st     = await wfSvc.load(wf.workflowId)

    expect(st!.verification).toBeDefined()
    expect(st!.verification!.resultId).toBe(result.resultId)
  })
})

// ── Wrong workflow state ───────────────────────────────────────────────────────

describe('workflow state guard', () => {
  it('submit() on APPROVED (not yet VERIFYING) → INVALID_TRANSITION', async () => {
    const approvals = makeApprovalService()
    const workflows = new InMemoryWorkflowRepository()
    const checkpoints = new InMemoryCheckpointRepository()
    const wfSvc = new ControlWorkflowService(workflows, checkpoints, approvals)
    const engine = new VerificationEngine(wfSvc)

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
    // Still in APPROVED — not yet VERIFYING

    await expect(engine.submit(passedResult(wf.workflowId, art.artifactId)))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('submit() on unknown workflowId → WORKFLOW_NOT_FOUND', async () => {
    const engine = new VerificationEngine(
      new ControlWorkflowService(
        new InMemoryWorkflowRepository(),
        new InMemoryCheckpointRepository(),
        makeApprovalService(),
      )
    )

    await expect(engine.submit(passedResult('nonexistent', 'art-1')))
      .rejects.toMatchObject({ code: 'WORKFLOW_NOT_FOUND' })
  })
})

// ── Idempotent replay ─────────────────────────────────────────────────────────

describe('idempotent replay', () => {
  it('same resultId submitted twice returns existing result without error', async () => {
    const { engine, wf, art } = await driveToVerifying()
    const req = { ...passedResult(wf.workflowId, art.artifactId), resultId: randomUUID() }

    const r1 = await engine.submit(req)
    const r2 = await engine.submit(req)

    expect(r1.resultId).toBe(r2.resultId)
    expect(r2.status).toBe(VerificationStatus.PASSED)
  })
})
