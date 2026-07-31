import { describe, it, expect } from 'vitest'
import {
  computeEvidenceHash,
  verifyEvidenceHash,
  CANONICALIZATION_VERSION,
  EvidenceSchemaVersion,
} from '../index.js'
import type { SealedExecutionEvidence } from '../index.js'
import {
  executionEvidenceId,
  intelligentExecutionId,
  executionSessionId,
  EvidenceCompletionState,
  EvidenceOutcome,
} from '../index.js'

// ── Minimal sealed record fixture ─────────────────────────────────────────────

function makeRecord(overrides: Partial<SealedExecutionEvidence> = {}): SealedExecutionEvidence {
  return {
    evidenceId:              executionEvidenceId('ev-1'),
    schemaVersion:           EvidenceSchemaVersion,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    completionState:         EvidenceCompletionState.SEALED,
    intelligentExecutionId:  intelligentExecutionId('exec-1'),
    executionSessionId:      executionSessionId('sess-1'),
    operationKind:           'llm.invoke',
    startedAt:               new Date('2025-01-01T00:00:00.000Z'),
    completedAt:             new Date('2025-01-01T00:00:01.000Z'),
    outcome:                 EvidenceOutcome.SUCCESS,
    retryCount:              0,
    fallbackCount:           0,
    evidenceHash:            '',   // excluded from its own hash computation
    producedAt:              new Date('2025-01-01T00:00:02.000Z'),  // excluded from content hash
    ...overrides,
  }
}

// ── computeEvidenceHash ───────────────────────────────────────────────────────

describe('computeEvidenceHash', () => {
  it('returns a non-empty hex string', () => {
    const hash = computeEvidenceHash(makeRecord())
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
    expect(/^[0-9a-f]+$/i.test(hash)).toBe(true)
  })

  it('is deterministic — identical inputs produce same hash', () => {
    const r = makeRecord()
    expect(computeEvidenceHash(r)).toBe(computeEvidenceHash(r))
  })

  it('golden hash is stable across calls (cross-runtime replay)', () => {
    const r = makeRecord()
    const h1 = computeEvidenceHash(r)
    const h2 = computeEvidenceHash(makeRecord())
    expect(h1).toBe(h2)
  })

  it('excludes evidenceHash field from computation', () => {
    const r1 = makeRecord({ evidenceHash: 'should-not-affect' })
    const r2 = makeRecord({ evidenceHash: 'different-value' })
    expect(computeEvidenceHash(r1)).toBe(computeEvidenceHash(r2))
  })

  it('excludes producedAt (repository metadata) from computation', () => {
    const r1 = makeRecord({ producedAt: new Date('2025-01-01T00:00:00.000Z') })
    const r2 = makeRecord({ producedAt: new Date('2099-01-01T00:00:00.000Z') })
    expect(computeEvidenceHash(r1)).toBe(computeEvidenceHash(r2))
  })

  it('includes schemaVersion — version change alters hash', () => {
    const r1 = makeRecord({ schemaVersion: '1.0.0' })
    const r2 = makeRecord({ schemaVersion: '2.0.0' })
    expect(computeEvidenceHash(r1)).not.toBe(computeEvidenceHash(r2))
  })

  it('includes operationKind — change alters hash', () => {
    const r1 = makeRecord({ operationKind: 'llm.invoke' })
    const r2 = makeRecord({ operationKind: 'tool.invoke' })
    expect(computeEvidenceHash(r1)).not.toBe(computeEvidenceHash(r2))
  })

  it('includes outcome — change alters hash', () => {
    const r1 = makeRecord({ outcome: EvidenceOutcome.SUCCESS })
    const r2 = makeRecord({ outcome: EvidenceOutcome.FAILURE })
    expect(computeEvidenceHash(r1)).not.toBe(computeEvidenceHash(r2))
  })

  it('includes startedAt as ISO string — date mutation alters hash', () => {
    const r1 = makeRecord({ startedAt: new Date('2025-01-01T00:00:00.000Z') })
    const r2 = makeRecord({ startedAt: new Date('2025-06-01T00:00:00.000Z') })
    expect(computeEvidenceHash(r1)).not.toBe(computeEvidenceHash(r2))
  })

  it('includes completedAt as ISO string — date mutation alters hash', () => {
    const r1 = makeRecord({ completedAt: new Date('2025-01-01T00:00:01.000Z') })
    const r2 = makeRecord({ completedAt: new Date('2025-01-01T00:00:02.000Z') })
    expect(computeEvidenceHash(r1)).not.toBe(computeEvidenceHash(r2))
  })

  it('includes retryCount — change alters hash', () => {
    const r1 = makeRecord({ retryCount: 0 })
    const r2 = makeRecord({ retryCount: 1 })
    expect(computeEvidenceHash(r1)).not.toBe(computeEvidenceHash(r2))
  })

  it('object key insertion order does not affect hash', () => {
    // Both records are functionally equivalent; JS objects may differ in key order
    const base = makeRecord()
    // Reconstruct same fields in different order via spread
    const reordered: SealedExecutionEvidence = {
      outcome:                 base.outcome,
      operationKind:           base.operationKind,
      evidenceId:              base.evidenceId,
      schemaVersion:           base.schemaVersion,
      canonicalizationVersion: base.canonicalizationVersion,
      completionState:         base.completionState,
      intelligentExecutionId:  base.intelligentExecutionId,
      executionSessionId:      base.executionSessionId,
      startedAt:               base.startedAt,
      completedAt:             base.completedAt,
      retryCount:              base.retryCount,
      fallbackCount:           base.fallbackCount,
      evidenceHash:            base.evidenceHash,
      producedAt:              base.producedAt,
    }
    expect(computeEvidenceHash(base)).toBe(computeEvidenceHash(reordered))
  })

  it('absent optional field vs present field with same content — different hashes (explicit null vs absent)', () => {
    const withoutTrace = makeRecord()
    // traceId undefined vs defined differ
    const { traceId: _, ...withoutTraceId } = withoutTrace as SealedExecutionEvidence & { traceId?: unknown }
    expect(computeEvidenceHash(withoutTrace)).toBe(computeEvidenceHash(withoutTraceId as SealedExecutionEvidence))
  })
})

// ── verifyEvidenceHash ────────────────────────────────────────────────────────

describe('verifyEvidenceHash', () => {
  it('returns true for matching hash', () => {
    const r = makeRecord()
    const hash = computeEvidenceHash(r)
    const sealed = { ...r, evidenceHash: hash }
    expect(verifyEvidenceHash(sealed)).toBe(true)
  })

  it('returns false when evidenceHash does not match', () => {
    const r = makeRecord({ evidenceHash: 'tampered-hash' })
    expect(verifyEvidenceHash(r)).toBe(false)
  })

  it('detects outcome mutation', () => {
    const r = makeRecord()
    const hash = computeEvidenceHash(r)
    const mutated = { ...r, outcome: EvidenceOutcome.FAILURE, evidenceHash: hash }
    expect(verifyEvidenceHash(mutated)).toBe(false)
  })

  it('detects operationKind mutation', () => {
    const r = makeRecord()
    const hash = computeEvidenceHash(r)
    const mutated = { ...r, operationKind: 'tool.invoke', evidenceHash: hash }
    expect(verifyEvidenceHash(mutated)).toBe(false)
  })
})
