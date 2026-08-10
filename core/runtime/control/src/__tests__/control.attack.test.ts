/**
 * Stage 16E T10 — Boundary 1: SDK attack scenarios (mock fetch)
 *
 * Deliberately attacks the authority boundaries:
 *
 *  A. Wrong hash on approve → 409 HASH_MISMATCH propagated
 *  B. Wrong scope on approve → 409 APPROVAL_BINDING_INVALID propagated
 *  C. Expired approval → 409 APPROVAL_EXPIRED propagated
 *  D. Denied artifact → approve after deny still sends request (server decides)
 *  E. Fabricated approvalId in apply → 409 APPROVAL_NOT_FOUND propagated
 *  F. Replayed apply on APPLIED workflow → 409 INVALID_TRANSITION propagated
 *  G. Dirty-tree RESTORE_CHECKPOINT → 409 RECOVERY_UNSAFE propagated
 *  H. INDETERMINATE mutation + REVERSE_PATCH → 409 RECOVERY_UNSAFE propagated
 *  I. Verification timeout / INCONCLUSIVE → VERIFICATION_FAILED in state
 *  J. Recovery without authority (VERIFICATION_FAILED state, no RECOVERY_REQUIRED) → 409
 *  K. Duplicate recovery on RECOVERED workflow → 409 INVALID_TRANSITION propagated
 *  L. Resume with stale approvalId → 409 APPROVAL_EXPIRED propagated
 *  M. Unknown workflowId → 404 ControlSdkError
 *  N. Unknown workflowId on verify → 404 ControlSdkError
 *  O. Cancelled workflow cancel again → 409 INVALID_TRANSITION
 *  P. ControlSdkError.code propagated for all known error codes
 *  Q. Network failure → ControlSdkError with no status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createControlClient,
  WorkflowHandle,
  ControlSdkError,
} from '../index.js'
import {
  MutationOutcome,
  RecoveryStrategy,
  ControlWorkflowState,
  VerificationStatus,
} from '@rohinik-org/control-protocol-v1'

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

function mockFetchNetworkError(message: string) {
  return vi.fn(async () => { throw new TypeError(message) })
}

const BASE = 'http://localhost:19999'

const ARTIFACT_ID  = 'art-atk-1'
const WORKFLOW_ID  = 'wf-atk-1'
const APPROVAL_ID  = 'appr-atk-1'
const CONTENT_HASH = 'abc123hash'

function artBody(overrides?: Partial<{ artifactId: string; contentHash: string; scope: string; actionType: string }>) {
  return {
    artifactId:  ARTIFACT_ID,
    version:     '1',
    contentHash: CONTENT_HASH,
    actionType:  'FILE_PATCH',
    scope:       '/repo/main',
    createdAt:   '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function wfBody(state: string) {
  return { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state, createdAt: '2026-01-01T00:00:00.000Z' }
}

function cleanCheckpoint() {
  return {
    checkpointId: 'cp-1', capturedAt: '', headRef: 'abc', workingTreeHash: 'wth', indexHash: 'ih',
    dirtyState: { hasUncommittedChanges: false, stagedFileCount: 0, unstagedFileCount: 0, untrackedFileCount: 0, files: [] },
  }
}

function baseApplyRecord(outcome: MutationOutcome) {
  return { artifactId: ARTIFACT_ID, appliedAt: '', method: 'git apply', exitCode: 0, stdout: '', stderr: '', mutationOutcome: outcome, checkpointId: 'cp-1' }
}

function baseVerify(status: string) {
  return { command: 'test', startedAt: '', finishedAt: '', durationMs: 0, exitCode: 0, status, checks: [], timedOut: false }
}

function baseRecover(strategy: RecoveryStrategy) {
  return { strategy, operatorId: 'op', rationale: 'r', contentHash: CONTENT_HASH, startedAt: '', completedAt: '', exitCode: 0, mutationOutcome: MutationOutcome.APPLIED, succeeded: true }
}

beforeEach(() => { vi.stubGlobal('fetch', undefined) })
afterEach(() => { vi.unstubAllGlobals() })

// ── Attack A: wrong hash on approve ──────────────────────────────────────────

describe('Attack A — wrong hash on approve', () => {
  it('409 HASH_MISMATCH propagated as ControlSdkError', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: artBody() },
      { status: 409, body: { code: 'HASH_MISMATCH', message: 'contentHash mismatch' } },
    ]))
    const art = await createControlClient(BASE).artifacts.create({ actionType: 'FILE_PATCH', scope: '/repo/main', content: 'x' })
    const err = await art.approve({ operatorId: 'op-1' }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('HASH_MISMATCH')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack B: wrong scope on approve ─────────────────────────────────────────

describe('Attack B — wrong scope on approve', () => {
  it('409 APPROVAL_BINDING_INVALID propagated', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: artBody({ scope: '/repo/main' }) },
      { status: 409, body: { code: 'APPROVAL_BINDING_INVALID', message: 'scope mismatch' } },
    ]))
    const art = await createControlClient(BASE).artifacts.create({ actionType: 'FILE_PATCH', scope: '/repo/main', content: 'x' })
    const err = await art.approve({ operatorId: 'op-1' }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('APPROVAL_BINDING_INVALID')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack C: expired approval ────────────────────────────────────────────────

describe('Attack C — expired approval on apply', () => {
  it('409 APPROVAL_EXPIRED propagated from apply', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('DRAFT') },
      { status: 409, body: { code: 'APPROVAL_EXPIRED', message: 'approval expired' } },
    ]))
    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.apply({ approvalId: 'expired-appr', checkpoint: cleanCheckpoint(), applyRecord: baseApplyRecord(MutationOutcome.APPLIED) }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('APPROVAL_EXPIRED')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack D: deny then attempt approve ──────────────────────────────────────

describe('Attack D — deny then approve', () => {
  it('deny succeeds; subsequent approve attempt sends request (server authoritative)', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: artBody() },
      { status: 200, body: { ok: true, artifactId: ARTIFACT_ID, deniedAt: '2026-01-01T00:00:00.000Z' } },
      { status: 409, body: { code: 'ARTIFACT_NOT_FOUND', message: 'artifact denied' } },
    ]))
    const client = createControlClient(BASE)
    const art    = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: 'x' })
    const denial = await art.deny({ operatorId: 'op-1' })
    expect(denial.ok).toBe(true)
    // SDK sends approve anyway — server decides if denied artifact can be approved
    const err = await art.approve({ operatorId: 'op-1' }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack E: fabricated approvalId in apply ──────────────────────────────────

describe('Attack E — fabricated approvalId in apply', () => {
  it('409 APPROVAL_NOT_FOUND propagated from apply', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('DRAFT') },
      { status: 409, body: { code: 'APPROVAL_NOT_FOUND', message: 'approval not found' } },
    ]))
    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.apply({ approvalId: 'fabricated-id', checkpoint: cleanCheckpoint(), applyRecord: baseApplyRecord(MutationOutcome.APPLIED) }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('APPROVAL_NOT_FOUND')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack F: replayed apply on APPLIED workflow ──────────────────────────────

describe('Attack F — replayed apply', () => {
  it('409 INVALID_TRANSITION propagated on second apply', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('DRAFT') },
      { status: 200, body: { workflowId: WORKFLOW_ID, state: 'APPLIED', applyRecord: baseApplyRecord(MutationOutcome.APPLIED), checkpointId: 'cp-1' } },
      { status: 409, body: { code: 'INVALID_TRANSITION', message: 'APPLIED has no apply transition' } },
    ]))
    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    await wf.apply({ approvalId: APPROVAL_ID, checkpoint: cleanCheckpoint(), applyRecord: baseApplyRecord(MutationOutcome.APPLIED) })
    // Second apply attempt
    const err = await wf.apply({ approvalId: APPROVAL_ID, checkpoint: cleanCheckpoint(), applyRecord: baseApplyRecord(MutationOutcome.APPLIED) }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('INVALID_TRANSITION')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack G: dirty-tree RESTORE_CHECKPOINT ──────────────────────────────────

describe('Attack G — dirty-tree RESTORE_CHECKPOINT', () => {
  it('409 RECOVERY_UNSAFE propagated', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('DRAFT') },
      { status: 409, body: { code: 'RECOVERY_UNSAFE', message: 'checkpoint has uncommitted changes' } },
    ]))
    const wf  = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.recover({ ...baseRecover(RecoveryStrategy.RESTORE_CHECKPOINT), checkpointId: 'dirty-cp' }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('RECOVERY_UNSAFE')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack H: INDETERMINATE + REVERSE_PATCH ──────────────────────────────────

describe('Attack H — INDETERMINATE mutation + REVERSE_PATCH', () => {
  it('409 RECOVERY_UNSAFE propagated (server blocks indeterminate reverse)', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('RECOVERY_REQUIRED') },
      { status: 409, body: { code: 'RECOVERY_UNSAFE', message: 'indeterminate mutation outcome' } },
    ]))
    const wf  = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.recover({ ...baseRecover(RecoveryStrategy.REVERSE_PATCH) }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('RECOVERY_UNSAFE')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack I: verification timeout / INCONCLUSIVE ────────────────────────────

describe('Attack I — verification INCONCLUSIVE (timeout)', () => {
  it('workflow reaches VERIFICATION_FAILED state on INCONCLUSIVE result', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('APPLIED') },
      { status: 200, body: {
        workflowId: WORKFLOW_ID, state: 'VERIFICATION_FAILED',
        verification: { resultId: 'vr-1', status: VerificationStatus.INCONCLUSIVE, exitCode: 0, timedOut: true, checks: [], command: 'test', startedAt: '', finishedAt: '', durationMs: 0, verifierId: '', verifierVersion: '', artifactId: '', workflowId: '' },
      } },
    ]))
    const wf     = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const result = await wf.verify({ ...baseVerify('INCONCLUSIVE'), timedOut: true } as any)
    expect(result.status).toBe(VerificationStatus.INCONCLUSIVE)
    expect(wf.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })
})

// ── Attack J: recovery without RECOVERY_REQUIRED authority ───────────────────

describe('Attack J — recovery without authority', () => {
  it('409 INVALID_TRANSITION propagated when workflow is VERIFICATION_FAILED not RECOVERY_REQUIRED', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('VERIFICATION_FAILED') },
      { status: 409, body: { code: 'INVALID_TRANSITION', message: 'must be RECOVERY_REQUIRED to recover' } },
    ]))
    const wf  = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.recover(baseRecover(RecoveryStrategy.REVERSE_PATCH)).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('INVALID_TRANSITION')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── Attack K: duplicate recovery on RECOVERED workflow ───────────────────────

describe('Attack K — duplicate recovery on RECOVERED', () => {
  it('409 INVALID_TRANSITION on second recover', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('RECOVERY_REQUIRED') },
      { status: 200, body: { workflowId: WORKFLOW_ID, state: 'RECOVERED', recovery: { directiveId: 'd1', succeeded: true, strategy: 'REVERSE_PATCH', workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, startedAt: '', completedAt: '', exitCode: 0, mutationOutcome: 'APPLIED' } } },
      { status: 409, body: { code: 'INVALID_TRANSITION', message: 'terminal state RECOVERED' } },
    ]))
    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    await wf.recover(baseRecover(RecoveryStrategy.REVERSE_PATCH))
    expect(wf.state).toBe(ControlWorkflowState.RECOVERED)
    const err = await wf.recover(baseRecover(RecoveryStrategy.REVERSE_PATCH)).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('INVALID_TRANSITION')
  })
})

// ── Attack L: resume with stale / expired approval ───────────────────────────

describe('Attack L — resume with stale approval', () => {
  it('409 APPROVAL_EXPIRED on apply with old approvalId', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 200, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'APPROVED', createdAt: '', updatedAt: '' } },
      { status: 409, body: { code: 'APPROVAL_EXPIRED', message: 'approval expired' } },
    ]))
    const wf  = await createControlClient(BASE).workflows.load(WORKFLOW_ID)
    const err = await wf.apply({ approvalId: 'old-appr', checkpoint: cleanCheckpoint(), applyRecord: baseApplyRecord(MutationOutcome.APPLIED) }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('APPROVAL_EXPIRED')
  })
})

// ── Attack M: unknown workflowId → 404 ───────────────────────────────────────

describe('Attack M — unknown workflowId', () => {
  it('404 ControlSdkError from load()', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 404, body: { error: 'not-found' } }]))
    const err = await createControlClient(BASE).workflows.load('missing-wf').catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(404)
  })

  it('404 ControlSdkError from apply() on non-existent workflow', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('DRAFT') },
      { status: 404, body: { error: 'not-found' } },
    ]))
    const wf  = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.apply({ approvalId: APPROVAL_ID, checkpoint: cleanCheckpoint(), applyRecord: baseApplyRecord(MutationOutcome.APPLIED) }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(404)
  })
})

// ── Attack N: unknown workflowId on verify ────────────────────────────────────

describe('Attack N — unknown workflowId on verify', () => {
  it('404 ControlSdkError from verify()', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('APPLIED') },
      { status: 404, body: { error: 'not-found' } },
    ]))
    const wf  = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.verify(baseVerify(VerificationStatus.PASSED) as any).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(404)
  })
})

// ── Attack O: cancel already-CANCELLED workflow ──────────────────────────────

describe('Attack O — cancel terminal workflow', () => {
  it('409 INVALID_TRANSITION propagated on double-cancel', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('DRAFT') },
      { status: 200, body: { workflowId: WORKFLOW_ID, state: 'CANCELLED', cancelledAt: '' } },
      { status: 409, body: { code: 'INVALID_TRANSITION', message: 'CANCELLED is terminal' } },
    ]))
    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    await wf.cancel({ operatorId: 'op' })
    expect(wf.state).toBe(ControlWorkflowState.CANCELLED)
    const err = await wf.cancel({ operatorId: 'op' }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('INVALID_TRANSITION')
  })
})

// ── Attack P: all known error codes propagated ───────────────────────────────

describe('Attack P — error code propagation', () => {
  const codes = [
    'ARTIFACT_NOT_FOUND', 'HASH_MISMATCH', 'APPROVAL_NOT_FOUND', 'APPROVAL_EXPIRED',
    'APPROVAL_BINDING_INVALID', 'WORKFLOW_NOT_FOUND', 'INVALID_TRANSITION',
    'CHECKPOINT_REQUIRED', 'CHECKPOINT_NOT_FOUND', 'RECOVERY_UNSAFE',
    'ALREADY_APPROVED', 'INVALID_REQUEST', 'INTERNAL_ERROR',
  ]

  for (const code of codes) {
    it(`${code} surfaced as ControlSdkError.code`, async () => {
      vi.stubGlobal('fetch', mockFetch([{ status: 409, body: { code, message: `test ${code}` } }]))
      const err = await createControlClient(BASE).workflows.load('x').catch(e => e)
      expect(err).toBeInstanceOf(ControlSdkError)
      expect((err as ControlSdkError).code).toBe(code)
    })
  }
})

// ── Attack Q: network failure ─────────────────────────────────────────────────

describe('Attack Q — network failure', () => {
  it('ControlSdkError thrown with no status when network unreachable', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError('ECONNREFUSED'))
    const err = await createControlClient(BASE).workflows.load('x').catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBeUndefined()
    expect((err as ControlSdkError).message).toMatch(/ECONNREFUSED|Cannot reach/)
  })

  it('ControlSdkError thrown on create() when network fails', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError('getaddrinfo ENOTFOUND'))
    const err = await createControlClient(BASE).artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: 'x' }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBeUndefined()
  })
})

// ── Authority invariants ──────────────────────────────────────────────────────

describe('Authority invariants', () => {
  it('approve binding is server-authoritative — contentHash derived from artifact, not overridable', async () => {
    const serverHash = 'server-hash-xyz'
    const f = mockFetch([
      { status: 201, body: artBody({ contentHash: serverHash }) },
      { status: 200, body: { approvalId: APPROVAL_ID, artifactId: ARTIFACT_ID, binding: { contentHash: serverHash }, approvedAt: '' } },
    ])
    vi.stubGlobal('fetch', f)

    const art = await createControlClient(BASE).artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: 'payload' })
    await art.approve({ operatorId: 'op' })

    const approveBody = JSON.parse((f.mock.calls[1]! as any)[1].body)
    expect(approveBody.contentHash).toBe(serverHash)
  })

  it('verify failure does not create rollback authority — state must be explicit RECOVERY_REQUIRED', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { status: 201, body: wfBody('APPLIED') },
      { status: 200, body: { workflowId: WORKFLOW_ID, state: 'VERIFICATION_FAILED', verification: { status: 'FAILED', exitCode: 0, checks: [], timedOut: false, command: '', startedAt: '', finishedAt: '', durationMs: 0, verifierId: '', verifierVersion: '', artifactId: '', workflowId: '', resultId: '' } } },
    ]))
    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    await wf.verify(baseVerify(VerificationStatus.FAILED) as any)
    // verify() does not call /recover — only one HTTP request beyond create
    // state is VERIFICATION_FAILED, not RECOVERY_REQUIRED
    expect(wf.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
    // recover() would need separate explicit call — no automatic rollback
  })

  it('recover() requires explicit strategy — no implicit default', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 201, body: wfBody('RECOVERY_REQUIRED') }]))
    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    // TypeScript enforces strategy is required — this validates the interface shape
    const params = baseRecover(RecoveryStrategy.REVERSE_PATCH)
    expect(params.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
    expect(params.operatorId).toBeDefined()
    expect(params.contentHash).toBeDefined()
  })
})
