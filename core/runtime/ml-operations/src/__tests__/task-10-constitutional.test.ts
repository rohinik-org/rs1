import { describe, it, expect } from 'vitest'
import type { DeploymentId, ModelId, IsoTimestamp, ContentHash, DriftSignalId } from '@rohinik-org/ml-ir'
import {
  ReferenceDriftProvider,
  type ReferenceDriftFixture,
  buildWindowRecord,
  buildBaselineRecord,
  buildDriftSignalRecord,
  buildDriftAssessmentRecord,
  normalizeConfidence,
  deriveSeverity,
  resolveContradiction,
  buildAssessmentDisposition,
  buildOperationalRecommendation,
  buildRetrainingRequest,
  buildRollbackRecommendationRequest,
  buildTrafficChangeRequest,
  buildHumanReviewRequest,
  assessRetirementImpact,
  buildRetirementRequest,
  buildRetirementDecision,
  ModelOperationsController,
  type ModelOperationsControllerDeps,
  type OperationsAssessmentRequest,
} from '../../src/index.js'

const NOW   = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const START = '2024-05-01T00:00:00.000Z' as IsoTimestamp
const END   = '2024-05-31T23:59:59.000Z' as IsoTimestamp
const HASH  = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP   = 'dep-1' as DeploymentId
const MOD   = 'model-1' as ModelId
const SID   = 'sig-1' as DriftSignalId

const EV = { evidenceId: 'ev-1', evidenceHash: HASH }
const WIN = { startAt: START, endAt: END }

// ── ReferenceDriftProvider ────────────────────────────────────────────────────

