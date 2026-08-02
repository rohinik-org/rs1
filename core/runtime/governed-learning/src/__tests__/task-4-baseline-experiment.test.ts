import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildAdaptationBaseline,
  buildAdaptationExperimentPlan,
  type AdaptationBaselineInput,
  type AdaptationExperimentPlanInput,
  type AdaptationKind,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const EV   = { evidenceId: 'ev-1', evidenceHash: HASH }

function makeBaselineInput(overrides?: Partial<AdaptationBaselineInput>): AdaptationBaselineInput {
  return {
    baselineId: 'bl-1' as any,
    adaptationId: 'adapt-1' as any,
    kind: 'ROUTING_POLICY' as AdaptationKind,
    baselineVersionId: 'ver-0' as any,
    authorityRef: EV,
    approvedAt: NOW,
    approvedBy: 'policy-authority',
    ...overrides,
  }
}

// ── buildAdaptationBaseline ───────────────────────────────────────────────────

describe('buildAdaptationBaseline', () => {
  it('valid baseline has baselineHash', () => {
    const b = buildAdaptationBaseline(makeBaselineInput())
    expect(b.baselineId).toBe('bl-1')
    expect(b.baselineHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('baselineHash is deterministic', () => {
    const input = makeBaselineInput()
    expect(buildAdaptationBaseline(input).baselineHash)
      .toBe(buildAdaptationBaseline(input).baselineHash)
  })

  it('missing authority throws GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationBaseline(makeBaselineInput({ authorityRef: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('candidate cannot baseline itself — same versionId as candidate throws GOVERNED_LEARNING_SELF_EVIDENCE', () => {
    expect(() => buildAdaptationBaseline(makeBaselineInput({
      baselineVersionId: 'ver-candidate' as any,
      candidateVersionId: 'ver-candidate' as any,
    }))).toThrow('GOVERNED_LEARNING_SELF_EVIDENCE')
  })

  it('stale baseline throws GOVERNED_LEARNING_STALE_CORPUS', () => {
    expect(() => buildAdaptationBaseline(makeBaselineInput({
      approvedAt: '2020-01-01T00:00:00.000Z' as IsoTimestamp,
      stalenessThresholdMs: 1000,
    }))).toThrow('GOVERNED_LEARNING_STALE_CORPUS')
  })

  it('idempotent: same baselineId same input', () => {
    const store = new Map()
    const input = makeBaselineInput()
    const b1 = buildAdaptationBaseline(input, store)
    const b2 = buildAdaptationBaseline(input, store)
    expect(b1.baselineHash).toBe(b2.baselineHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same baselineId different kind throws', () => {
    const store = new Map()
    buildAdaptationBaseline(makeBaselineInput({ kind: 'ROUTING_POLICY' }), store)
    expect(() => buildAdaptationBaseline(makeBaselineInput({ kind: 'PLANNING_POLICY' }), store))
      .toThrow()
  })
})

// ── buildAdaptationExperimentPlan ─────────────────────────────────────────────

describe('buildAdaptationExperimentPlan', () => {
  it('valid plan has planHash', () => {
    const p = buildAdaptationExperimentPlan({
      planId: 'plan-1' as any,
      adaptationId: 'adapt-1' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      baselineId: 'bl-1' as any,
      baselineHash: HASH,
      primaryMetrics: ['p50_latency'],
      guardrailMetrics: ['error_rate'],
      rollbackCriteria: { errorRateThreshold: 0.01 },
      populationPlan: { trafficPercent: 5 },
      minDurationMs: 3600000,
      minSampleCount: 1000,
      createdAt: NOW,
      createdBy: 'planner',
    })
    expect(p.planId).toBe('plan-1')
    expect(p.planHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('missing rollback criteria throws GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE', () => {
    expect(() => buildAdaptationExperimentPlan({
      planId: 'plan-2' as any,
      adaptationId: 'adapt-1' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      baselineId: 'bl-1' as any,
      baselineHash: HASH,
      primaryMetrics: ['p50_latency'],
      guardrailMetrics: [],
      rollbackCriteria: undefined as any,
      populationPlan: { trafficPercent: 5 },
      minDurationMs: 3600000,
      minSampleCount: 1000,
      createdAt: NOW,
      createdBy: 'planner',
    })).toThrow('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE')
  })

  it('missing baseline throws GOVERNED_LEARNING_MISSING_BASELINE', () => {
    expect(() => buildAdaptationExperimentPlan({
      planId: 'plan-3' as any,
      adaptationId: 'adapt-1' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      baselineId: 'bl-1' as any,
      baselineHash: undefined as any,
      primaryMetrics: ['p50_latency'],
      guardrailMetrics: [],
      rollbackCriteria: { errorRateThreshold: 0.01 },
      populationPlan: { trafficPercent: 5 },
      minDurationMs: 3600000,
      minSampleCount: 1000,
      createdAt: NOW,
      createdBy: 'planner',
    })).toThrow('GOVERNED_LEARNING_MISSING_BASELINE')
  })

  it('plan is frozen after creation — no mutation fields', () => {
    const p = buildAdaptationExperimentPlan({
      planId: 'plan-4' as any,
      adaptationId: 'adapt-1' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      baselineId: 'bl-1' as any,
      baselineHash: HASH,
      primaryMetrics: ['accuracy'],
      guardrailMetrics: ['latency'],
      rollbackCriteria: { errorRateThreshold: 0.05 },
      populationPlan: { trafficPercent: 10 },
      minDurationMs: 7200000,
      minSampleCount: 500,
      createdAt: NOW,
      createdBy: 'planner',
    }) as any
    expect('updateMetrics' in p).toBe(false)
    expect('modifyRollbackCriteria' in p).toBe(false)
  })

  it('planHash deterministic', () => {
    const input = {
      planId: 'plan-5' as any,
      adaptationId: 'adapt-1' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      baselineId: 'bl-1' as any,
      baselineHash: HASH,
      primaryMetrics: ['p50_latency'],
      guardrailMetrics: [],
      rollbackCriteria: { errorRateThreshold: 0.01 },
      populationPlan: { trafficPercent: 5 },
      minDurationMs: 3600000,
      minSampleCount: 1000,
      createdAt: NOW,
      createdBy: 'planner',
    }
    expect(buildAdaptationExperimentPlan(input).planHash)
      .toBe(buildAdaptationExperimentPlan(input).planHash)
  })
})
