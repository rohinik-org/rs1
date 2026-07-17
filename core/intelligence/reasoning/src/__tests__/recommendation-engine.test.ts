import { describe, it, expect } from 'vitest'
import { RecommendationEngine } from '../engine/recommendation-engine.js'
import { ReasoningPolicyEngine } from '../policy/reasoning-policy-engine.js'
import type { Hypothesis } from '@rohinik-org/compiler'
import { DEFAULT_REASONING_POLICY } from '@rohinik-org/compiler'

function makeHypothesis(id: string, confidence: number): Hypothesis {
  return { hypothesisId: id, statement: 'test', category: 'CAPABILITY_FAILURE', confidence, supportingEvidence: [], contradictingEvidence: [] }
}

describe('RecommendationEngine', () => {
  const engine = new RecommendationEngine()

  it('produces one recommendation per hypothesis', () => {
    const recs = engine.recommend([makeHypothesis('h1', 0.8), makeHypothesis('h2', 0.6)])
    expect(recs.length).toBe(2)
  })

  it('CAPABILITY_FAILURE maps to ACQUIRE_CAPABILITY with HIGH priority', () => {
    const recs = engine.recommend([makeHypothesis('h1', 0.9)])
    expect(recs[0]?.action).toBe('ACQUIRE_CAPABILITY')
    expect(recs[0]?.priority).toBe('HIGH')
  })

  it('PROVIDER_DEGRADATION maps to UPDATE_PROVIDER', () => {
    const h: Hypothesis = { hypothesisId: 'h1', statement: '', category: 'PROVIDER_DEGRADATION', confidence: 0.8, supportingEvidence: [], contradictingEvidence: [] }
    expect(engine.recommend([h])[0]?.action).toBe('UPDATE_PROVIDER')
  })

  it('each recommendation references its hypothesis id', () => {
    const recs = engine.recommend([makeHypothesis('abc-id', 0.7)])
    expect(recs[0]?.hypothesisId).toBe('abc-id')
  })

  it('UNKNOWN maps to USER_APPROVAL', () => {
    const h: Hypothesis = { hypothesisId: 'h1', statement: '', category: 'UNKNOWN', confidence: 0.5, supportingEvidence: [], contradictingEvidence: [] }
    expect(engine.recommend([h])[0]?.action).toBe('USER_APPROVAL')
  })

  it('empty hypotheses returns empty array', () => {
    expect(engine.recommend([])).toEqual([])
  })
})

describe('ReasoningPolicyEngine', () => {
  const policyEngine = new ReasoningPolicyEngine()

  it('REJECTED when no hypotheses', () => {
    expect(policyEngine.evaluate([], DEFAULT_REASONING_POLICY)).toBe('REJECTED')
  })

  it('APPROVED when hypothesis meets minimum confidence', () => {
    expect(policyEngine.evaluate([makeHypothesis('h1', 0.8)], DEFAULT_REASONING_POLICY)).toBe('APPROVED')
  })

  it('DEFERRED when hypotheses exist but all below minimum confidence', () => {
    const policy = { ...DEFAULT_REASONING_POLICY, minimumConfidence: 0.9 }
    expect(policyEngine.evaluate([makeHypothesis('h1', 0.5)], policy)).toBe('DEFERRED')
  })

  it('APPROVED when at least one hypothesis meets threshold, others do not', () => {
    const policy = { ...DEFAULT_REASONING_POLICY, minimumConfidence: 0.7 }
    expect(policyEngine.evaluate([makeHypothesis('h1', 0.4), makeHypothesis('h2', 0.8)], policy)).toBe('APPROVED')
  })

  it('exact threshold boundary is APPROVED', () => {
    const policy = { ...DEFAULT_REASONING_POLICY, minimumConfidence: 0.5 }
    expect(policyEngine.evaluate([makeHypothesis('h1', 0.5)], policy)).toBe('APPROVED')
  })

  it('DEFERRED with custom high threshold', () => {
    const policy = { ...DEFAULT_REASONING_POLICY, minimumConfidence: 0.99 }
    expect(policyEngine.evaluate([makeHypothesis('h1', 0.98)], policy)).toBe('DEFERRED')
  })
})
