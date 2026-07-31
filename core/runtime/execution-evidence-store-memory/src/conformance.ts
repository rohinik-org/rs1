import { describe, it, expect } from 'vitest'
import type { ExecutionEvidenceRepository, SealedExecutionEvidence } from '@rohinik-org/execution-evidence-ir'
import {
  intelligentExecutionId,
  executionSessionId,
  makeContextAdmissionRef,
  EvidenceOutcome,
  EvidenceIntegrityStatus,
  EvidenceErrorCode,
  executionEvidenceId,
} from '@rohinik-org/execution-evidence-ir'
import {
  ExecutionEvidenceBuilder,
} from '@rohinik-org/execution-evidence'

export function makeTestBuilder() {
  let seq = 0
  return new ExecutionEvidenceBuilder(
    { now: () => new Date('2025-01-01T00:00:00.000Z') },
    { generate: () => `id-${++seq}` },
    { hash: (s: string) => 'h:' + s.slice(0, 8) },
  )
}

export function makeSealedRecord(b: ExecutionEvidenceBuilder, suffix = ''): SealedExecutionEvidence {
  const id = b.open({
    intelligentExecutionId: intelligentExecutionId(`exec${suffix}`),
    executionSessionId:     executionSessionId(`sess${suffix}`),
    operationKind:          'llm.invoke',
  })
  b.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'hash-c', false))
  return b.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
}

// Reusable conformance suite for future SQLite/Postgres stores.
export function conformanceSuite(factory: () => ExecutionEvidenceRepository): void {
  describe('repository conformance', () => {
    it('stores and retrieves a sealed record by evidenceId', async () => {
      const repo = factory()
      const r = makeSealedRecord(makeTestBuilder())
      await repo.store(r)
      const found = await repo.findById(r.evidenceId)
      expect(found).toBeDefined()
      expect(found!.evidenceId).toBe(r.evidenceId)
    })

    it('returns undefined for unknown evidenceId', async () => {
      const repo = factory()
      const found = await repo.findById(executionEvidenceId('unknown-ev'))
      expect(found).toBeUndefined()
    })

    it('verifyIntegrity returns VALID for intact record', async () => {
      const repo = factory()
      const r = makeSealedRecord(makeTestBuilder())
      await repo.store(r)
      const result = await repo.verifyIntegrity(r.evidenceId)
      expect(result.status).toBe(EvidenceIntegrityStatus.VALID)
    })

    it('verifyIntegrity returns NOT_FOUND for unknown ID', async () => {
      const repo = factory()
      const result = await repo.verifyIntegrity(executionEvidenceId('unknown-ev'))
      expect(result.status).toBe(EvidenceIntegrityStatus.NOT_FOUND)
    })

    it('idempotent: storing same record twice (same ID+hash) succeeds', async () => {
      const repo = factory()
      const r = makeSealedRecord(makeTestBuilder())
      await repo.store(r)
      await expect(repo.store(r)).resolves.toBeUndefined()
    })

    it('conflicting rewrite (same ID, different hash) throws', async () => {
      const repo = factory()
      const r1 = makeSealedRecord(makeTestBuilder(), '-a')
      await repo.store(r1)
      const r2: SealedExecutionEvidence = { ...r1, evidenceHash: 'tampered-hash' }
      await expect(repo.store(r2)).rejects.toThrow(EvidenceErrorCode.EVIDENCE_CONFLICTING_REWRITE)
    })

    it('stores multiple records independently', async () => {
      const repo = factory()
      const b = makeTestBuilder()
      const r1 = makeSealedRecord(b, '-1')
      const r2 = makeSealedRecord(b, '-2')
      await repo.store(r1)
      await repo.store(r2)
      expect(await repo.findById(r1.evidenceId)).toBeDefined()
      expect(await repo.findById(r2.evidenceId)).toBeDefined()
    })
  })
}
