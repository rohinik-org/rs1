import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, EvaluationId, PromotionDecisionId } from '@rohinik-org/ml-ir'
import {
  makePromotionDecision,
  type PromotionDecision,
  type PromotionDecisionOutcome,
  type PromotionDecisionInput,
  type PromotionDecisionRejectReason,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash

function makeInput(overrides?: Partial<PromotionDecisionInput>): PromotionDecisionInput {
  return {
    decisionId: 'dec-1' as PromotionDecisionId,
    evaluationId: 'eval-1' as EvaluationId,
    candidateArtifactId: 'art-1',
    candidateCanonicalHash: HASH,
    evaluationRunHash: HASH,
    baselineId: 'bl-1',
    comparativeResultHashes: [HASH],
    governanceEvidenceHash: HASH,
    targetEnvironments: ['prod'],
    evaluatorId: 'external-evaluator',
    requestedBy: 'principal-1',
    decidedAt: NOW,
    stage11eEvidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    ...overrides,
  }
}

// ── PROMOTED outcome ──────────────────────────────────────────────────────────

describe('makePromotionDecision: PROMOTED', () => {
  it('valid input with all checks passed returns PROMOTED', () => {
    const d = makePromotionDecision(makeInput(), 'PROMOTED')
    expect(d.outcome).toBe('PROMOTED')
    expect(d.decisionId).toBe('dec-1')
    expect(d.candidateArtifactId).toBe('art-1')
    expect(d.targetEnvironments).toEqual(['prod'])
  })

  it('decision carries Stage 11E evidence reference', () => {
    const d = makePromotionDecision(makeInput(), 'PROMOTED')
    expect(d.stage11eEvidenceRef.evidenceId).toBe('ev-1')
    expect(d.stage11eEvidenceRef.evidenceHash).toBe(HASH)
  })

  it('canonical decision hash is deterministic', () => {
    const input = makeInput()
    const d1 = makePromotionDecision(input, 'PROMOTED')
    const d2 = makePromotionDecision(input, 'PROMOTED')
    expect(d1.decisionHash).toBe(d2.decisionHash)
    expect(d1.decisionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('different candidateCanonicalHash produces different decisionHash', () => {
    const d1 = makePromotionDecision(makeInput({ candidateCanonicalHash: HASH }), 'PROMOTED')
    const d2 = makePromotionDecision(makeInput({ candidateCanonicalHash: HASH2 }), 'PROMOTED')
    expect(d1.decisionHash).not.toBe(d2.decisionHash)
  })
})

// ── REJECTED outcome ──────────────────────────────────────────────────────────

describe('makePromotionDecision: REJECTED', () => {
  it('REJECTED with reason code', () => {
    const d = makePromotionDecision(makeInput(), 'REJECTED', 'MANDATORY_METRIC_FAILURE')
    expect(d.outcome).toBe('REJECTED')
    expect(d.rejectReason).toBe('MANDATORY_METRIC_FAILURE')
  })

  it('all 10 reject reasons are valid', () => {
    const reasons: PromotionDecisionRejectReason[] = [
      'INVALID_IDENTITY',
      'INCOMPLETE_EVALUATION',
      'MISSING_BASELINE',
      'CONTRADICTORY_EVIDENCE',
      'HARD_SAFETY_FAILURE',
      'MANDATORY_METRIC_FAILURE',
      'MISSING_GOVERNANCE_EVIDENCE',
      'MANUAL_REVIEW_REQUIRED',
      'ENVIRONMENT_RESTRICTION',
      'POLICY_FAILURE',
    ]
    for (const reason of reasons) {
      const d = makePromotionDecision(makeInput(), 'REJECTED', reason)
      expect(d.rejectReason).toBe(reason)
    }
  })
})

// ── REQUIRES_REVIEW outcome ───────────────────────────────────────────────────

describe('makePromotionDecision: REQUIRES_REVIEW', () => {
  it('REQUIRES_REVIEW outcome is produced', () => {
    const d = makePromotionDecision(makeInput(), 'REQUIRES_REVIEW', 'MANUAL_REVIEW_REQUIRED')
    expect(d.outcome).toBe('REQUIRES_REVIEW')
  })
})

// ── identity / hash validation ────────────────────────────────────────────────

describe('makePromotionDecision: identity validation', () => {
  it('empty decisionId throws EVALUATION_INVALID_IDENTITY', () => {
    expect(() => makePromotionDecision(makeInput({ decisionId: '' as PromotionDecisionId }), 'PROMOTED'))
      .toThrow('EVALUATION_INVALID_IDENTITY')
  })

  it('empty candidateArtifactId throws EVALUATION_INVALID_IDENTITY', () => {
    expect(() => makePromotionDecision(makeInput({ candidateArtifactId: '' }), 'PROMOTED'))
      .toThrow('EVALUATION_INVALID_IDENTITY')
  })

  it('invalid candidateCanonicalHash format throws EVALUATION_CANDIDATE_HASH_MISMATCH', () => {
    expect(() => makePromotionDecision(makeInput({ candidateCanonicalHash: 'bad-hash' as ContentHash }), 'PROMOTED'))
      .toThrow('EVALUATION_CANDIDATE_HASH_MISMATCH')
  })
})

// ── self-promotion prevention ─────────────────────────────────────────────────

describe('makePromotionDecision: no self-promotion', () => {
  it('evaluatorId matching candidateArtifactId throws EVALUATION_NO_PROMOTION_AUTHORITY', () => {
    expect(() => makePromotionDecision(makeInput({ evaluatorId: 'art-1', candidateArtifactId: 'art-1' }), 'PROMOTED'))
      .toThrow('EVALUATION_NO_PROMOTION_AUTHORITY')
  })
})

// ── environment eligibility ───────────────────────────────────────────────────

describe('makePromotionDecision: environment eligibility', () => {
  it('empty targetEnvironments throws EVALUATION_ENVIRONMENT_INELIGIBLE', () => {
    expect(() => makePromotionDecision(makeInput({ targetEnvironments: [] }), 'PROMOTED'))
      .toThrow('EVALUATION_ENVIRONMENT_INELIGIBLE')
  })

  it('multiple environments are recorded on decision', () => {
    const d = makePromotionDecision(makeInput({ targetEnvironments: ['prod', 'staging'] }), 'PROMOTED')
    expect(d.targetEnvironments).toContain('prod')
    expect(d.targetEnvironments).toContain('staging')
  })
})

// ── Stage 11E evidence required ───────────────────────────────────────────────

describe('makePromotionDecision: Stage 11E evidence', () => {
  it('missing evidenceId throws EVALUATION_EVIDENCE_FAILURE', () => {
    expect(() => makePromotionDecision(makeInput({ stage11eEvidenceRef: { evidenceId: '', evidenceHash: HASH } }), 'PROMOTED'))
      .toThrow('EVALUATION_EVIDENCE_FAILURE')
  })

  it('invalid evidenceHash format throws EVALUATION_EVIDENCE_FAILURE', () => {
    expect(() => makePromotionDecision(makeInput({ stage11eEvidenceRef: { evidenceId: 'ev-1', evidenceHash: 'bad' as ContentHash } }), 'PROMOTED'))
      .toThrow('EVALUATION_EVIDENCE_FAILURE')
  })
})

// ── immutability: replay is idempotent, rewrite fails ────────────────────────

describe('PromotionDecision immutability', () => {
  it('same input registered twice is idempotent', () => {
    const store = new Map<string, PromotionDecision>()
    const input = makeInput()
    const d1 = makePromotionDecision(input, 'PROMOTED', undefined, store)
    const d2 = makePromotionDecision(input, 'PROMOTED', undefined, store)
    expect(d1.decisionHash).toBe(d2.decisionHash)
    expect(store.size).toBe(1)
  })

  it('same decisionId with different outcome throws EVALUATION_DECISION_CONFLICT', () => {
    const store = new Map<string, PromotionDecision>()
    makePromotionDecision(makeInput(), 'PROMOTED', undefined, store)
    expect(() => makePromotionDecision(makeInput(), 'REJECTED', 'POLICY_FAILURE', store))
      .toThrow('EVALUATION_DECISION_CONFLICT')
  })
})

// ── decision has no deployment ────────────────────────────────────────────────

describe('PromotionDecision has no deployment', () => {
  it('PROMOTED decision has no deploymentId or deploymentRef', () => {
    const d = makePromotionDecision(makeInput(), 'PROMOTED')
    expect('deploymentId' in d).toBe(false)
    expect('deploymentRef' in d).toBe(false)
  })
})
