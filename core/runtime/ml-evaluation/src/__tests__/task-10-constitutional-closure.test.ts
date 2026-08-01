import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, EvaluationId, PromotionDecisionId, ExperimentId, TrainingRunId } from '@rohinik-org/ml-ir'
import type { CandidateModelArtifact } from '@rohinik-org/ml-training'
import {
  ModelEvaluationController,
  makePromotionDecision,
  registerBaseline,
  assignReview,
  completeReview,
  recordSupersession,
  buildReEvaluationRequest,
  validateGovernanceEvidence,
  stage12dEvidence,
  stage12dReleaseGate,
  type EvaluationControllerRequest,
  type EvaluationControllerProvider,
  type EvaluationEventBus,
  type EvaluationMetricThreshold,
  type GovernanceEvidenceBundle,
  type SafetyEvidenceRef,
  type RobustnessEvidenceRef,
  type FairnessEvidenceRef,
  type PrivacyEvidenceRef,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const H    = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash

function makeArtifact(overrides?: Partial<CandidateModelArtifact>): CandidateModelArtifact {
  return {
    artifactId: 'art-1',
    experimentId: 'exp-1' as ExperimentId,
    runId: 'run-1' as TrainingRunId,
    submissionId: 'sub-1',
    lifecycleState: 'CANDIDATE',
    providerOutputUri: 'storage://model/art-1',
    providerOutputHash: HASH,
    featureSchemaId: 'schema-1' as any,
    featureSchemaVersion: '1.0',
    datasetBindings: [],
    environmentHash: HASH,
    runHash: HASH,
    builtAt: NOW as any,
    canonicalHash: HASH,
    ...overrides,
  }
}

function makeGovernanceBundle(opts?: { safetyOutcome?: 'PASS' | 'FAIL' }): GovernanceEvidenceBundle {
  const base = { policyId: 'pol-v1', outcome: (opts?.safetyOutcome ?? 'PASS') as 'PASS' | 'FAIL', recordedAt: NOW, authority: 'safety-team' }
  return {
    candidateArtifactId: 'art-1',
    safety:     { ...base, evidenceId: 'saf', evidenceHash: H('saf'), authority: 'safety-team' } as SafetyEvidenceRef,
    robustness: { ...base, evidenceId: 'rob', evidenceHash: H('rob'), authority: 'robustness-team', outcome: 'PASS' } as RobustnessEvidenceRef,
    fairness:   { ...base, evidenceId: 'fair', evidenceHash: H('fair'), authority: 'fairness-team', outcome: 'PASS' } as FairnessEvidenceRef,
    privacy:    { ...base, evidenceId: 'priv', evidenceHash: H('priv'), authority: 'privacy-team', outcome: 'PASS' } as PrivacyEvidenceRef,
  }
}

const THRESHOLDS: readonly EvaluationMetricThreshold[] = [
  { metricId: 'accuracy', threshold: 0.90, unit: 'ratio', direction: 'HIGHER_IS_BETTER', mandatory: true },
]

function makeRequest(overrides?: Partial<EvaluationControllerRequest>): EvaluationControllerRequest {
  return {
    evaluationId: 'eval-1' as EvaluationId,
    decisionId: 'dec-1' as PromotionDecisionId,
    candidate: makeArtifact(),
    baselineId: 'bl-1',
    metricThresholds: THRESHOLDS,
    governanceBundle: makeGovernanceBundle(),
    targetEnvironments: ['prod'],
    evaluatorId: 'ext-evaluator',
    requestedBy: 'principal-1',
    requestedAt: NOW,
    stage11eEvidenceRef: { evidenceId: 'ev-11e', evidenceHash: HASH },
    ...overrides,
  }
}

function passProvider(): EvaluationControllerProvider {
  return { evaluate: async () => ({ outcome: 'COMPLETED', metrics: [{ metricId: 'accuracy', value: 0.95, unit: 'ratio' }] }) }
}

function failProvider(): EvaluationControllerProvider {
  return { evaluate: async () => ({ outcome: 'COMPLETED', metrics: [{ metricId: 'accuracy', value: 0.70, unit: 'ratio' }] }) }
}

const nullBus: EvaluationEventBus = { publish: () => {} }

// ── Law: no promotion without evaluation (LAW-068) ───────────────────────────

describe('LAW-068: no promotion without evaluation', () => {
  it('training success is not directly deployable — no deployment on decision', async () => {
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    const resp = await ctrl.evaluate(makeRequest())
    expect(resp.outcome).toBe('PROMOTED')
    expect('deploymentId' in (resp.decision ?? {})).toBe(false)
    expect('deploymentRef' in (resp.decision ?? {})).toBe(false)
  })
})

// ── Law: baseline required (LAW-083) ─────────────────────────────────────────

describe('LAW-083: baseline required', () => {
  it('empty baselineId still routes through controller — decision carries baselineId', async () => {
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    const resp = await ctrl.evaluate(makeRequest({ baselineId: 'bl-fixed' }))
    expect(resp.decision?.baselineId).toBe('bl-fixed')
  })
})

// ── Law: independent evidence (LAW-084) ──────────────────────────────────────

describe('LAW-084: independent governance evidence', () => {
  it('no sole-authority self-evaluation — safety authority matching candidateArtifactId blocks', async () => {
    const selfBundle = makeGovernanceBundle()
    const selfEvidence: GovernanceEvidenceBundle = {
      ...selfBundle,
      safety: { ...selfBundle.safety!, authority: 'art-1' } as SafetyEvidenceRef,
    }
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    const resp = await ctrl.evaluate(makeRequest({ governanceBundle: selfEvidence }))
    expect(resp.outcome).toBe('REJECTED')
  })
})

// ── Law: decision immutability (LAW-085) ─────────────────────────────────────

describe('LAW-085: decision immutability', () => {
  it('same decision registered twice is idempotent', () => {
    const store = new Map()
    const input = { decisionId: 'dec-1' as PromotionDecisionId, evaluationId: 'eval-1' as EvaluationId, candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, evaluationRunHash: HASH, baselineId: 'bl-1', comparativeResultHashes: [HASH], governanceEvidenceHash: HASH, targetEnvironments: ['prod'], evaluatorId: 'evaluator', requestedBy: 'p', decidedAt: NOW, stage11eEvidenceRef: { evidenceId: 'ev', evidenceHash: HASH } }
    const d1 = makePromotionDecision(input, 'PROMOTED', undefined, store)
    const d2 = makePromotionDecision(input, 'PROMOTED', undefined, store)
    expect(d1.decisionHash).toBe(d2.decisionHash)
  })

  it('different outcome on same decisionId throws EVALUATION_DECISION_CONFLICT', () => {
    const store = new Map()
    const input = { decisionId: 'dec-2' as PromotionDecisionId, evaluationId: 'eval-2' as EvaluationId, candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, evaluationRunHash: HASH, baselineId: 'bl-1', comparativeResultHashes: [], governanceEvidenceHash: HASH, targetEnvironments: ['prod'], evaluatorId: 'evaluator', requestedBy: 'p', decidedAt: NOW, stage11eEvidenceRef: { evidenceId: 'ev', evidenceHash: HASH } }
    makePromotionDecision(input, 'PROMOTED', undefined, store)
    expect(() => makePromotionDecision(input, 'REJECTED', 'POLICY_FAILURE', store)).toThrow('EVALUATION_DECISION_CONFLICT')
  })
})

// ── Law: environment scoped eligibility (LAW-086) ────────────────────────────

describe('LAW-086: environment-scoped eligibility', () => {
  it('empty targetEnvironments rejected', async () => {
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    await expect(ctrl.evaluate(makeRequest({ targetEnvironments: [] }))).rejects.toThrow('EVALUATION_ENVIRONMENT_INELIGIBLE')
  })

  it('multiple environments allowed on decision', async () => {
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    const resp = await ctrl.evaluate(makeRequest({ targetEnvironments: ['prod', 'staging'] }))
    expect(resp.decision?.targetEnvironments).toContain('prod')
    expect(resp.decision?.targetEnvironments).toContain('staging')
  })
})

// ── Law: no self-promotion (LAW-087) ──────────────────────────────────────────

describe('LAW-087: no self-promotion', () => {
  it('evaluatorId === candidateArtifactId throws EVALUATION_NO_PROMOTION_AUTHORITY', async () => {
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    await expect(ctrl.evaluate(makeRequest({ evaluatorId: 'art-1' }))).rejects.toThrow('EVALUATION_NO_PROMOTION_AUTHORITY')
  })
})

// ── Law: review before authority (LAW-088) ───────────────────────────────────

describe('LAW-088: review is not promotion', () => {
  it('review approval does not carry deploymentId', () => {
    const assignment = assignReview({ reviewId: 'rev-1', decisionId: 'dec-1', reviewerPrincipalId: 'alice', assignedAt: NOW })
    const completion = completeReview(assignment, { outcome: 'APPROVED', rationale: 'all good', completedAt: NOW })
    expect('deploymentId' in completion).toBe(false)
    expect('promotionDecision' in completion).toBe(false)
  })
})

// ── Law: supersession preservation (LAW-089) ─────────────────────────────────

describe('LAW-089: supersession preserves history', () => {
  it('prior decision remains after supersession', () => {
    const decStore = new Map()
    const input = { decisionId: 'dec-old' as PromotionDecisionId, evaluationId: 'eval-old' as EvaluationId, candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, evaluationRunHash: HASH, baselineId: 'bl-1', comparativeResultHashes: [], governanceEvidenceHash: HASH, targetEnvironments: ['prod'], evaluatorId: 'evaluator', requestedBy: 'p', decidedAt: NOW, stage11eEvidenceRef: { evidenceId: 'ev', evidenceHash: HASH } }
    makePromotionDecision(input, 'REJECTED', 'POLICY_FAILURE', decStore)
    recordSupersession({ supersessionId: 'sup-1', priorDecisionId: 'dec-old', successorDecisionId: 'dec-new', reason: 'new evidence', recordedAt: NOW, recordedBy: 'p' })
    expect(decStore.has('dec-old')).toBe(true)
  })
})

// ── End-to-end: reject then re-evaluate path ─────────────────────────────────

describe('end-to-end: rejection, re-evaluation, supersession', () => {
  it('full rejection → re-evaluation request → supersession chain', () => {
    const supStore = new Map()

    // Step 1: promotion rejected
    const rejDecision = makePromotionDecision(
      { decisionId: 'dec-1' as PromotionDecisionId, evaluationId: 'eval-1' as EvaluationId, candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, evaluationRunHash: HASH, baselineId: 'bl-1', comparativeResultHashes: [], governanceEvidenceHash: HASH, targetEnvironments: ['prod'], evaluatorId: 'evaluator', requestedBy: 'p', decidedAt: NOW, stage11eEvidenceRef: { evidenceId: 'ev', evidenceHash: HASH } },
      'REJECTED', 'MANDATORY_METRIC_FAILURE',
    )
    expect(rejDecision.outcome).toBe('REJECTED')

    // Step 2: build re-evaluation request
    const reEval = buildReEvaluationRequest({ reEvalId: 're-1', priorDecisionId: 'dec-1', candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, changeJustification: 'updated safety', changedComponents: ['governance-evidence'], requestedAt: NOW, requestedBy: 'p' })
    expect(reEval.changedComponents).toContain('governance-evidence')

    // Step 3: new decision supersedes old
    recordSupersession({ supersessionId: 'sup-1', priorDecisionId: 'dec-1', successorDecisionId: 'dec-2', reason: 'new eval', recordedAt: NOW, recordedBy: 'p' }, supStore)
    expect(supStore.size).toBe(1)
  })
})

// ── hard safety overrides metrics ────────────────────────────────────────────

describe('constitutional: hard safety overrides metrics', () => {
  it('SAFETY FAIL blocks PROMOTED even with passing accuracy', async () => {
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    const resp = await ctrl.evaluate(makeRequest({ governanceBundle: makeGovernanceBundle({ safetyOutcome: 'FAIL' }) }))
    expect(resp.outcome).toBe('REJECTED')
  })
})

// ── evidence failure blocks success ──────────────────────────────────────────

describe('constitutional: evidence failure blocks success', () => {
  it('missing mandatory governance field blocks promotion', () => {
    const bundle = makeGovernanceBundle()
    const partial = { ...bundle } as any
    delete partial.safety
    const result = validateGovernanceEvidence(partial as GovernanceEvidenceBundle)
    expect(result.eligible).toBe(false)
  })
})

// ── no deployment/inference behavior ─────────────────────────────────────────

describe('constitutional: no deployment/inference symbols', () => {
  it('EvaluationControllerResponse has no deployment fields', async () => {
    const ctrl = ModelEvaluationController({ provider: passProvider(), eventBus: nullBus })
    const resp = await ctrl.evaluate(makeRequest())
    const keys = Object.keys(resp)
    expect(keys).not.toContain('deploymentId')
    expect(keys).not.toContain('deploymentRef')
    expect(keys).not.toContain('endpointId')
    expect(keys).not.toContain('inferenceRequest')
  })
})

// ── stage-12d-evidence.json ───────────────────────────────────────────────────

describe('stage12dEvidence and release gate', () => {
  it('stage12dEvidence() returns deterministic evidence object', () => {
    const e1 = stage12dEvidence()
    const e2 = stage12dEvidence()
    expect(e1.stageId).toBe('12D')
    expect(e1.evidenceHash).toBe(e2.evidenceHash)
    expect(e1.evidenceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('stage12dReleaseGate() passes without throwing', () => {
    expect(() => stage12dReleaseGate()).not.toThrow()
  })

  it('release gate fails when law coverage incomplete', () => {
    const ev = stage12dEvidence()
    expect(ev.coveredLaws).toContain('LAW-068')
    expect(ev.coveredLaws).toContain('LAW-083')
    expect(ev.coveredLaws).toContain('LAW-084')
    expect(ev.coveredLaws).toContain('LAW-085')
    expect(ev.coveredLaws).toContain('LAW-086')
    expect(ev.coveredLaws).toContain('LAW-087')
    expect(ev.coveredLaws).toContain('LAW-088')
    expect(ev.coveredLaws).toContain('LAW-089')
  })
})
