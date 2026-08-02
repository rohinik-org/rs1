import { describe, it, expect } from 'vitest'
import type { DeploymentId, ModelId, IsoTimestamp, ContentHash, DriftSignalId } from '@rohinik-org/ml-ir'
import {
  buildOperationalRecommendation,
  type OperationalRecommendationRecord,
  type OperationsRecommendationType,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const MOD  = 'model-1' as ModelId
const SID  = 'sig-1' as DriftSignalId

function makeInput(overrides?: Partial<Parameters<typeof buildOperationalRecommendation>[0]>) {
  return {
    recommendationId: 'rec-1',
    deploymentId: DEP,
    modelId: MOD,
    signalId: SID,
    recommendationType: 'CONTINUE_OBSERVING' as OperationsRecommendationType,
    rationale: 'low severity drift detected',
    disposition: 'DEFER' as const,
    requiresApproval: false,
    evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    issuedAt: NOW,
    issuedBy: 'ops-engine',
    ...overrides,
  }
}

// ── buildOperationalRecommendation ────────────────────────────────────────────

describe('buildOperationalRecommendation', () => {
  it('valid recommendation has recommendationHash', () => {
    const r = buildOperationalRecommendation(makeInput())
    expect(r.recommendationId).toBe('rec-1')
    expect(r.recommendationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('recommendationHash is deterministic', () => {
    const input = makeInput()
    expect(buildOperationalRecommendation(input).recommendationHash)
      .toBe(buildOperationalRecommendation(input).recommendationHash)
  })

  it('all eight recommendation types accepted', () => {
    const types: OperationsRecommendationType[] = [
      'CONTINUE_OBSERVING', 'INCREASE_SAMPLING', 'REQUEST_HUMAN_REVIEW',
      'RECALIBRATE', 'RETRAIN', 'REDUCE_TRAFFIC', 'ROLL_BACK', 'RETIRE',
    ]
    for (const t of types) {
      const r = buildOperationalRecommendation(makeInput({ recommendationType: t, recommendationId: `rec-${t}` }))
      expect(r.recommendationType).toBe(t)
    }
  })

  it('recommendation is NOT a command — no executeRollback or submitTraining field', () => {
    const r = buildOperationalRecommendation(makeInput()) as any
    expect('executeRollback' in r).toBe(false)
    expect('submitTrainingRun' in r).toBe(false)
    expect('mutateTraffic' in r).toBe(false)
  })

  it('ROLL_BACK requires approval', () => {
    const r = buildOperationalRecommendation(makeInput({ recommendationType: 'ROLL_BACK' }))
    expect(r.requiresApproval).toBe(true)
  })

  it('RETRAIN requires approval', () => {
    const r = buildOperationalRecommendation(makeInput({ recommendationType: 'RETRAIN' }))
    expect(r.requiresApproval).toBe(true)
  })

  it('RETIRE requires approval', () => {
    const r = buildOperationalRecommendation(makeInput({ recommendationType: 'RETIRE' }))
    expect(r.requiresApproval).toBe(true)
  })

  it('CONTINUE_OBSERVING does not require approval', () => {
    const r = buildOperationalRecommendation(makeInput({ recommendationType: 'CONTINUE_OBSERVING' }))
    expect(r.requiresApproval).toBe(false)
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildOperationalRecommendation(makeInput({ evidenceRef: undefined as any })))
      .toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('empty rationale throws OPERATIONS_RECOMMENDATION_NOT_EXECUTABLE', () => {
    expect(() => buildOperationalRecommendation(makeInput({ rationale: '' })))
      .toThrow('OPERATIONS_RECOMMENDATION_NOT_EXECUTABLE')
  })

  it('idempotent: same recommendationId same input', () => {
    const store = new Map<string, OperationalRecommendationRecord>()
    const input = makeInput()
    const r1 = buildOperationalRecommendation(input, store)
    const r2 = buildOperationalRecommendation(input, store)
    expect(r1.recommendationHash).toBe(r2.recommendationHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same recommendationId different type throws', () => {
    const store = new Map<string, OperationalRecommendationRecord>()
    buildOperationalRecommendation(makeInput({ recommendationType: 'CONTINUE_OBSERVING' }), store)
    expect(() => buildOperationalRecommendation(makeInput({ recommendationType: 'RETRAIN' }), store))
      .toThrow('OPERATIONS_RECOMMENDATION_NOT_EXECUTABLE')
  })

  it('no raw payload or secret fields', () => {
    const r = buildOperationalRecommendation(makeInput()) as any
    expect('rawPayload' in r).toBe(false)
    expect('secret' in r).toBe(false)
  })
})
