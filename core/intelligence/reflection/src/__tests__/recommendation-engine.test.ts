import { describe, it, expect } from 'vitest'
import type { ReflectionCandidate } from '@rohinik-org/compiler'
import { RecommendationEngine } from '../engine/recommendation-engine.js'

function makeCandidate(rootCauseCategory: ReflectionCandidate['rootCause']['category'], hasFindings = true): ReflectionCandidate {
  return {
    kind: 'ReflectionCandidate', schemaVersion: '1.0',
    candidateId: 'c1', executionId: 'e1', generatedAt: '2026-01-01T00:00:00.000Z',
    findings: hasFindings
      ? [{ findingId: 'f1', category: 'FAILURE', confidence: 0.9, evidence: [], summary: 'step failed' }]
      : [],
    rootCause: { causeId: 'rc1', category: rootCauseCategory, confidence: 0.8, evidence: [] },
    recommendations: [],
  }
}

const engine = new RecommendationEngine()

describe('RecommendationEngine', () => {
  it('MISSING_CAPABILITY → ACQUIRE_CAPABILITY', () => {
    const recs = engine.recommend(makeCandidate('MISSING_CAPABILITY'))
    expect(recs[0]?.kind).toBe('ACQUIRE_CAPABILITY')
  })

  it('PROVIDER_FAILURE → CHANGE_PROVIDER', () => {
    const recs = engine.recommend(makeCandidate('PROVIDER_FAILURE'))
    expect(recs[0]?.kind).toBe('CHANGE_PROVIDER')
  })

  it('TIMEOUT → RETRY', () => {
    const recs = engine.recommend(makeCandidate('TIMEOUT'))
    expect(recs[0]?.kind).toBe('RETRY')
  })

  it('recommendation carries findingRefs (explainability invariant)', () => {
    const recs = engine.recommend(makeCandidate('NETWORK'))
    expect(recs[0]?.findingRefs).toContain('f1')
  })

  it('no findings → no recommendations', () => {
    const recs = engine.recommend(makeCandidate('UNKNOWN', false))
    expect(recs.length).toBe(0)
  })
})