describe('ReferenceDriftProvider: deterministic fixtures', () => {
  it('drift_detected fixture returns driftDetected=true', async () => {
    const p = ReferenceDriftProvider({ fixture: 'drift_detected' })
    const out = await p.computeDriftStatistics({
      deploymentId: DEP, driftType: 'INPUT',
      baselineWindow: WIN, observationWindow: WIN,
      baselineHash: HASH, evidenceRef: EV,
    })
    expect(out.driftDetected).toBe(true)
    expect(out.statisticsHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('no_drift fixture returns driftDetected=false', async () => {
    const p = ReferenceDriftProvider({ fixture: 'no_drift' })
    const out = await p.computeDriftStatistics({
      deploymentId: DEP, driftType: 'INPUT',
      baselineWindow: WIN, observationWindow: WIN,
      baselineHash: HASH, evidenceRef: EV,
    })
    expect(out.driftDetected).toBe(false)
  })

  it('critical fixture returns severity CRITICAL and high confidence', async () => {
    const p = ReferenceDriftProvider({ fixture: 'critical' })
    const out = await p.computeDriftStatistics({
      deploymentId: DEP, driftType: 'OUTPUT',
      baselineWindow: WIN, observationWindow: WIN,
      baselineHash: HASH, evidenceRef: EV,
    })
    expect(out.severity).toBe('CRITICAL')
    expect(out.confidenceScore).toBeGreaterThanOrEqual(0.9)
  })

  it('unavailable fixture throws — is not no-drift', async () => {
    const p = ReferenceDriftProvider({ fixture: 'unavailable' })
    await expect(p.computeDriftStatistics({
      deploymentId: DEP, driftType: 'CONCEPT',
      baselineWindow: WIN, observationWindow: WIN,
      baselineHash: HASH, evidenceRef: EV,
    })).rejects.toThrow()
  })

  it('inconclusive fixture returns low confidence', async () => {
    const p = ReferenceDriftProvider({ fixture: 'inconclusive' })
    const out = await p.computeDriftStatistics({
      deploymentId: DEP, driftType: 'FEATURE',
      baselineWindow: WIN, observationWindow: WIN,
      baselineHash: HASH, evidenceRef: EV,
    })
    expect(out.confidenceScore).toBeLessThan(0.5)
  })

  it('statisticsHash is deterministic for same input', async () => {
    const p = ReferenceDriftProvider({ fixture: 'drift_detected' })
    const input = {
      deploymentId: DEP, driftType: 'INPUT' as const,
      baselineWindow: WIN, observationWindow: WIN,
      baselineHash: HASH, evidenceRef: EV,
    }
    const a = await p.computeDriftStatistics(input)
    const b = await p.computeDriftStatistics(input)
    expect(a.statisticsHash).toBe(b.statisticsHash)
  })

  it('all five drift types accepted', async () => {
    const p = ReferenceDriftProvider({ fixture: 'drift_detected' })
    const types = ['INPUT', 'FEATURE', 'OUTPUT', 'PERFORMANCE', 'CONCEPT'] as const
    for (const driftType of types) {
      const out = await p.computeDriftStatistics({
        deploymentId: DEP, driftType,
        baselineWindow: WIN, observationWindow: WIN,
        baselineHash: HASH, evidenceRef: EV,
      })
      expect(out.statisticsHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })

  it('provider has no rollback/training/traffic mutation methods', () => {
    const p = ReferenceDriftProvider({ fixture: 'drift_detected' }) as any
    expect('executeRollback' in p).toBe(false)
    expect('submitTrainingRun' in p).toBe(false)
    expect('mutateTraffic' in p).toBe(false)
    expect('promoteModel' in p).toBe(false)
  })
})

// ── Constitutional law coverage ───────────────────────────────────────────────

describe('Constitutional: missing evidence is not no-drift', () => {
  it('assessment without evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildDriftAssessmentRecord({
      assessmentId: 'a-1', signalId: SID, deploymentId: DEP,
      driftType: 'INPUT', outcome: 'NO_DRIFT',
      evidenceRef: undefined as any,
      assessedAt: NOW, assessedBy: 'test',
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('window record without evidenceRef throws', () => {
    expect(() => buildWindowRecord({
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: WIN, evidenceRef: undefined as any,
      createdAt: NOW, createdBy: 'test',
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('signal without baseline hash throws OPERATIONS_MISSING_BASELINE', () => {
    expect(() => buildDriftSignalRecord({
      signalId: SID, deploymentId: DEP, driftType: 'INPUT',
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: undefined as any,
      evidenceRef: EV,
      registeredAt: NOW, registeredBy: 'test',
    })).toThrow('OPERATIONS_MISSING_BASELINE')
  })
})

describe('Constitutional: recommendation is not a command', () => {
  it('no executeRollback on recommendation', () => {
    const r = buildOperationalRecommendation({
      recommendationId: 'rec-1', deploymentId: DEP, modelId: MOD, signalId: SID,
      recommendationType: 'ROLL_BACK', rationale: 'high drift',
      disposition: 'CONFIRM', evidenceRef: EV,
      issuedAt: NOW, issuedBy: 'engine',
    }) as any
    expect('executeRollback' in r).toBe(false)
  })

  it('no submitTrainingRun on RETRAIN recommendation', () => {
    const r = buildOperationalRecommendation({
      recommendationId: 'rec-2', deploymentId: DEP, modelId: MOD, signalId: SID,
      recommendationType: 'RETRAIN', rationale: 'concept drift',
      disposition: 'CONFIRM', evidenceRef: EV,
      issuedAt: NOW, issuedBy: 'engine',
    }) as any
    expect('submitTrainingRun' in r).toBe(false)
  })
})

describe('Constitutional: rollback request does not execute rollback', () => {
  const BASE = {
    requestId: 'csr-1', deploymentId: DEP, modelId: MOD,
    sourceRecommendationId: 'rec-1', sourceRecommendationHash: HASH,
    requestedAt: NOW, requestedBy: 'p',
    evidenceRef: EV, rationale: 'drift',
  }
  it('no executeRollback on rollback request', () => {
    const r = buildRollbackRecommendationRequest(BASE) as any
    expect('executeRollback' in r).toBe(false)
    expect('rollbackDeployment' in r).toBe(false)
  })

  it('no submitTrainingRun on retraining request', () => {
    const r = buildRetrainingRequest(BASE) as any
    expect('submitTrainingRun' in r).toBe(false)
    expect('triggerRetraining' in r).toBe(false)
  })

  it('no mutateTraffic on traffic change request', () => {
    const r = buildTrafficChangeRequest({ ...BASE, targetTrafficPercent: 20 }) as any
    expect('mutateTraffic' in r).toBe(false)
    expect('setTrafficAllocation' in r).toBe(false)
  })
})

describe('Constitutional: retirement does not directly undeploy', () => {
  it('retirement decision has no executeUndeploy method', () => {
    const impact = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 0 })
    const d = buildRetirementDecision({
      decisionId: 'ret-1' as any, modelId: MOD,
      impact, decidedBy: 'p', decidedAt: NOW, evidenceRef: EV,
    }) as any
    expect('executeUndeploy' in d).toBe(false)
    expect('undeploy' in d).toBe(false)
  })

  it('BLOCKED retirement with active deployment is not auto-executed', () => {
    const impact = assessRetirementImpact({
      modelId: MOD, activeDeploymentIds: ['dep-x' as DeploymentId], activeConsumerCount: 0,
    })
    const d = buildRetirementDecision({
      decisionId: 'ret-2' as any, modelId: MOD,
      impact, decidedBy: 'p', decidedAt: NOW, evidenceRef: EV,
    })
    expect(d.outcome).toBe('BLOCKED')
  })
})

describe('Constitutional: contradiction does not fabricate certainty', () => {
  it('mixed outcomes resolve CONTRADICTORY, not CONSISTENT', () => {
    const r = resolveContradiction({ outcomes: ['DRIFT_DETECTED', 'NO_DRIFT', 'DRIFT_DETECTED'] })
    expect(r.resolution).toBe('CONTRADICTORY')
    expect(r.fabricatedCertainty).toBeFalsy()
  })
})

describe('Constitutional: confidence bounded [0,1]', () => {
  it('exactly 0 valid', () => expect(normalizeConfidence(0)).toBe(0))
  it('exactly 1 valid', () => expect(normalizeConfidence(1)).toBe(1))
  it('above 1 throws', () => expect(() => normalizeConfidence(1.001)).toThrow('OPERATIONS_INVALID_CONFIDENCE'))
  it('NaN throws', () => expect(() => normalizeConfidence(NaN)).toThrow('OPERATIONS_INVALID_CONFIDENCE'))
})

// ── End-to-end flow ───────────────────────────────────────────────────────────

describe('End-to-end: windows → signal → assessment → disposition → recommendation → request', () => {
  it('full governed flow produces deterministic hashes', () => {
    const wStore = new Map()
    const bStore = new Map()
    const sStore = new Map()
    const aStore = new Map()
    const recStore = new Map()

    const window = buildWindowRecord({
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: WIN, evidenceRef: EV, createdAt: NOW, createdBy: 'test',
    }, wStore)
    expect(window.windowHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    const baseline = buildBaselineRecord({
      baselineId: 'bl-1', deploymentId: DEP, modelId: MOD,
      driftType: 'INPUT', window: WIN,
      contentHash: HASH, evidenceRef: EV, createdAt: NOW, createdBy: 'test',
    }, bStore)
    expect(baseline.baselineHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    const signal = buildDriftSignalRecord({
      signalId: SID, deploymentId: DEP, driftType: 'INPUT',
      baselineWindowId: 'w-1', observationWindowId: 'w-2',
      baselineHash: baseline.baselineHash,
      evidenceRef: EV, registeredAt: NOW, registeredBy: 'test',
    }, sStore)
    expect(signal.signalHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    const assessment = buildDriftAssessmentRecord({
      assessmentId: 'a-1', signalId: SID, deploymentId: DEP,
      driftType: 'INPUT', outcome: 'DRIFT_DETECTED',
      confidenceScore: 0.85, statisticsHash: HASH,
      evidenceRef: EV, assessedAt: NOW, assessedBy: 'provider',
    }, aStore)
    expect(assessment.assessmentHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    const disposition = buildAssessmentDisposition({
      outcome: 'DRIFT_DETECTED', confidence: 0.85,
      contradiction: { resolution: 'CONSISTENT', requiresReview: false },
      signalId: SID, evidenceRef: EV, disposedAt: NOW,
    })
    expect(disposition.disposition).toBe('CONFIRM')

    const rec = buildOperationalRecommendation({
      recommendationId: 'rec-1', deploymentId: DEP, modelId: MOD, signalId: SID,
      recommendationType: 'ROLL_BACK', rationale: 'high input drift',
      disposition: 'CONFIRM', evidenceRef: EV,
      issuedAt: NOW, issuedBy: 'ops-engine',
    }, recStore)
    expect(rec.requiresApproval).toBe(true)
    expect(rec.recommendationHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    const rollback = buildRollbackRecommendationRequest({
      requestId: 'csr-1', deploymentId: DEP, modelId: MOD,
      sourceRecommendationId: 'rec-1', sourceRecommendationHash: rec.recommendationHash,
      requestedAt: NOW, requestedBy: 'ops-engine',
      evidenceRef: EV, rationale: 'governed rollback',
    })
    expect(rollback.kind).toBe('ROLLBACK_RECOMMENDATION')
    expect(rollback.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('controller assess integrates with reference provider', async () => {
    const noop = async () => {}
    const undef = async () => undefined
    const empty = async () => []

    const deps: ModelOperationsControllerDeps = {
      signalRepository: { save: noop, find: undef, list: empty },
      assessmentRepository: { save: noop, find: undef, list: empty },
      recommendationRepository: { save: noop, find: undef, list: empty },
      crossStageRequestRepository: { save: noop, find: undef, list: empty },
      driftProvider: ReferenceDriftProvider({ fixture: 'drift_detected' }),
      clock: { now: () => NOW },
      idGenerator: { nextId: () => 'auto-1' },
    }
    const ctrl = ModelOperationsController(deps)
    const result = await ctrl.assess({
      deploymentId: DEP, modelId: MOD, signalId: SID,
      driftType: 'INPUT',
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: EV,
      requestedAt: NOW, requestedBy: 'e2e-test',
    } as OperationsAssessmentRequest)
    expect(result.outcome).toBe('ASSESSED')
    expect(result.driftOutcome).toBe('DRIFT_DETECTED')
  })

  it('controller assess with unavailable provider returns INCONCLUSIVE', async () => {
    const noop = async () => {}
    const undef = async () => undefined
    const empty = async () => []
    const deps: ModelOperationsControllerDeps = {
      signalRepository: { save: noop, find: undef, list: empty },
      assessmentRepository: { save: noop, find: undef, list: empty },
      recommendationRepository: { save: noop, find: undef, list: empty },
      crossStageRequestRepository: { save: noop, find: undef, list: empty },
      driftProvider: ReferenceDriftProvider({ fixture: 'unavailable' }),
      clock: { now: () => NOW },
      idGenerator: { nextId: () => 'auto-2' },
    }
    const result = await ModelOperationsController(deps).assess({
      deploymentId: DEP, modelId: MOD, signalId: SID,
      driftType: 'CONCEPT',
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: EV,
      requestedAt: NOW, requestedBy: 'e2e-test',
    } as OperationsAssessmentRequest)
    expect(result.outcome).toBe('INCONCLUSIVE')
  })
})

describe('Stage 12F evidence: public API coverage', () => {
  it('all exported builder functions are callable', () => {
    expect(typeof buildWindowRecord).toBe('function')
    expect(typeof buildBaselineRecord).toBe('function')
    expect(typeof buildDriftSignalRecord).toBe('function')
    expect(typeof buildDriftAssessmentRecord).toBe('function')
    expect(typeof normalizeConfidence).toBe('function')
    expect(typeof deriveSeverity).toBe('function')
    expect(typeof resolveContradiction).toBe('function')
    expect(typeof buildAssessmentDisposition).toBe('function')
    expect(typeof buildOperationalRecommendation).toBe('function')
    expect(typeof buildRetrainingRequest).toBe('function')
    expect(typeof buildRollbackRecommendationRequest).toBe('function')
    expect(typeof buildTrafficChangeRequest).toBe('function')
    expect(typeof buildHumanReviewRequest).toBe('function')
    expect(typeof assessRetirementImpact).toBe('function')
    expect(typeof buildRetirementRequest).toBe('function')
    expect(typeof buildRetirementDecision).toBe('function')
    expect(typeof ModelOperationsController).toBe('function')
    expect(typeof ReferenceDriftProvider).toBe('function')
  })
})
