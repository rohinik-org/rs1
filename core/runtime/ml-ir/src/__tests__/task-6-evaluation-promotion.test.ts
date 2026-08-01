import { describe, it, expect } from 'vitest'
import {
  evaluationId, promotionDecisionId, modelId, trainingRunId, datasetId,
  isoTimestamp, contentHash,
  type ModelEvaluationRequest, type ModelEvaluationResult, type ModelEvaluationState,
  type EvaluationSuiteReference, type EvaluationBaselineReference,
  type EvaluationDatasetBinding, type MetricResult,
  type PromotionRequest, type PromotionDecision, type PromotionReason,
  type DeploymentEnvironmentClass,
  validatePromotionRequest, validateEvaluationResult,
} from '../../src/index.js'

const EV_ID    = evaluationId('ev-001')
const PD_ID    = promotionDecisionId('pd-001')
const M_ID     = modelId('model-001')
const TR_ID    = trainingRunId('tr-001')
const DS_ID    = datasetId('ds-001')
const NOW      = isoTimestamp('2024-06-01T00:00:00.000Z')
const HASH     = contentHash('sha256:' + 'a'.repeat(64))

const baseResult: ModelEvaluationResult = {
  evaluationId: EV_ID,
  state: 'COMPLETED',
  modelId: M_ID,
  trainingRunId: TR_ID,
  datasetBinding: { datasetId: DS_ID, splitName: 'test', rowCount: 1000 },
  suiteReference: { suiteId: 'suite-001', suiteHash: 'sha256:' + 'b'.repeat(64) },
  baselineReference: { baselineModelId: M_ID, baselineEvaluationId: EV_ID },
  metrics: [
    { name: 'accuracy', value: 0.95, unit: 'fraction', higherIsBetter: true },
  ],
  evidenceReference: { kind: 'evidence', evidenceId: 'ev-ref', evidenceHash: 'sha256:' + 'c'.repeat(64) },
  completedAt: NOW,
  resultHash: HASH,
}

describe('ModelEvaluationState values', () => {
  it('includes PENDING, RUNNING, COMPLETED, FAILED', () => {
    const states: ModelEvaluationState[] = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']
    expect(states.length).toBe(4)
  })
})

describe('ModelEvaluationResult: completed result is valid', () => {
  it('validates a complete evaluation result', () => {
    expect(() => validateEvaluationResult(baseResult)).not.toThrow()
  })
})

describe('validateEvaluationResult: missing/incomplete', () => {
  it('rejects result with no metrics', () => {
    const bad: ModelEvaluationResult = { ...baseResult, metrics: [] }
    expect(() => validateEvaluationResult(bad)).toThrow()
  })

  it('rejects result with state != COMPLETED', () => {
    const bad: ModelEvaluationResult = { ...baseResult, state: 'RUNNING' }
    expect(() => validateEvaluationResult(bad)).toThrow()
  })

  it('rejects result with no evidenceReference', () => {
    const { evidenceReference: _, ...noEvidence } = baseResult
    expect(() => validateEvaluationResult(noEvidence as ModelEvaluationResult)).toThrow()
  })

  it('rejects result with no baselineReference', () => {
    const { baselineReference: _, ...noBaseline } = baseResult
    expect(() => validateEvaluationResult(noBaseline as ModelEvaluationResult)).toThrow()
  })
})

const basePromotion: PromotionRequest = {
  promotionDecisionId: PD_ID,
  modelId: M_ID,
  trainingRunId: TR_ID,
  evaluationId: EV_ID,
  evaluationResultHash: HASH,
  targetEnvironment: 'STAGING',
  reason: 'PASSED_EVALUATION',
  requestedAt: NOW,
}

describe('validatePromotionRequest: valid promotion', () => {
  it('accepts promotion backed by completed evaluation', () => {
    expect(() => validatePromotionRequest(basePromotion, baseResult)).not.toThrow()
  })
})

describe('validatePromotionRequest: LAW-067 training does not promote', () => {
  it('rejects promotion with no evaluationId', () => {
    const { evaluationId: _, ...noEval } = basePromotion
    expect(() => validatePromotionRequest(noEval as PromotionRequest, baseResult)).toThrow()
  })

  it('rejects promotion where evaluation state is not COMPLETED', () => {
    const incompleteResult: ModelEvaluationResult = { ...baseResult, state: 'RUNNING' }
    expect(() => validatePromotionRequest(basePromotion, incompleteResult)).toThrow()
  })
})

