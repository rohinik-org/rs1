import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, PromotionDecisionId } from '@rohinik-org/ml-ir'
import {
  recordRejectionDetail,
  assignReview,
  completeReview,
  recordSupersession,
  buildReEvaluationRequest,
  type RejectionDetail,
  type ReviewAssignment,
  type ReviewCompletion,
  type SupersessionRecord,
  type ReEvaluationRequest,
  type PromotionDecision,
} from '../../src/index.js'
import { makePromotionDecision } from '../../src/index.js'
import type { EvaluationId } from '@rohinik-org/ml-ir'

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const NOW2 = '2024-06-02T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash

function makeRejectedDecision(overrides?: { decisionId?: string }): PromotionDecision {
  return makePromotionDecision({
    decisionId: (overrides?.decisionId ?? 'dec-1') as PromotionDecisionId,
    evaluationId: 'eval-1' as EvaluationId,
    candidateArtifactId: 'art-1',
    candidateCanonicalHash: HASH,
    evaluationRunHash: HASH,
    baselineId: 'bl-1',
    comparativeResultHashes: [HASH],
    governanceEvidenceHash: HASH,
    targetEnvironments: ['prod'],
    evaluatorId: 'ext-evaluator',
    requestedBy: 'principal-1',
    decidedAt: NOW,
    stage11eEvidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
  }, 'REJECTED', 'MANDATORY_METRIC_FAILURE')
}

// ── recordRejectionDetail ─────────────────────────────────────────────────────

describe('recordRejectionDetail', () => {
  it('records detail for a REJECTED decision', () => {
    const d = makeRejectedDecision()
    const rd = recordRejectionDetail({ decisionId: 'dec-1', reason: 'accuracy below threshold', failedMetrics: ['accuracy'], recordedAt: NOW })
    expect(rd.decisionId).toBe('dec-1')
    expect(rd.failedMetrics).toContain('accuracy')
  })

  it('rejection remains auditable (detail is persisted)', () => {
    const store = new Map<string, RejectionDetail>()
    const rd = recordRejectionDetail({ decisionId: 'dec-1', reason: 'accuracy below threshold', failedMetrics: ['accuracy'], recordedAt: NOW }, store)
    expect(store.has('dec-1')).toBe(true)
    expect(store.get('dec-1')?.reason).toBe('accuracy below threshold')
  })

  it('empty reason throws EVALUATION_INVALID_IDENTITY', () => {
    expect(() => recordRejectionDetail({ decisionId: 'dec-1', reason: '', failedMetrics: [], recordedAt: NOW }))
      .toThrow('EVALUATION_INVALID_IDENTITY')
  })
})

// ── assignReview ──────────────────────────────────────────────────────────────

describe('assignReview', () => {
  it('creates a review assignment', () => {
    const a = assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: 'reviewer-alice', assignedAt: NOW })
    expect(a.reviewId).toBe('rev-1')
    expect(a.decisionId).toBe('dec-1')
    expect(a.reviewerPrincipalId).toBe('reviewer-alice')
    expect(a.completedAt).toBeUndefined()
  })

  it('empty reviewerPrincipalId throws EVALUATION_INVALID_IDENTITY', () => {
    expect(() => assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: '', assignedAt: NOW }))
      .toThrow('EVALUATION_INVALID_IDENTITY')
  })
})

// ── completeReview ────────────────────────────────────────────────────────────

describe('completeReview', () => {
  it('APPROVED completion creates new evidence', () => {
    const assignment = assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: 'alice', assignedAt: NOW })
    const completion = completeReview(assignment, { outcome: 'APPROVED', rationale: 'all checks passed', completedAt: NOW2 })
    expect(completion.outcome).toBe('APPROVED')
    expect(completion.reviewId).toBe('rev-1')
    expect(completion.completedAt).toBe(NOW2)
    expect(completion.reviewEvidenceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('DENIED completion recorded with rationale', () => {
    const assignment = assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: 'alice', assignedAt: NOW })
    const completion = completeReview(assignment, { outcome: 'DENIED', rationale: 'safety concerns remain', completedAt: NOW2 })
    expect(completion.outcome).toBe('DENIED')
    expect(completion.rationale).toBe('safety concerns remain')
  })

  it('review approval does not directly promote — no promotionDecision on completion', () => {
    const assignment = assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: 'alice', assignedAt: NOW })
    const completion = completeReview(assignment, { outcome: 'APPROVED', rationale: 'ok', completedAt: NOW2 })
    expect('promotionDecision' in completion).toBe(false)
  })

  it('review is immutable — completing same review twice with different outcome throws EVALUATION_REVIEW_IMMUTABLE', () => {
    const store = new Map<string, ReviewCompletion>()
    const assignment = assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: 'alice', assignedAt: NOW })
    completeReview(assignment, { outcome: 'APPROVED', rationale: 'ok', completedAt: NOW2 }, store)
    expect(() => completeReview(assignment, { outcome: 'DENIED', rationale: 'changed mind', completedAt: NOW2 }, store))
      .toThrow('EVALUATION_REVIEW_IMMUTABLE')
  })

  it('empty rationale throws EVALUATION_INVALID_IDENTITY', () => {
    const assignment = assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: 'alice', assignedAt: NOW })
    expect(() => completeReview(assignment, { outcome: 'APPROVED', rationale: '', completedAt: NOW2 }))
      .toThrow('EVALUATION_INVALID_IDENTITY')
  })
})

