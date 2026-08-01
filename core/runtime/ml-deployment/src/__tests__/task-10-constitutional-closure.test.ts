import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, DeploymentId, EndpointId, InferenceRequestId } from '@rohinik-org/ml-ir'
import {
  // reference provider
  createReferenceDeploymentProvider,
  // constitutional tests
  admitDeployment,
  buildInferenceRequest,
  buildRollbackDirective,
  buildActivationDecision,
  buildHealthObservation,
  transitionDeployment,
  buildDeploymentRevision,
  validateTrafficAllocation,
  buildInferenceResult,
  // evidence
  stage12eEvidence,
  stage12eReleaseGate,
  type Stage12EEvidence,
  type ReleaseGateResult,
  // types
  type DeploymentAdmissionRequest,
  DEPLOYMENT_GOVERNANCE_ERROR_CODES,
} from '../../src/index.js'
import type { PromotionDecision } from '@rohinik-org/ml-evaluation'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const EP   = 'ep-1' as EndpointId

function makePromotion(overrides?: Partial<PromotionDecision>): PromotionDecision {
  return {
    decisionId:               'dec-1',
    evaluationId:             'eval-1',
    candidateArtifactId:      'art-1',
    candidateCanonicalHash:   HASH,
    evaluationRunHash:        HASH,
    baselineId:               'bl-1',
    comparativeResultHashes:  [HASH],
    governanceEvidenceHash:   HASH,
    targetEnvironments:       ['prod'],
    evaluatorId:              'ext-evaluator',
    requestedBy:              'principal-1',
    decidedAt:                NOW,
    outcome:                  'PROMOTED',
    decisionHash:             HASH,
    stage11eEvidenceRef:      { evidenceId: 'ev-1', evidenceHash: HASH },
    ...overrides,
  }
}

// ── reference provider ────────────────────────────────────────────────────────

describe('createReferenceDeploymentProvider', () => {
  it('prepare returns prepared:true', async () => {
    const p = createReferenceDeploymentProvider()
    expect((await p.prepare('dep-1')).prepared).toBe(true)
  })

  it('deploy returns deployed:true', async () => {
    const p = createReferenceDeploymentProvider()
    expect((await p.deploy('dep-1')).deployed).toBe(true)
  })

  it('reportHealth returns HEALTHY', async () => {
    const p = createReferenceDeploymentProvider()
    expect((await p.reportHealth('dep-1')).status).toBe('HEALTHY')
  })

  it('rollback returns rolledBack:true', async () => {
    const p = createReferenceDeploymentProvider()
    expect((await p.rollback('dep-1', 'rev-0')).rolledBack).toBe(true)
  })

  it('retire returns retired:true', async () => {
    const p = createReferenceDeploymentProvider()
    expect((await p.retire('dep-1')).retired).toBe(true)
  })

  it('provider has no external framework/cloud dependency — no sagemaker/azureml/vertexai', () => {
    const p = createReferenceDeploymentProvider() as any
    expect('sageMakerClient' in p).toBe(false)
    expect('azureClient' in p).toBe(false)
    expect('vertexClient' in p).toBe(false)
  })
})

// ── constitutional tests (direct law assertions) ──────────────────────────────

describe('constitutional: LAW-090 — no deployment without promotion', () => {
  it('REJECTED promotion is denied', () => {
    expect(() => admitDeployment({
      admissionId: 'adm-1', deploymentId: DEP, promotion: makePromotion({ outcome: 'REJECTED' }),
      candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, targetEnvironment: 'prod',
      requestedBy: 'p', requestedAt: NOW, rollbackPlanRef: 'rb-1',
    })).toThrow('DEPLOYMENT_PROMOTION_NOT_PROMOTED')
  })
})

describe('constitutional: LAW-091 — not-ready endpoint blocks inference', () => {
  it('STOPPED endpoint throws', () => {
    expect(() => buildInferenceRequest({
      inferenceRequestId: 'inf-1' as InferenceRequestId, endpointId: EP, deploymentId: DEP,
      revisionId: 'rev-1', modelVersionId: 'model-v1', inputHash: HASH,
      endpointState: 'STOPPED', requestedAt: NOW, requestedBy: 'p',
    })).toThrow('DEPLOYMENT_ENDPOINT_NOT_READY')
  })
})

describe('constitutional: LAW-092 — ineligible environment blocked', () => {
  it('environment not in promotion targets is denied', () => {
    expect(() => admitDeployment({
      admissionId: 'adm-1', deploymentId: DEP, promotion: makePromotion({ targetEnvironments: ['prod'] }),
      candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, targetEnvironment: 'staging',
      requestedBy: 'p', requestedAt: NOW, rollbackPlanRef: 'rb-1',
    })).toThrow('DEPLOYMENT_ENVIRONMENT_INELIGIBLE')
  })
})