describe('validatePromotionRequest: LAW-068 evaluation before promotion', () => {
  it('rejects when evaluation modelId does not match promotion modelId', () => {
    const mismatch: ModelEvaluationResult = { ...baseResult, modelId: modelId('other-model') }
    expect(() => validatePromotionRequest(basePromotion, mismatch)).toThrow()
  })

  it('rejects when evaluationResultHash does not match result hash', () => {
    const hashMismatch: PromotionRequest = { ...basePromotion, evaluationResultHash: contentHash('sha256:' + 'f'.repeat(64)) }
    expect(() => validatePromotionRequest(hashMismatch, baseResult)).toThrow()
  })
})

describe('PromotionDecision: immutable once created', () => {
  it('PromotionDecision is readonly interface — structural type check', () => {
    const decision: PromotionDecision = {
      promotionDecisionId: PD_ID,
      modelId: M_ID,
      trainingRunId: TR_ID,
      evaluationId: EV_ID,
      targetEnvironment: 'STAGING',
      outcome: 'APPROVED',
      reason: 'PASSED_EVALUATION',
      decidedAt: NOW,
      decisionHash: HASH,
    }
    expect(decision.outcome).toBe('APPROVED')
  })

  it('REQUIRES_REVIEW is not promotion (outcome is not APPROVED)', () => {
    const decision: PromotionDecision = {
      promotionDecisionId: PD_ID,
      modelId: M_ID,
      trainingRunId: TR_ID,
      evaluationId: EV_ID,
      targetEnvironment: 'STAGING',
      outcome: 'REQUIRES_REVIEW',
      reason: 'PASSED_EVALUATION',
      decidedAt: NOW,
      decisionHash: HASH,
    }
    expect(decision.outcome).not.toBe('APPROVED')
  })
})

describe('DeploymentEnvironmentClass values', () => {
  it('includes STAGING and PRODUCTION', () => {
    const envs: DeploymentEnvironmentClass[] = ['STAGING', 'PRODUCTION', 'SHADOW', 'CANARY']
    expect(envs.length).toBe(4)
  })
})

describe('PromotionReason values', () => {
  it('includes expected promotion reason values', () => {
    const reasons: PromotionReason[] = ['PASSED_EVALUATION', 'BASELINE_EXCEPTION', 'MANUAL_APPROVAL']
    expect(reasons.length).toBe(3)
  })
})

describe('EvaluationSuiteReference and EvaluationBaselineReference', () => {
  it('EvaluationSuiteReference has suiteId and suiteHash', () => {
    const ref: EvaluationSuiteReference = { suiteId: 's-1', suiteHash: 'sha256:' + 'd'.repeat(64) }
    expect(ref.suiteId).toBe('s-1')
  })

  it('EvaluationBaselineReference has baselineModelId', () => {
    const ref: EvaluationBaselineReference = { baselineModelId: M_ID, baselineEvaluationId: EV_ID }
    expect(ref.baselineModelId).toBe(M_ID)
  })
})

describe('MetricResult', () => {
  it('MetricResult has name, value, and higherIsBetter', () => {
    const m: MetricResult = { name: 'f1', value: 0.87, unit: 'fraction', higherIsBetter: true }
    expect(m.value).toBe(0.87)
  })
})

describe('ModelEvaluationRequest', () => {
  it('can construct a valid request', () => {
    const req: ModelEvaluationRequest = {
      evaluationId: EV_ID,
      modelId: M_ID,
      trainingRunId: TR_ID,
      datasetBinding: { datasetId: DS_ID, splitName: 'test', rowCount: 500 },
      suiteReference: { suiteId: 'suite-x', suiteHash: 'sha256:' + 'e'.repeat(64) },
      requestedAt: NOW,
    }
    expect(req.modelId).toBe(M_ID)
  })
})

describe('round-trip and hash', () => {
  it('PromotionRequest serializes to JSON without loss', () => {
    const json = JSON.stringify(basePromotion)
    const parsed = JSON.parse(json) as PromotionRequest
    expect(parsed.promotionDecisionId).toBe(basePromotion.promotionDecisionId)
    expect(parsed.evaluationResultHash).toBe(basePromotion.evaluationResultHash)
  })
})