// ── recordSupersession ────────────────────────────────────────────────────────

describe('recordSupersession', () => {
  it('creates supersession linking prior to successor decision', () => {
    const s = recordSupersession({ supersessionId: 'sup-1', priorDecisionId: 'dec-1', successorDecisionId: 'dec-2', reason: 'new evidence', recordedAt: NOW, recordedBy: 'principal-1' })
    expect(s.priorDecisionId).toBe('dec-1')
    expect(s.successorDecisionId).toBe('dec-2')
  })

  it('prior decision is preserved — supersession does not delete it', () => {
    const store = new Map<string, PromotionDecision>()
    const d1 = makeRejectedDecision({ decisionId: 'dec-1' })
    store.set('dec-1', d1)
    recordSupersession({ supersessionId: 'sup-1', priorDecisionId: 'dec-1', successorDecisionId: 'dec-2', reason: 'new evidence', recordedAt: NOW, recordedBy: 'p' })
    // prior still present
    expect(store.has('dec-1')).toBe(true)
  })

  it('supersession chain is queryable', () => {
    const supStore = new Map<string, SupersessionRecord>()
    recordSupersession({ supersessionId: 'sup-1', priorDecisionId: 'dec-1', successorDecisionId: 'dec-2', reason: 'r1', recordedAt: NOW, recordedBy: 'p' }, supStore)
    recordSupersession({ supersessionId: 'sup-2', priorDecisionId: 'dec-2', successorDecisionId: 'dec-3', reason: 'r2', recordedAt: NOW2, recordedBy: 'p' }, supStore)
    const chain = getSupersessionChain('dec-1', supStore)
    expect(chain.length).toBe(2)
    expect(chain[0]?.priorDecisionId).toBe('dec-1')
    expect(chain[1]?.priorDecisionId).toBe('dec-2')
  })
})

import { getSupersessionChain } from '../../src/index.js'

// ── buildReEvaluationRequest ──────────────────────────────────────────────────

describe('buildReEvaluationRequest', () => {
  it('valid re-evaluation request with changed evidence', () => {
    const req = buildReEvaluationRequest({
      reEvalId: 're-eval-1',
      priorDecisionId: 'dec-1',
      candidateArtifactId: 'art-1',
      candidateCanonicalHash: HASH,
      changeJustification: 'updated safety evidence',
      changedComponents: ['governance-evidence'],
      requestedAt: NOW,
      requestedBy: 'principal-1',
    })
    expect(req.reEvalId).toBe('re-eval-1')
    expect(req.priorDecisionId).toBe('dec-1')
    expect(req.changedComponents).toContain('governance-evidence')
  })

  it('re-evaluation with no changed components throws EVALUATION_REEVALUATION_UNCHANGED', () => {
    expect(() => buildReEvaluationRequest({
      reEvalId: 're-eval-1',
      priorDecisionId: 'dec-1',
      candidateArtifactId: 'art-1',
      candidateCanonicalHash: HASH,
      changeJustification: 'trying again',
      changedComponents: [],
      requestedAt: NOW,
      requestedBy: 'principal-1',
    })).toThrow('EVALUATION_REEVALUATION_UNCHANGED')
  })

  it('empty changeJustification throws EVALUATION_INVALID_IDENTITY', () => {
    expect(() => buildReEvaluationRequest({
      reEvalId: 're-eval-1',
      priorDecisionId: 'dec-1',
      candidateArtifactId: 'art-1',
      candidateCanonicalHash: HASH,
      changeJustification: '',
      changedComponents: ['suite'],
      requestedAt: NOW,
      requestedBy: 'principal-1',
    })).toThrow('EVALUATION_INVALID_IDENTITY')
  })

  it('re-evaluation has no direct deployment authority', () => {
    const req = buildReEvaluationRequest({
      reEvalId: 're-eval-1',
      priorDecisionId: 'dec-1',
      candidateArtifactId: 'art-1',
      candidateCanonicalHash: HASH,
      changeJustification: 'updated evidence',
      changedComponents: ['suite'],
      requestedAt: NOW,
      requestedBy: 'p',
    })
    expect('deploymentId' in req).toBe(false)
  })
})
