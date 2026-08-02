import { describe, it, expect } from 'vitest'
import type { DeploymentId, ModelId, IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildRetrainingRequest,
  buildRollbackRecommendationRequest,
  buildTrafficChangeRequest,
  buildHumanReviewRequest,
  type CrossStageRequestRecord,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const MOD  = 'model-1' as ModelId

const BASE = {
  requestId: 'csr-1',
  deploymentId: DEP,
  modelId: MOD,
  sourceRecommendationId: 'rec-1',
  sourceRecommendationHash: HASH,
  requestedAt: NOW,
  requestedBy: 'p',
  evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
  rationale: 'drift detected',
}

// ── buildRetrainingRequest ────────────────────────────────────────────────────

describe('buildRetrainingRequest', () => {
  it('valid request has requestHash', () => {
    const r = buildRetrainingRequest(BASE)
    expect(r.requestId).toBe('csr-1')
    expect(r.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(r.kind).toBe('RETRAINING')
  })

  it('requestHash is deterministic', () => {
    expect(buildRetrainingRequest(BASE).requestHash).toBe(buildRetrainingRequest(BASE).requestHash)
  })

  it('no training execution fields', () => {
    const r = buildRetrainingRequest(BASE) as any
    expect('submitTrainingRun' in r).toBe(false)
    expect('executeTraining' in r).toBe(false)
    expect('triggerRetraining' in r).toBe(false)
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildRetrainingRequest({ ...BASE, evidenceRef: undefined as any }))
      .toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('missing sourceRecommendationId throws OPERATIONS_CROSS_STAGE_REQUEST_INVALID', () => {
    expect(() => buildRetrainingRequest({ ...BASE, sourceRecommendationId: '' }))
      .toThrow('OPERATIONS_CROSS_STAGE_REQUEST_INVALID')
  })

  it('idempotent: same requestId same input', () => {
    const store = new Map<string, CrossStageRequestRecord>()
    const r1 = buildRetrainingRequest(BASE, store)
    const r2 = buildRetrainingRequest(BASE, store)
    expect(r1.requestHash).toBe(r2.requestHash)
    expect(store.size).toBe(1)
  })
})

// ── buildRollbackRecommendationRequest ────────────────────────────────────────

describe('buildRollbackRecommendationRequest', () => {
  it('valid request is ROLLBACK_RECOMMENDATION kind', () => {
    const r = buildRollbackRecommendationRequest(BASE)
    expect(r.kind).toBe('ROLLBACK_RECOMMENDATION')
    expect(r.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('no rollback execution fields', () => {
    const r = buildRollbackRecommendationRequest(BASE) as any
    expect('executeRollback' in r).toBe(false)
    expect('triggerRollback' in r).toBe(false)
    expect('rollbackDeployment' in r).toBe(false)
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildRollbackRecommendationRequest({ ...BASE, evidenceRef: undefined as any }))
      .toThrow('OPERATIONS_MISSING_EVIDENCE')
  })
})

// ── buildTrafficChangeRequest ─────────────────────────────────────────────────

describe('buildTrafficChangeRequest', () => {
  it('valid request is TRAFFIC_CHANGE kind', () => {
    const r = buildTrafficChangeRequest({ ...BASE, targetTrafficPercent: 10 })
    expect(r.kind).toBe('TRAFFIC_CHANGE')
    expect(r.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('no traffic mutation fields', () => {
    const r = buildTrafficChangeRequest({ ...BASE, targetTrafficPercent: 10 }) as any
    expect('mutateTraffic' in r).toBe(false)
    expect('setTrafficAllocation' in r).toBe(false)
  })

  it('negative traffic percent throws OPERATIONS_CROSS_STAGE_REQUEST_INVALID', () => {
    expect(() => buildTrafficChangeRequest({ ...BASE, targetTrafficPercent: -5 }))
      .toThrow('OPERATIONS_CROSS_STAGE_REQUEST_INVALID')
  })

  it('traffic > 100 throws OPERATIONS_CROSS_STAGE_REQUEST_INVALID', () => {
    expect(() => buildTrafficChangeRequest({ ...BASE, targetTrafficPercent: 101 }))
      .toThrow('OPERATIONS_CROSS_STAGE_REQUEST_INVALID')
  })
})

// ── buildHumanReviewRequest ───────────────────────────────────────────────────

describe('buildHumanReviewRequest', () => {
  it('valid request is HUMAN_REVIEW kind', () => {
    const r = buildHumanReviewRequest(BASE)
    expect(r.kind).toBe('HUMAN_REVIEW')
    expect(r.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('no autonomous action fields', () => {
    const r = buildHumanReviewRequest(BASE) as any
    expect('autoResolve' in r).toBe(false)
    expect('executeAction' in r).toBe(false)
  })
})
