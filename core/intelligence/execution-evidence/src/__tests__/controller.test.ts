import { describe, it, expect } from 'vitest'
import { ExecutionEvidenceController } from '../controller.js'
import { MemoryEvidenceRepository } from '@rohinik-org/execution-evidence-store-memory'
import {
  intelligentExecutionId,
  executionSessionId,
  makeContextAdmissionRef,
  EvidenceOutcome,
  EvidenceCompletionState,
  EvidenceErrorCode,
} from '@rohinik-org/execution-evidence-ir'

function makeController() {
  let seq = 0
  const repo = new MemoryEvidenceRepository()
  const ctrl = new ExecutionEvidenceController(
    repo,
    { now: () => new Date('2025-01-01T00:00:00.000Z') },
    { generate: () => `id-${++seq}` },
    { hash: (s: string) => 'h:' + s.slice(0, 8) },
  )
  return { ctrl, repo }
}

// ── open and sealAndStore ──────────────────────────────────────────────────────

describe('ExecutionEvidenceController — open + sealAndStore', () => {
  it('open returns ExecutionEvidenceId', () => {
    const { ctrl } = makeController()
    const id = ctrl.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    expect(typeof id).toBe('string')
  })

  it('sealAndStore returns SealedExecutionEvidence', async () => {
    const { ctrl } = makeController()
    const id = ctrl.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.completionState).toBe(EvidenceCompletionState.SEALED)
  })

  it('sealAndStore persists to repository', async () => {
    const { ctrl, repo } = makeController()
    const id = ctrl.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    const found = await repo.findById(record.evidenceId)
    expect(found).toBeDefined()
    expect(found!.evidenceId).toBe(record.evidenceId)
  })

  it('normal completion is only returned after repository acceptance', async () => {
    // Repository that fails on store
    const failingRepo = {
      async store() { throw new Error('persistence failed') },
      async findById() { return undefined },
      async verifyIntegrity() { return { evidenceId: 'x' as any, status: 'not_found' as any, checkedAt: new Date() } },
    }
    let seq = 0
    const ctrl = new ExecutionEvidenceController(
      failingRepo,
      { now: () => new Date('2025-01-01T00:00:00.000Z') },
      { generate: () => `id-${++seq}` },
      { hash: (s: string) => 'h:' + s.slice(0, 8) },
    )
    const id = ctrl.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
    await expect(ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z')))
      .rejects.toThrow(EvidenceErrorCode.EVIDENCE_PERSISTENCE_FAILED)
  })

  it('unknown evidenceId throws', async () => {
    const { ctrl } = makeController()
    const { executionEvidenceId } = await import('@rohinik-org/execution-evidence-ir')
    await expect(ctrl.sealAndStore(executionEvidenceId('unknown'), EvidenceOutcome.SUCCESS, new Date()))
      .rejects.toThrow(EvidenceErrorCode.EVIDENCE_NOT_FOUND)
  })
})

// ── repeated seal idempotency ─────────────────────────────────────────────────

describe('ExecutionEvidenceController — idempotency', () => {
  it('sealAndStore after already sealed (same outcome) returns cached record', async () => {
    const { ctrl } = makeController()
    const id = ctrl.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
    const r1 = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    // After seal, evidenceId is gone from active set — attempting again via sealAndStore
    // should return the already-persisted record (idempotent retrieval path)
    const r2 = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(r1.evidenceHash).toBe(r2.evidenceHash)
  })
})

// ── retrieve and verify ───────────────────────────────────────────────────────

describe('ExecutionEvidenceController — retrieve and verify', () => {
  it('findById returns stored record', async () => {
    const { ctrl } = makeController()
    const id = ctrl.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    const found = await ctrl.findById(record.evidenceId)
    expect(found!.evidenceId).toBe(record.evidenceId)
  })

  it('verifyIntegrity returns VALID for intact record', async () => {
    const { ctrl } = makeController()
    const id = ctrl.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    const result = await ctrl.verifyIntegrity(record.evidenceId)
    const { EvidenceIntegrityStatus } = await import('@rohinik-org/execution-evidence-ir')
    expect(result.status).toBe(EvidenceIntegrityStatus.VALID)
  })
})
