import { describe, it, expect } from 'vitest'
import { MemoryEvidenceRepository } from '../memory-repository.js'
import { conformanceSuite, makeTestBuilder, makeSealedRecord } from '../conformance.js'
import { EvidenceIntegrityStatus } from '@rohinik-org/execution-evidence-ir'

// ── Conformance (shared suite) ────────────────────────────────────────────────

conformanceSuite(() => new MemoryEvidenceRepository())

// ── In-memory specific ────────────────────────────────────────────────────────

describe('MemoryEvidenceRepository — integrity verification', () => {
  it('verifyIntegrity returns INTEGRITY_FAILED when stored hash tampered', async () => {
    const repo = new MemoryEvidenceRepository()
    const r = makeSealedRecord(makeTestBuilder())
    await repo.store(r)
    repo.forceCorrupt(r.evidenceId, 'tampered')
    const result = await repo.verifyIntegrity(r.evidenceId)
    expect(result.status).toBe(EvidenceIntegrityStatus.INTEGRITY_FAILED)
  })

  it('does not mutate stored record to mark integrity failure', async () => {
    const repo = new MemoryEvidenceRepository()
    const r = makeSealedRecord(makeTestBuilder())
    await repo.store(r)
    repo.forceCorrupt(r.evidenceId, 'tampered')
    await repo.verifyIntegrity(r.evidenceId)
    const found = await repo.findById(r.evidenceId)
    // The evidenceHash in store reflects corruption but record struct is not re-written
    expect(found!.evidenceHash).toBe('tampered')
  })
})
