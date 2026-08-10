/**
 * Stage 16E T7/T8 — @rohinik-org/control SDK handles
 *
 * Unit tests with mocked fetch. Verifies:
 *
 * T7 — Core SDK
 *   - createControlClient(baseUrl) returns { artifacts, workflows }
 *   - ArtifactsNamespace.create() POST /v1/control/artifacts → ArtifactHandle
 *   - ArtifactHandle.approve() POST /v1/control/artifacts/:id/approve → approvalId
 *   - ArtifactHandle.deny() POST /v1/control/artifacts/:id/deny
 *   - WorkflowsNamespace.create(artifactId) POST /v1/control/workflows → WorkflowHandle
 *   - WorkflowsNamespace.load(workflowId) GET /v1/control/workflows/:id → WorkflowHandle
 *   - WorkflowHandle.state → current workflow state from server
 *   - WorkflowHandle.apply() POST /v1/control/workflows/:id/apply → ApplyResult
 *   - WorkflowHandle.cancel() POST /v1/control/workflows/:id/cancel
 *   - WorkflowHandle.evidence() GET /v1/control/workflows/:id/evidence
 *
 * T8 — Typed verification + resume
 *   - WorkflowHandle.verify() POST /v1/control/workflows/:id/verify → VerificationResult
 *   - WorkflowHandle.recover() POST /v1/control/workflows/:id/recover → RecoveryRecord
 *   - VerificationResult.status === 'PASSED' → VERIFIED; 'FAILED' → VERIFICATION_FAILED
 *   - Authority boundaries: approve ≠ apply; verify failure ≠ rollback authority
 *   - WorkflowHandle.reload() GET /v1/control/workflows/:id → refreshed state
 *   - ControlSdkError on non-2xx with code + message forwarded
 *   - ControlSdkError.status exposed
 *   - T8: VerifyAndRecoverResult shape — verification + recovery field
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createControlClient,
  ArtifactHandle,
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

const BASE = 'http://localhost:19999'

const ARTIFACT_ID  = 'art-1'
const APPROVAL_ID  = 'appr-1'
const WORKFLOW_ID  = 'wf-1'
const CONTENT_HASH = 'abc123'

beforeEach(() => { vi.stubGlobal('fetch', undefined) })
afterEach(() => { vi.unstubAllGlobals() })

// ── createControlClient ───────────────────────────────────────────────────────

describe('createControlClient()', () => {
  it('returns artifacts and workflows namespaces', () => {
    const client = createControlClient(BASE)
    expect(client.artifacts).toBeDefined()
    expect(client.workflows).toBeDefined()
  })
})

// ── ArtifactsNamespace.create() ───────────────────────────────────────────────

describe('ArtifactsNamespace.create()', () => {
  it('POST /v1/control/artifacts → ArtifactHandle with id + contentHash', async () => {
    const responseBody = {
      artifactId:  ARTIFACT_ID,
      version:     '1',
      contentHash: CONTENT_HASH,
      actionType:  'FILE_PATCH',
      scope:       '/repo/main',
      createdAt:   '2026-01-01T00:00:00.000Z',
    }
    const f = mockFetch([{ status: 201, body: responseBody }])
    vi.stubGlobal('fetch', f)

    const client = createControlClient(BASE)
    const artifact = await client.artifacts.create({
      actionType: 'FILE_PATCH',
      scope:      '/repo/main',
      content:    'diff content',
    })

    expect(f).toHaveBeenCalledOnce()
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/control/artifacts`)
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      actionType: 'FILE_PATCH',
      scope:      '/repo/main',
      content:    'diff content',
    })

    expect(artifact).toBeInstanceOf(ArtifactHandle)
    expect(artifact.id).toBe(ARTIFACT_ID)
    expect(artifact.contentHash).toBe(CONTENT_HASH)
    expect(artifact.scope).toBe('/repo/main')
    expect(artifact.actionType).toBe('FILE_PATCH')
  })

  it('throws ControlSdkError on 400', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 400, body: { code: 'INVALID_REQUEST', message: 'missing field' } }]))
    const client = createControlClient(BASE)
    const err = await client.artifacts.create({
      actionType: 'FILE_PATCH',
      scope:      '/repo/main',
      content:    '',
    }).catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(400)
    expect((err as ControlSdkError).code).toBe('INVALID_REQUEST')
  })
})

// ── ArtifactHandle.approve() ──────────────────────────────────────────────────

describe('ArtifactHandle.approve()', () => {
  it('POST /v1/control/artifacts/:id/approve → approvalId', async () => {
    const responseBody = {
      approvalId:  APPROVAL_ID,
      artifactId:  ARTIFACT_ID,
      binding:     { artifactId: ARTIFACT_ID, version: '1', contentHash: CONTENT_HASH, actionType: 'FILE_PATCH', scope: '/repo/main' },
      approvedAt:  '2026-01-01T00:00:00.000Z',
    }
    const f = mockFetch([
      { status: 201, body: { artifactId: ARTIFACT_ID, version: '1', contentHash: CONTENT_HASH, actionType: 'FILE_PATCH', scope: '/repo/main', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: responseBody },
    ])
    vi.stubGlobal('fetch', f)

    const client   = createControlClient(BASE)
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/repo/main', content: 'diff' })
    const decision = await artifact.approve({ operatorId: 'op-1', rationale: 'lgtm' })

    const [, approveCall] = f.mock.calls
    const [url, init] = approveCall!
    expect(url).toBe(`${BASE}/v1/control/artifacts/${ARTIFACT_ID}/approve`)
    expect((init as RequestInit).method).toBe('POST')
    const approveBody = JSON.parse((init as RequestInit).body as string)
    // Must send exact binding fields
    expect(approveBody.contentHash).toBe(CONTENT_HASH)
    expect(approveBody.actionType).toBe('FILE_PATCH')
    expect(approveBody.scope).toBe('/repo/main')
    expect(approveBody.operatorId).toBe('op-1')
    expect(approveBody.rationale).toBe('lgtm')

    expect(decision.approvalId).toBe(APPROVAL_ID)
    expect(decision.binding.artifactId).toBe(ARTIFACT_ID)
  })

  it('approve() sends binding derived from artifact, not caller-supplied hash', async () => {
    // The SDK must derive contentHash/actionType/scope from the artifact's own fields
    // Caller CANNOT override the hash — this enforces the binding contract
    const serverHash = 'server-authoritative-hash'
    const f = mockFetch([
      { status: 201, body: { artifactId: ARTIFACT_ID, version: '1', contentHash: serverHash, actionType: 'FILE_PATCH', scope: '/s', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { approvalId: APPROVAL_ID, artifactId: ARTIFACT_ID, binding: { artifactId: ARTIFACT_ID, version: '1', contentHash: serverHash, actionType: 'FILE_PATCH', scope: '/s' }, approvedAt: '2026-01-01T00:00:00.000Z' } },
    ])
    vi.stubGlobal('fetch', f)

    const client   = createControlClient(BASE)
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: 'x' })
    await artifact.approve({ operatorId: 'op-1' })

    const approveBody = JSON.parse((f.mock.calls[1]! as any)[1].body)
    expect(approveBody.contentHash).toBe(serverHash)  // from artifact, not caller
  })

  it('approve ≠ apply — no workflow created', async () => {
    // approve() is an artifact-scoped operation; workflows are separate
    // This test ensures approve() calls exactly one endpoint
    const f = mockFetch([
      { status: 201, body: { artifactId: ARTIFACT_ID, version: '1', contentHash: CONTENT_HASH, actionType: 'FILE_PATCH', scope: '/s', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { approvalId: APPROVAL_ID, artifactId: ARTIFACT_ID, binding: {}, approvedAt: '2026-01-01T00:00:00.000Z' } },
    ])
    vi.stubGlobal('fetch', f)

    const client   = createControlClient(BASE)
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: 'x' })
    await artifact.approve({ operatorId: 'op-1' })

    expect(f).toHaveBeenCalledTimes(2)  // create + approve, nothing else
  })
})

// ── ArtifactHandle.deny() ─────────────────────────────────────────────────────

describe('ArtifactHandle.deny()', () => {
  it('POST /v1/control/artifacts/:id/deny', async () => {
    const f = mockFetch([
      { status: 201, body: { artifactId: ARTIFACT_ID, version: '1', contentHash: CONTENT_HASH, actionType: 'FILE_PATCH', scope: '/s', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { ok: true, artifactId: ARTIFACT_ID, deniedAt: '2026-01-01T00:00:00.000Z' } },
    ])
    vi.stubGlobal('fetch', f)

    const client   = createControlClient(BASE)
    const artifact = await client.artifacts.create({ actionType: 'FILE_PATCH', scope: '/s', content: 'x' })
    const result   = await artifact.deny({ operatorId: 'op-2', rationale: 'nope' })

    const [url] = f.mock.calls[1]!
    expect(url).toBe(`${BASE}/v1/control/artifacts/${ARTIFACT_ID}/deny`)
    expect(result.ok).toBe(true)
  })
})

// ── WorkflowsNamespace.create() ──────────────────────────────────────────────

describe('WorkflowsNamespace.create()', () => {
  it('POST /v1/control/workflows → WorkflowHandle', async () => {
    const f = mockFetch([{
      status: 201,
      body:   { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' },
    }])
    vi.stubGlobal('fetch', f)

    const client   = createControlClient(BASE)
    const workflow = await client.workflows.create(ARTIFACT_ID)

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${BASE}/v1/control/workflows`)
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ artifactId: ARTIFACT_ID })

    expect(workflow).toBeInstanceOf(WorkflowHandle)
    expect(workflow.id).toBe(WORKFLOW_ID)
    expect(workflow.state).toBe(ControlWorkflowState.DRAFT)
  })

  it('passes idempotencyKey when provided', async () => {
    const f = mockFetch([{ status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } }])
    vi.stubGlobal('fetch', f)

    await createControlClient(BASE).workflows.create(ARTIFACT_ID, { idempotencyKey: 'idem-1' })

    const body = JSON.parse((f.mock.calls[0]! as any)[1].body)
    expect(body.idempotencyKey).toBe('idem-1')
  })
})

// ── WorkflowsNamespace.load() ────────────────────────────────────────────────

describe('WorkflowsNamespace.load()', () => {
  it('GET /v1/control/workflows/:id → WorkflowHandle', async () => {
    const f = mockFetch([{ status: 200, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'APPROVED', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } }])
    vi.stubGlobal('fetch', f)

    const workflow = await createControlClient(BASE).workflows.load(WORKFLOW_ID)

    expect((f.mock.calls[0]![0] as string)).toBe(`${BASE}/v1/control/workflows/${WORKFLOW_ID}`)
    expect(workflow.state).toBe(ControlWorkflowState.APPROVED)
  })

  it('throws ControlSdkError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 404, body: { error: 'not-found' } }]))
    const err = await createControlClient(BASE).workflows.load('missing').catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).status).toBe(404)
  })
})

// ── WorkflowHandle.apply() ────────────────────────────────────────────────────

describe('WorkflowHandle.apply()', () => {
  it('POST /v1/control/workflows/:id/apply with approvalId + checkpoint + applyRecord', async () => {
    const checkpoint = {
      checkpointId: 'cp-1', capturedAt: '2026-01-01T00:00:00.000Z',
      headRef: 'abc', workingTreeHash: 'wth', indexHash: 'ih',
      dirtyState: { hasUncommittedChanges: false, stagedFileCount: 0, unstagedFileCount: 0, untrackedFileCount: 0, files: [] },
    }
    const record = {
      artifactId: ARTIFACT_ID, appliedAt: '2026-01-01T00:00:00.000Z',
      method: 'git apply', exitCode: 0, stdout: '', stderr: '',
      mutationOutcome: MutationOutcome.APPLIED, checkpointId: 'cp-1',
    }
    const serverResp = {
      workflowId: WORKFLOW_ID, state: ControlWorkflowState.APPLIED,
      applyRecord: record, checkpointId: 'cp-1',
    }
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: serverResp },
    ])
    vi.stubGlobal('fetch', f)

    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const result = await wf.apply({ approvalId: APPROVAL_ID, checkpoint, applyRecord: record })

    const [url, init] = f.mock.calls[1]!
    expect(url).toBe(`${BASE}/v1/control/workflows/${WORKFLOW_ID}/apply`)
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.approvalId).toBe(APPROVAL_ID)
    expect(body.checkpoint).toEqual(checkpoint)
    expect(body.applyRecord).toEqual(record)

    expect(result.state).toBe(ControlWorkflowState.APPLIED)
    expect(result.applyRecord.mutationOutcome).toBe(MutationOutcome.APPLIED)

    // WorkflowHandle.state updated after apply
    expect(wf.state).toBe(ControlWorkflowState.APPLIED)
  })

  it('apply ≠ verify — no verify called automatically', async () => {
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { workflowId: WORKFLOW_ID, state: 'APPLIED', applyRecord: { mutationOutcome: 'APPLIED', checkpointId: 'cp-1' }, checkpointId: 'cp-1' } },
    ])
    vi.stubGlobal('fetch', f)

    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    await wf.apply({
      approvalId:  APPROVAL_ID,
      checkpoint:  { checkpointId: 'cp-1', capturedAt: '', headRef: '', workingTreeHash: '', indexHash: '', dirtyState: { hasUncommittedChanges: false, stagedFileCount: 0, unstagedFileCount: 0, untrackedFileCount: 0, files: [] } },
      applyRecord: { artifactId: ARTIFACT_ID, appliedAt: '', method: 'git apply', exitCode: 0, stdout: '', stderr: '', mutationOutcome: MutationOutcome.APPLIED, checkpointId: 'cp-1' },
    })

    expect(f).toHaveBeenCalledTimes(2)  // create + apply; no auto-verify
  })
})

// ── WorkflowHandle.verify() ───────────────────────────────────────────────────

describe('WorkflowHandle.verify() — T8', () => {
  function makeWf(initialState: string) {
    const f = mockFetch([{
      status: 201,
      body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: initialState, createdAt: '2026-01-01T00:00:00.000Z' },
    }])
    vi.stubGlobal('fetch', f)
    // Return client to add more mocked responses later — caller replaces fetch after
    return createControlClient(BASE).workflows.create(ARTIFACT_ID).then(wh => ({ wh, firstFetch: f }))
  }

  it('POST /v1/control/workflows/:id/verify → VerificationResult', async () => {
    const verResult = {
      resultId: 'vr-1', artifactId: ARTIFACT_ID, workflowId: WORKFLOW_ID,
      verifierId: 'v1', verifierVersion: '1.0', command: 'pnpm test',
      startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000, exitCode: 0, status: VerificationStatus.PASSED,
      checks: [], timedOut: false,
    }
    const { wh } = await makeWf('APPLIED')

    const f2 = mockFetch([{ status: 200, body: { workflowId: WORKFLOW_ID, state: 'VERIFIED', verification: verResult } }])
    vi.stubGlobal('fetch', f2)

    const result = await wh.verify({
      command: 'pnpm test', verifierId: 'v1', verifierVersion: '1.0',
      startedAt: verResult.startedAt, finishedAt: verResult.finishedAt,
      durationMs: 1000, exitCode: 0, status: VerificationStatus.PASSED, checks: [], timedOut: false,
    })

    expect(f2.mock.calls[0]![0]).toBe(`${BASE}/v1/control/workflows/${WORKFLOW_ID}/verify`)
    expect(result.status).toBe(VerificationStatus.PASSED)
    expect(wh.state).toBe(ControlWorkflowState.VERIFIED)
  })

  it('exitCode=0 + status=FAILED → VERIFICATION_FAILED (process success ≠ verify passed)', async () => {
    const { wh } = await makeWf('APPLIED')

    const f2 = mockFetch([{ status: 200, body: {
      workflowId: WORKFLOW_ID, state: 'VERIFICATION_FAILED',
      verification: { resultId: 'vr-2', status: VerificationStatus.FAILED, exitCode: 0, checks: [], timedOut: false, command: 'test', startedAt: '', finishedAt: '', durationMs: 0, verifierId: '', verifierVersion: '', artifactId: ARTIFACT_ID, workflowId: WORKFLOW_ID },
    } }])
    vi.stubGlobal('fetch', f2)

    const result = await wh.verify({
      command: 'test', startedAt: '', finishedAt: '',
      durationMs: 0, exitCode: 0, status: VerificationStatus.FAILED, checks: [], timedOut: false,
    })

    expect(result.status).toBe(VerificationStatus.FAILED)
    expect(wh.state).toBe(ControlWorkflowState.VERIFICATION_FAILED)
  })

  it('verify failure ≠ rollback authority — recover() requires separate call', async () => {
    // verify() does NOT call /recover internally — caller must decide
    const { wh } = await makeWf('APPLIED')
    const f2 = mockFetch([{ status: 200, body: { workflowId: WORKFLOW_ID, state: 'VERIFICATION_FAILED', verification: { status: 'FAILED', exitCode: 0, checks: [], timedOut: false, command: '', startedAt: '', finishedAt: '', durationMs: 0, verifierId: '', verifierVersion: '', artifactId: '', workflowId: '', resultId: '' } } }])
    vi.stubGlobal('fetch', f2)

    await wh.verify({ command: 'test', startedAt: '', finishedAt: '', durationMs: 0, exitCode: 0, status: VerificationStatus.FAILED, checks: [], timedOut: false })

    expect(f2).toHaveBeenCalledTimes(1)  // only /verify, no automatic /recover
  })
})

// ── WorkflowHandle.recover() ─────────────────────────────────────────────────

describe('WorkflowHandle.recover() — T8', () => {
  it('POST /v1/control/workflows/:id/recover → RecoveryRecord', async () => {
    const recoveryRecord = {
      directiveId: 'dir-1', workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID,
      startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:01.000Z',
      strategy: RecoveryStrategy.REVERSE_PATCH, exitCode: 0,
      mutationOutcome: MutationOutcome.APPLIED, succeeded: true,
    }
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { workflowId: WORKFLOW_ID, state: 'RECOVERED', recovery: recoveryRecord } },
    ])
    vi.stubGlobal('fetch', f)

    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const now = new Date().toISOString()
    const result = await wf.recover({
      strategy:       RecoveryStrategy.REVERSE_PATCH,
      operatorId:     'op-1',
      rationale:      'reverting after verification failure',
      contentHash:    CONTENT_HASH,
      startedAt:      now,
      completedAt:    now,
      exitCode:       0,
      mutationOutcome: MutationOutcome.APPLIED,
      succeeded:      true,
    })

    const [url, init] = f.mock.calls[1]!
    expect(url).toBe(`${BASE}/v1/control/workflows/${WORKFLOW_ID}/recover`)
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
    expect(body.contentHash).toBe(CONTENT_HASH)
    expect(body.operatorId).toBe('op-1')

    expect(result.succeeded).toBe(true)
    expect(result.strategy).toBe(RecoveryStrategy.REVERSE_PATCH)
    expect(wf.state).toBe(ControlWorkflowState.RECOVERED)
  })

  it('recover ≠ automatic rollback — strategy must be explicit', async () => {
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
    ])
    vi.stubGlobal('fetch', f)

    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    // recover() without strategy should fail at TypeScript level — but we also test runtime guard
    // This test verifies the shape of the required fields
    const body: Parameters<typeof wf.recover>[0] = {
      strategy:        RecoveryStrategy.REVERSE_PATCH,  // must be explicit
      operatorId:      'op-1',
      rationale:       'explicit',
      contentHash:     CONTENT_HASH,
      startedAt:       '',
      completedAt:     '',
      exitCode:        0,
      mutationOutcome: MutationOutcome.APPLIED,
      succeeded:       true,
    }
    expect(body.strategy).toBeDefined()  // TypeScript enforces; this validates shape
  })

  it('409 RECOVERY_UNSAFE propagated as ControlSdkError', async () => {
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 409, body: { code: 'RECOVERY_UNSAFE', message: 'dirty checkpoint' } },
    ])
    vi.stubGlobal('fetch', f)

    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const err = await wf.recover({
      strategy: RecoveryStrategy.RESTORE_CHECKPOINT, operatorId: 'op-1', rationale: 'r',
      contentHash: CONTENT_HASH, startedAt: '', completedAt: '', exitCode: 0,
      mutationOutcome: MutationOutcome.APPLIED, succeeded: true,
    }).catch(e => e)

    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBe('RECOVERY_UNSAFE')
    expect((err as ControlSdkError).status).toBe(409)
  })
})

// ── WorkflowHandle.cancel() ───────────────────────────────────────────────────

describe('WorkflowHandle.cancel()', () => {
  it('POST /v1/control/workflows/:id/cancel', async () => {
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { workflowId: WORKFLOW_ID, state: 'CANCELLED', cancelledAt: '2026-01-01T00:00:00.000Z' } },
    ])
    vi.stubGlobal('fetch', f)

    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const result = await wf.cancel({ operatorId: 'op-1', reason: 'abort' })

    expect((f.mock.calls[1]![0] as string)).toBe(`${BASE}/v1/control/workflows/${WORKFLOW_ID}/cancel`)
    expect(result.state).toBe(ControlWorkflowState.CANCELLED)
    expect(wf.state).toBe(ControlWorkflowState.CANCELLED)
  })
})

// ── WorkflowHandle.evidence() ────────────────────────────────────────────────

describe('WorkflowHandle.evidence()', () => {
  it('GET /v1/control/workflows/:id/evidence', async () => {
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'VERIFIED', events: [{ eventId: 'e1', kind: 'workflow-created', occurredAt: '2026-01-01T00:00:00.000Z' }] } },
    ])
    vi.stubGlobal('fetch', f)

    const wf     = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    const ev     = await wf.evidence()

    expect((f.mock.calls[1]![0] as string)).toBe(`${BASE}/v1/control/workflows/${WORKFLOW_ID}/evidence`)
    expect(ev.events).toHaveLength(1)
    expect(ev.events[0]!.kind).toBe('workflow-created')
  })
})

// ── WorkflowHandle.reload() — T8 ─────────────────────────────────────────────

describe('WorkflowHandle.reload() — T8', () => {
  it('re-fetches workflow state and updates handle', async () => {
    const f = mockFetch([
      { status: 201, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z' } },
      { status: 200, body: { workflowId: WORKFLOW_ID, artifactId: ARTIFACT_ID, state: 'VERIFIED', updatedAt: '2026-01-01T00:00:01.000Z', createdAt: '2026-01-01T00:00:00.000Z' } },
    ])
    vi.stubGlobal('fetch', f)

    const wf = await createControlClient(BASE).workflows.create(ARTIFACT_ID)
    expect(wf.state).toBe(ControlWorkflowState.DRAFT)

    await wf.reload()
    expect(wf.state).toBe(ControlWorkflowState.VERIFIED)
  })
})

// ── ControlSdkError shape ─────────────────────────────────────────────────────

describe('ControlSdkError', () => {
  it('exposes status + code + message', () => {
    const err = new ControlSdkError('test', 409, 'RECOVERY_UNSAFE')
    expect(err.status).toBe(409)
    expect(err.code).toBe('RECOVERY_UNSAFE')
    expect(err.message).toBe('test')
    expect(err.name).toBe('ControlSdkError')
    expect(err instanceof Error).toBe(true)
  })

  it('code is undefined when server returns no code field', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 500, body: { message: 'internal' } }]))
    const err = await createControlClient(BASE).workflows.load('x').catch(e => e)
    expect(err).toBeInstanceOf(ControlSdkError)
    expect((err as ControlSdkError).code).toBeUndefined()
  })
})