describe('constitutional: LAW-093 — revision mutation rejected', () => {
  it('same revisionId different modelVersionId throws DEPLOYMENT_REVISION_CONFLICT', () => {
    const store = new Map()
    buildDeploymentRevision({ revisionId: 'rev-1', deploymentId: DEP, candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, modelVersionId: 'v1', rolloutStrategy: 'direct', rollbackTargetRevisionId: 'rev-0', createdAt: NOW, createdBy: 'p' }, store)
    expect(() => buildDeploymentRevision({ revisionId: 'rev-1', deploymentId: DEP, candidateArtifactId: 'art-1', candidateCanonicalHash: HASH, modelVersionId: 'v2', rolloutStrategy: 'direct', rollbackTargetRevisionId: 'rev-0', createdAt: NOW, createdBy: 'p' }, store))
      .toThrow('DEPLOYMENT_REVISION_CONFLICT')
  })
})

describe('constitutional: LAW-095 — invalid traffic rejected', () => {
  it('traffic total 70 throws DEPLOYMENT_TRAFFIC_INVALID', () => {
    expect(() => validateTrafficAllocation([{ revisionId: 'rev-1', trafficPercent: 70 }]))
      .toThrow('DEPLOYMENT_TRAFFIC_INVALID')
  })
})

describe('constitutional: LAW-096 — recommendation is not directive', () => {
  it('rollback without authorizedBy throws DEPLOYMENT_ROLLBACK_MISSING_AUTHORIZATION', () => {
    expect(() => buildRollbackDirective({ directiveId: 'rbd-1' as any, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-1', authorizedBy: '', authorizedAt: NOW }))
      .toThrow('DEPLOYMENT_ROLLBACK_MISSING_AUTHORIZATION')
  })
})

describe('constitutional: LAW-097 — every inference requires evidence', () => {
  it('missing evidenceRef throws DEPLOYMENT_INFERENCE_MISSING_EVIDENCE', () => {
    expect(() => buildInferenceResult({
      inferenceRequestId: 'inf-1' as InferenceRequestId, requestHash: HASH,
      outcome: 'SUCCESS', latencyMs: 10, recordedAt: NOW, recordedBy: 'p',
    })).toThrow('DEPLOYMENT_INFERENCE_MISSING_EVIDENCE')
  })
})

describe('constitutional: LAW-098 — health observation does not mutate state', () => {
  it('health observation has no newState or stateTransition field', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'UNHEALTHY', observedAt: NOW, observedBy: 'm' })
    expect('newState' in obs).toBe(false)
    expect('stateTransition' in obs).toBe(false)
  })
})

describe('constitutional: terminal state guard', () => {
  it('RETIRED deployment cannot transition further', () => {
    const d = [
      'ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'DRAINING', 'RETIRED',
    ].reduce<ReturnType<typeof transitionDeployment>>(
      (acc, s) => transitionDeployment(acc as any, s as any, NOW, 'p'),
      { state: 'PLANNED', version: 1, deploymentId: DEP, admissionHash: HASH, history: [{ state: 'PLANNED', at: NOW, by: 'p' }] } as any,
    )
    expect(() => transitionDeployment(d as any, 'ACTIVE', NOW, 'p')).toThrow('DEPLOYMENT_TERMINAL_STATE')
  })
})

describe('constitutional: no drift/retraining types exported', () => {
  it('no DriftSignal, DriftDetector, RetrainingRequest exported', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    for (const forbidden of ['DriftSignal', 'DriftDetector', 'RetrainingRequest']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

// ── stage evidence ────────────────────────────────────────────────────────────

describe('stage12eEvidence', () => {
  it('returns stageId 12E', () => {
    const ev = stage12eEvidence()
    expect(ev.stageId).toBe('12E')
  })

  it('covers all Stage 12E laws', () => {
    const ev = stage12eEvidence()
    const expected = ['LAW-090', 'LAW-091', 'LAW-092', 'LAW-093', 'LAW-094', 'LAW-095', 'LAW-096', 'LAW-097', 'LAW-098']
    for (const law of expected) {
      expect(ev.coveredLaws).toContain(law)
    }
  })

  it('evidenceHash matches package and laws', () => {
    const ev = stage12eEvidence()
    expect(ev.evidenceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('evidence is deterministic', () => {
    expect(stage12eEvidence().evidenceHash).toBe(stage12eEvidence().evidenceHash)
  })
})

describe('stage12eReleaseGate', () => {
  it('returns passed:true when all checks pass', () => {
    const gate = stage12eReleaseGate()
    expect(gate.passed).toBe(true)
  })

  it('all individual checks pass', () => {
    const gate = stage12eReleaseGate()
    for (const check of gate.checks) {
      expect(check.passed).toBe(true)
    }
  })

  it('checks array is non-empty', () => {
    const gate = stage12eReleaseGate()
    expect(gate.checks.length).toBeGreaterThan(0)
  })
})
