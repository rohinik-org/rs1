import { describe, it, expect } from 'vitest'
import type { ContentHash } from '@rohinik-org/ml-ir'
import type { IsoTimestamp } from '../../src/index.js'
import {
  validateGovernanceEvidence,
  recordManualReview,
  type GovernanceEvidenceBundle,
  type SafetyEvidenceRef,
  type RobustnessEvidenceRef,
  type FairnessEvidenceRef,
  type PrivacyEvidenceRef,
  type ExplainabilityEvidenceRef,
  type ProhibitedUseEvidenceRef,
  type AdversarialTestEvidenceRef,
  type ManualReviewRecord,
  type GovernanceEvidenceValidationResult,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const H  = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS = (s: string) => s as IsoTimestamp

const NOW = TS('2024-06-01T10:00:00.000Z')

function makeSafetyRef(overrides?: Partial<SafetyEvidenceRef>): SafetyEvidenceRef {
  return {
    evidenceId: 'safety-001',
    policyId: 'policy-safety-v1',
    evidenceHash: H('safety'),
    outcome: 'PASS',
    recordedAt: NOW,
    authority: 'safety-team',
    ...overrides,
  }
}

function makeRobustnessRef(overrides?: Partial<RobustnessEvidenceRef>): RobustnessEvidenceRef {
  return {
    evidenceId: 'robustness-001',
    policyId: 'policy-robustness-v1',
    evidenceHash: H('robustness'),
    outcome: 'PASS',
    recordedAt: NOW,
    authority: 'robustness-team',
    ...overrides,
  }
}

function makeFairnessRef(overrides?: Partial<FairnessEvidenceRef>): FairnessEvidenceRef {
  return {
    evidenceId: 'fairness-001',
    policyId: 'policy-fairness-v1',
    evidenceHash: H('fairness'),
    outcome: 'PASS',
    recordedAt: NOW,
    authority: 'fairness-team',
    ...overrides,
  }
}

function makePrivacyRef(overrides?: Partial<PrivacyEvidenceRef>): PrivacyEvidenceRef {
  return {
    evidenceId: 'privacy-001',
    policyId: 'policy-privacy-v1',
    evidenceHash: H('privacy'),
    outcome: 'PASS',
    recordedAt: NOW,
    authority: 'privacy-team',
    ...overrides,
  }
}

function makeBundle(overrides?: Partial<GovernanceEvidenceBundle>): GovernanceEvidenceBundle {
  return {
    candidateArtifactId: 'artifact-001',
    safety: makeSafetyRef(),
    robustness: makeRobustnessRef(),
    fairness: makeFairnessRef(),
    privacy: makePrivacyRef(),
    ...overrides,
  }
}

function makeReview(overrides?: Partial<ManualReviewRecord>): ManualReviewRecord {
  return {
    reviewId: 'review-001',
    artifactId: 'artifact-001',
    reviewerPrincipalId: 'reviewer-alice',
    decision: 'APPROVED',
    rationale: 'all checks passed',
    reviewedAt: NOW,
    ...overrides,
  }
}

// ── complete evidence ─────────────────────────────────────────────────────────

describe('validateGovernanceEvidence: complete', () => {
  it('accepts complete bundle with all mandatory evidence', () => {
    const result = validateGovernanceEvidence(makeBundle())
    expect(result.eligible).toBe(true)
  })

  it('eligible result has evidenceBundleHash', () => {
    const result = validateGovernanceEvidence(makeBundle())
    expect(result.evidenceBundleHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('evidenceBundleHash is deterministic for same bundle', () => {
    const h1 = validateGovernanceEvidence(makeBundle()).evidenceBundleHash
    const h2 = validateGovernanceEvidence(makeBundle()).evidenceBundleHash
    expect(h1).toBe(h2)
  })

  it('different candidateArtifactId produces different hash', () => {
    const h1 = validateGovernanceEvidence(makeBundle({ candidateArtifactId: 'artifact-001' })).evidenceBundleHash
    const h2 = validateGovernanceEvidence(makeBundle({ candidateArtifactId: 'artifact-002' })).evidenceBundleHash
    expect(h1).not.toBe(h2)
  })
})

// ── missing mandatory evidence ────────────────────────────────────────────────

describe('validateGovernanceEvidence: missing mandatory', () => {
  it('missing safety blocks promotion', () => {
    const result = validateGovernanceEvidence(makeBundle({ safety: undefined }))
    expect(result.eligible).toBe(false)
    expect(result.missingMandatory).toContain('safety')
  })

  it('missing robustness blocks promotion', () => {
    const result = validateGovernanceEvidence(makeBundle({ robustness: undefined }))
    expect(result.eligible).toBe(false)
    expect(result.missingMandatory).toContain('robustness')
  })

  it('missing fairness blocks promotion', () => {
    const result = validateGovernanceEvidence(makeBundle({ fairness: undefined }))
    expect(result.eligible).toBe(false)
    expect(result.missingMandatory).toContain('fairness')
  })

  it('missing privacy blocks promotion', () => {
    const result = validateGovernanceEvidence(makeBundle({ privacy: undefined }))
    expect(result.eligible).toBe(false)
    expect(result.missingMandatory).toContain('privacy')
  })
})

// ── hard failure overrides ────────────────────────────────────────────────────

describe('validateGovernanceEvidence: hard failures', () => {
  it('safety FAIL blocks promotion even if all others pass', () => {
    const result = validateGovernanceEvidence(makeBundle({ safety: makeSafetyRef({ outcome: 'FAIL' }) }))
    expect(result.eligible).toBe(false)
    expect(result.hardFailures).toContain('safety')
  })

  it('privacy FAIL blocks promotion', () => {
    const result = validateGovernanceEvidence(makeBundle({ privacy: makePrivacyRef({ outcome: 'FAIL' }) }))
    expect(result.eligible).toBe(false)
    expect(result.hardFailures).toContain('privacy')
  })

  it('fairness FAIL blocks promotion', () => {
    const result = validateGovernanceEvidence(makeBundle({ fairness: makeFairnessRef({ outcome: 'FAIL' }) }))
    expect(result.eligible).toBe(false)
    expect(result.hardFailures).toContain('fairness')
  })
})

// ── self-evidence rejection ───────────────────────────────────────────────────

describe('validateGovernanceEvidence: self-evidence', () => {
  it('rejects when safety authority matches candidateArtifactId (sole self-authority)', () => {
    const result = validateGovernanceEvidence(
      makeBundle({ safety: makeSafetyRef({ authority: 'artifact-001' }) }),
    )
    expect(result.eligible).toBe(false)
    expect(result.selfEvidenceViolations).toContain('safety')
  })
})

// ── optional evidence ─────────────────────────────────────────────────────────

describe('validateGovernanceEvidence: optional evidence', () => {
  it('missing explainability does not block promotion (optional)', () => {
    const result = validateGovernanceEvidence(makeBundle({ explainability: undefined }))
    expect(result.eligible).toBe(true)
  })

  it('missing adversarialTest does not block promotion (optional)', () => {
    const result = validateGovernanceEvidence(makeBundle({ adversarialTest: undefined }))
    expect(result.eligible).toBe(true)
  })

  it('missing prohibitedUse does not block promotion (optional)', () => {
    const result = validateGovernanceEvidence(makeBundle({ prohibitedUse: undefined }))
    expect(result.eligible).toBe(true)
  })
})

// ── manual review ─────────────────────────────────────────────────────────────

describe('recordManualReview', () => {
  it('records approved review', () => {
    const store = new Map<string, ManualReviewRecord>()
    const result = recordManualReview(makeReview(), store)
    expect(result.inserted).toBe(true)
    expect(result.review.decision).toBe('APPROVED')
  })

  it('records rejected review', () => {
    const store = new Map<string, ManualReviewRecord>()
    const result = recordManualReview(makeReview({ decision: 'REJECTED', rationale: 'safety concerns' }), store)
    expect(result.inserted).toBe(true)
    expect(result.review.decision).toBe('REJECTED')
  })

  it('review has reviewHash', () => {
    const store = new Map<string, ManualReviewRecord>()
    const { review } = recordManualReview(makeReview(), store)
    expect(review.reviewHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('reviewHash is deterministic', () => {
    const s1 = new Map<string, ManualReviewRecord>()
    const s2 = new Map<string, ManualReviewRecord>()
    const h1 = recordManualReview(makeReview(), s1).review.reviewHash
    const h2 = recordManualReview(makeReview(), s2).review.reviewHash
    expect(h1).toBe(h2)
  })

  it('idempotent: same review twice → inserted=false, idempotent=true', () => {
    const store = new Map<string, ManualReviewRecord>()
    recordManualReview(makeReview(), store)
    const r2 = recordManualReview(makeReview(), store)
    expect(r2.inserted).toBe(false)
    expect(r2.idempotent).toBe(true)
  })

  it('conflict: same reviewId, different decision', () => {
    const store = new Map<string, ManualReviewRecord>()
    recordManualReview(makeReview(), store)
    const r2 = recordManualReview(makeReview({ decision: 'REJECTED' }), store)
    expect(r2.conflict).toBe(true)
  })

  it('rejects empty rationale', () => {
    const store = new Map<string, ManualReviewRecord>()
    expect(() => recordManualReview(makeReview({ rationale: '' }), store))
      .toThrow(/EVALUATION_REVIEW_INVALID/)
  })

  it('immutable: no mutable methods on returned review', () => {
    const store = new Map<string, ManualReviewRecord>()
    const { review } = recordManualReview(makeReview(), store)
    expect(typeof (review as unknown as Record<string, unknown>)['update']).not.toBe('function')
  })
})

// ── leakage sentinel ──────────────────────────────────────────────────────────

describe('governance evidence: leakage sentinel', () => {
  it('GovernanceEvidenceBundle has no rawData field', () => {
    const bundle = makeBundle()
    expect(Object.keys(bundle)).not.toContain('rawData')
  })

  it('validation result has no deployment or inference fields', () => {
    const result = validateGovernanceEvidence(makeBundle())
    const keys = Object.keys(result)
    expect(keys).not.toContain('deploymentId')
    expect(keys).not.toContain('endpointId')
    expect(keys).not.toContain('inferenceRequest')
  })
})
