/**
 * Stage 16E — Task 2: @rohinik-org/control-approval-store
 *
 * Tests prove the approval authority model before any workflow state is built:
 *   - artifact registration + content hashing
 *   - approval binding: exact match on all five fields
 *   - idempotent replay
 *   - scope conflict: same diff/id, different scope → rejected
 *   - action conflict: same diff/id/scope, different actionType → rejected
 *   - hash mismatch: modified artifact invalidates binding
 *   - denial cannot be overwritten by approval (append-only)
 *   - denial record preserved
 *   - operator ID and rationale preserved
 *   - no implicit approval from artifact registration
 *   - Stage 15E OversightDecision cannot substitute for ApprovalDecision
 *   - expired approval is rejected at validation time
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  InMemoryControlArtifactStore,
  InMemoryApprovalStore,
  ControlApprovalService,
  ControlApprovalError,
} from '../index.js'
import { ControlArtifactActionType } from '@rohinik-org/control-protocol-v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const DIFF = '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new\n'
const DIFF_HASH = sha256(DIFF)

const OPERATOR = { operatorId: 'op-1', rationale: 'approved in code review' }

// ── ControlArtifactStore ──────────────────────────────────────────────────────

describe('InMemoryControlArtifactStore', () => {
  it('registers artifact and computes content hash', async () => {
    const store = new InMemoryControlArtifactStore()
    const artifact = await store.register({
      actionType: ControlArtifactActionType.FILE_PATCH,
      scope:      '/repo/main',
      content:    DIFF,
    })
    expect(artifact.contentHash).toBe(DIFF_HASH)
    expect(artifact.artifactId).toBeDefined()
    expect(artifact.version).toBe('1')
    expect(artifact.actionType).toBe('FILE_PATCH')
    expect(artifact.scope).toBe('/repo/main')
    expect(artifact.createdAt).toBeDefined()
  })

  it('load() returns registered artifact', async () => {
    const store = new InMemoryControlArtifactStore()
    const art = await store.register({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    const loaded = await store.load(art.artifactId)
    expect(loaded).not.toBeNull()
    expect(loaded!.artifactId).toBe(art.artifactId)
    expect(loaded!.content).toBe(DIFF)
  })

  it('load() returns null for unknown id', async () => {
    const store = new InMemoryControlArtifactStore()
    expect(await store.load('nonexistent')).toBeNull()
  })

  it('same content + same scope + same actionType produces same contentHash', async () => {
    const store = new InMemoryControlArtifactStore()
    const a = await store.register({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    const b = await store.register({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    expect(a.contentHash).toBe(b.contentHash)
  })
})

// ── ControlApprovalService — approve ─────────────────────────────────────────

describe('ControlApprovalService.approve()', () => {
  it('creates approval with correct binding fields', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo/main', content: DIFF })

    const decision = await svc.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo/main',
      operatorId:  OPERATOR.operatorId,
      rationale:   OPERATOR.rationale,
    })

    expect(decision.approvalId).toBeDefined()
    expect(decision.binding.artifactId).toBe(art.artifactId)
    expect(decision.binding.version).toBe(art.version)
    expect(decision.binding.contentHash).toBe(DIFF_HASH)
    expect(decision.binding.actionType).toBe('FILE_PATCH')
    expect(decision.binding.scope).toBe('/repo/main')
    expect(decision.operatorId).toBe('op-1')
    expect(decision.rationale).toBe(OPERATOR.rationale)
    expect(decision.approvedAt).toBeDefined()
  })

  it('HASH_MISMATCH when contentHash does not match stored', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })

    await expect(svc.approve(art.artifactId, {
      contentHash: 'deadbeef',
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
      operatorId:  'op-1',
    })).rejects.toThrow(ControlApprovalError)

    await expect(svc.approve(art.artifactId, {
      contentHash: 'deadbeef',
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
      operatorId:  'op-1',
    })).rejects.toMatchObject({ code: 'HASH_MISMATCH' })
  })

  it('APPROVAL_BINDING_INVALID: same content/id/hash but different scope', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo/main', content: DIFF })

    // Attempt to approve against a different scope — same bytes, different target
    await expect(svc.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo/feature-branch',    // ← different scope
      operatorId:  'op-1',
    })).rejects.toMatchObject({ code: 'APPROVAL_BINDING_INVALID' })
  })

  it('APPROVAL_BINDING_INVALID: same content/id/hash/scope but different actionType', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })

    await expect(svc.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.SCRIPT_EXECUTION,  // ← different action
      scope:       '/repo',
      operatorId:  'op-1',
    })).rejects.toMatchObject({ code: 'APPROVAL_BINDING_INVALID' })
  })

  it('ARTIFACT_NOT_FOUND for unknown artifactId', async () => {
    const svc = makeService()
    await expect(svc.approve('bad-id', {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
      operatorId:  'op-1',
    })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' })
  })

  it('idempotent replay: same approval request on same artifact returns new record but binds same hash', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })

    const d1 = await svc.approve(art.artifactId, { contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', operatorId: 'op-1' })
    const d2 = await svc.approve(art.artifactId, { contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', operatorId: 'op-1' })

    // Both bind the same content — decisions are distinct records
    expect(d1.binding.contentHash).toBe(d2.binding.contentHash)
    expect(d1.approvalId).not.toBe(d2.approvalId)
  })

  it('preserves optional expiresAt', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    const future = new Date(Date.now() + 86_400_000).toISOString()

    const d = await svc.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
      operatorId:  'op-1',
      expiresAt:   future,
    })
    expect(d.expiresAt).toBe(future)
  })
})

// ── ControlApprovalService — deny ────────────────────────────────────────────

describe('ControlApprovalService.deny()', () => {
  it('creates denial record with operatorId and rationale', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })

    const denial = await svc.deny(art.artifactId, { operatorId: 'op-2', rationale: 'security risk' })
    expect(denial.artifactId).toBe(art.artifactId)
    expect(denial.operatorId).toBe('op-2')
    expect(denial.rationale).toBe('security risk')
    expect(denial.deniedAt).toBeDefined()
  })

  it('ARTIFACT_NOT_FOUND for unknown artifactId', async () => {
    const svc = makeService()
    await expect(svc.deny('bad-id', { operatorId: 'op-1' })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' })
  })
})

// ── Approval append-only — denial cannot be silently overwritten ──────────────

describe('denial cannot be overwritten by subsequent approval', () => {
  it('approve after deny raises ALREADY_APPROVED or DENIAL_EXISTS error', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })

    await svc.deny(art.artifactId, { operatorId: 'op-1', rationale: 'rejected' })

    await expect(svc.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
      operatorId:  'op-2',
    })).rejects.toThrow(ControlApprovalError)
  })
})

// ── validateApproval ──────────────────────────────────────────────────────────

describe('ControlApprovalService.validateApproval()', () => {
  it('valid approval passes for correct binding', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    const d = await svc.approve(art.artifactId, { contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', operatorId: 'op-1' })

    await expect(svc.validateApproval(d.approvalId, {
      artifactId:  art.artifactId,
      version:     art.version,
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
    })).resolves.toBe(true)
  })

  it('APPROVAL_NOT_FOUND for unknown approvalId', async () => {
    const svc = makeService()
    await expect(svc.validateApproval('bad', {
      artifactId: 'x', version: '1', contentHash: 'y',
      actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo',
    })).rejects.toMatchObject({ code: 'APPROVAL_NOT_FOUND' })
  })

  it('APPROVAL_BINDING_INVALID when validating against different scope', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo/main', content: DIFF })
    const d = await svc.approve(art.artifactId, { contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo/main', operatorId: 'op-1' })

    await expect(svc.validateApproval(d.approvalId, {
      artifactId:  art.artifactId,
      version:     art.version,
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo/feature-branch',  // different scope
    })).rejects.toMatchObject({ code: 'APPROVAL_BINDING_INVALID' })
  })

  it('HASH_MISMATCH when validating modified content against existing approval', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    const d = await svc.approve(art.artifactId, { contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', operatorId: 'op-1' })

    const modifiedHash = sha256(DIFF + '\nextra line')
    await expect(svc.validateApproval(d.approvalId, {
      artifactId:  art.artifactId,
      version:     art.version,
      contentHash: modifiedHash,    // artifact was modified after approval
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
    })).rejects.toMatchObject({ code: 'HASH_MISMATCH' })
  })

  it('APPROVAL_EXPIRED when expiresAt is in the past', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    const past = new Date(Date.now() - 1000).toISOString()
    const d = await svc.approve(art.artifactId, {
      contentHash: DIFF_HASH,
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
      operatorId:  'op-1',
      expiresAt:   past,
    })

    await expect(svc.validateApproval(d.approvalId, {
      artifactId: art.artifactId, version: art.version,
      contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo',
    })).rejects.toMatchObject({ code: 'APPROVAL_EXPIRED' })
  })
})

// ── No implicit approval ──────────────────────────────────────────────────────

describe('no implicit approval', () => {
  it('registering artifact does not create any approval', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })

    const approvals = await svc.listApprovals(art.artifactId)
    expect(approvals).toHaveLength(0)
  })
})

// ── Stage 15E oversight decisions cannot substitute ──────────────────────────

describe('Stage 15E OversightDecision cannot substitute for ApprovalDecision', () => {
  it('validateApproval rejects an oversight-decision-shaped ID (structural)', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })

    // Simulate passing an oversight decision ID (which won't exist in the approval store)
    const oversightDecisionId = 'odec-1234567890-1'
    await expect(svc.validateApproval(oversightDecisionId, {
      artifactId: art.artifactId, version: art.version,
      contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo',
    })).rejects.toMatchObject({ code: 'APPROVAL_NOT_FOUND' })
  })
})

// ── listApprovals / getDenial ─────────────────────────────────────────────────

describe('approval history', () => {
  it('listApprovals returns all approval decisions for an artifact', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    await svc.approve(art.artifactId, { contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', operatorId: 'op-1' })
    await svc.approve(art.artifactId, { contentHash: DIFF_HASH, actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', operatorId: 'op-2' })

    const list = await svc.listApprovals(art.artifactId)
    expect(list).toHaveLength(2)
    expect(list.map(d => d.operatorId)).toContain('op-1')
    expect(list.map(d => d.operatorId)).toContain('op-2')
  })

  it('getDenial returns denial record when present', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    await svc.deny(art.artifactId, { operatorId: 'op-1', rationale: 'too risky' })

    const denial = await svc.getDenial(art.artifactId)
    expect(denial).not.toBeNull()
    expect(denial!.rationale).toBe('too risky')
  })

  it('getDenial returns null for unapproved/undenied artifact', async () => {
    const svc = makeService()
    const art = await svc.registerArtifact({ actionType: ControlArtifactActionType.FILE_PATCH, scope: '/repo', content: DIFF })
    expect(await svc.getDenial(art.artifactId)).toBeNull()
  })
})

// ── Factory ───────────────────────────────────────────────────────────────────

function makeService(): ControlApprovalService {
  return new ControlApprovalService(
    new InMemoryControlArtifactStore(),
    new InMemoryApprovalStore(),
  )
}
