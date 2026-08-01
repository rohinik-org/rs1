import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, PromotionDecisionId, DeploymentId } from '@rohinik-org/ml-ir'
import type { PromotionDecision } from '@rohinik-org/ml-evaluation'
import {
  admitDeployment,
  type DeploymentAdmissionRequest,
  type DeploymentAdmissionDecision,
  type DeploymentAdmissionOutcome,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash

function makePromotion(overrides?: Partial<PromotionDecision>): PromotionDecision {
  return {
    decisionId: 'dec-1',
    evaluationId: 'eval-1',
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
    outcome: 'PROMOTED',
    decisionHash: HASH,
    stage11eEvidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    ...overrides,
  }
}

function makeRequest(overrides?: Partial<DeploymentAdmissionRequest>): DeploymentAdmissionRequest {
  return {
    admissionId: 'adm-1',
    deploymentId: 'dep-1' as DeploymentId,
    promotion: makePromotion(),
    candidateArtifactId: 'art-1',
    candidateCanonicalHash: HASH,
    targetEnvironment: 'prod',
    requestedBy: 'principal-1',
    requestedAt: NOW,
    rollbackPlanRef: 'rollback-plan-1',
    ...overrides,
  }
}

// ── happy path: ADMITTED ──────────────────────────────────────────────────────

describe('admitDeployment: ADMITTED', () => {
  it('valid request with PROMOTED decision returns ADMITTED', () => {
    const d = admitDeployment(makeRequest())
    expect(d.outcome).toBe('ADMITTED')
    expect(d.admissionId).toBe('adm-1')
  })

  it('decision is deterministic — same input produces same admissionHash', () => {
    const req = makeRequest()
    const d1 = admitDeployment(req)
    const d2 = admitDeployment(req)
    expect(d1.admissionHash).toBe(d2.admissionHash)
    expect(d1.admissionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('different candidateArtifactId produces different admissionHash', () => {
    const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
    const d1 = admitDeployment(makeRequest())
    const d2 = admitDeployment(makeRequest({ candidateCanonicalHash: HASH2, promotion: makePromotion({ candidateCanonicalHash: HASH2 }) }))
    expect(d1.admissionHash).not.toBe(d2.admissionHash)
  })

  it('admitted decision carries promotionDecisionId', () => {
    const d = admitDeployment(makeRequest())
    expect(d.promotionDecisionId).toBe('dec-1')
  })

  it('admitted decision has no deploymentRef — no deployment yet', () => {
    const d = admitDeployment(makeRequest())
    expect('deploymentRef' in d).toBe(false)
  })
})

// ── branch 1: invalid identity ────────────────────────────────────────────────

describe('admitDeployment: invalid identity', () => {
  it('empty admissionId throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => admitDeployment(makeRequest({ admissionId: '' }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('empty requestedBy throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => admitDeployment(makeRequest({ requestedBy: '' }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('invalid candidateCanonicalHash format throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => admitDeployment(makeRequest({ candidateCanonicalHash: 'bad-hash' as ContentHash }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })
})

// ── branch 2: missing/invalid promotion ──────────────────────────────────────

describe('admitDeployment: missing promotion', () => {
  it('null promotion throws DEPLOYMENT_NO_PROMOTION', () => {
    expect(() => admitDeployment(makeRequest({ promotion: null as unknown as PromotionDecision }))).toThrow('DEPLOYMENT_NO_PROMOTION')
  })
})

// ── branch 3: decision not PROMOTED ──────────────────────────────────────────

describe('admitDeployment: decision not PROMOTED', () => {
  it('REJECTED promotion throws DEPLOYMENT_PROMOTION_NOT_PROMOTED', () => {
    expect(() => admitDeployment(makeRequest({ promotion: makePromotion({ outcome: 'REJECTED' }) }))).toThrow('DEPLOYMENT_PROMOTION_NOT_PROMOTED')
  })

  it('REQUIRES_REVIEW promotion throws DEPLOYMENT_PROMOTION_NOT_PROMOTED', () => {
    expect(() => admitDeployment(makeRequest({ promotion: makePromotion({ outcome: 'REQUIRES_REVIEW' }) }))).toThrow('DEPLOYMENT_PROMOTION_NOT_PROMOTED')
  })
})

// ── branch 4: model/artifact mismatch ────────────────────────────────────────

describe('admitDeployment: artifact mismatch', () => {
  it('candidateArtifactId not in promotion targetEnvironments throws DEPLOYMENT_MODEL_ARTIFACT_MISMATCH', () => {
    expect(() => admitDeployment(makeRequest({ candidateArtifactId: 'art-WRONG' }))).toThrow('DEPLOYMENT_MODEL_ARTIFACT_MISMATCH')
  })

  it('candidateCanonicalHash not matching promotion hash throws DEPLOYMENT_MODEL_ARTIFACT_MISMATCH', () => {
    const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
    expect(() => admitDeployment(makeRequest({ candidateCanonicalHash: HASH2 }))).toThrow('DEPLOYMENT_MODEL_ARTIFACT_MISMATCH')
  })
})

// ── branch 5: environment not eligible ───────────────────────────────────────

describe('admitDeployment: environment ineligible', () => {
  it('targetEnvironment not in promotion targetEnvironments throws DEPLOYMENT_ENVIRONMENT_INELIGIBLE', () => {
    expect(() => admitDeployment(makeRequest({ targetEnvironment: 'staging' }))).toThrow('DEPLOYMENT_ENVIRONMENT_INELIGIBLE')
  })
})

// ── branch 8: missing rollback plan ──────────────────────────────────────────

describe('admitDeployment: missing rollback plan', () => {
  it('empty rollbackPlanRef throws DEPLOYMENT_MISSING_ROLLBACK_PLAN', () => {
    expect(() => admitDeployment(makeRequest({ rollbackPlanRef: '' }))).toThrow('DEPLOYMENT_MISSING_ROLLBACK_PLAN')
  })
})

// ── idempotency / conflict ────────────────────────────────────────────────────

describe('admitDeployment: idempotency', () => {
  it('same request registered twice is idempotent', () => {
    const store = new Map<string, DeploymentAdmissionDecision>()
    const req = makeRequest()
    const d1 = admitDeployment(req, store)
    const d2 = admitDeployment(req, store)
    expect(d1.admissionHash).toBe(d2.admissionHash)
    expect(store.size).toBe(1)
  })

  it('same admissionId with different content throws DEPLOYMENT_ADMISSION_CONFLICT', () => {
    const store = new Map<string, DeploymentAdmissionDecision>()
    admitDeployment(makeRequest(), store)
    expect(() => admitDeployment(makeRequest({ requestedBy: 'other' }), store)).toThrow('DEPLOYMENT_ADMISSION_CONFLICT')
  })
})
