import { describe, it, expect } from 'vitest'
import type { ReflectionCandidate } from '@rohinik-org/compiler'
import { DEFAULT_REFLECTION_POLICY } from '@rohinik-org/compiler'
import { ReflectionPolicyEngine } from '../policy/reflection-policy-engine.js'

function makeCandidate(findings: { confidence: number }[]): ReflectionCandidate {
  return {
    kind: 'ReflectionCandidate', schemaVersion: '1.0',
    candidateId: 'c1', executionId: 'e1', generatedAt: '2026-01-01T00:00:00.000Z',
    findings: findings.map((f, i) => ({ findingId: `f${i}`, category: 'FAILURE' as const, confidence: f.confidence, evidence: [], summary: 'test' })),
    rootCause: { causeId: 'rc1', category: 'UNKNOWN', confidence: 0.5, evidence: [] },
    recommendations: [],
  }
}

const engine = new ReflectionPolicyEngine()

describe('ReflectionPolicyEngine', () => {
  it('no findings → REJECTED', () => {
    expect(engine.evaluate(makeCandidate([]), DEFAULT_REFLECTION_POLICY)).toBe('REJECTED')
  })

  it('max confidence below minimum → DEFERRED', () => {
    expect(engine.evaluate(makeCandidate([{ confidence: 0.3 }]), DEFAULT_REFLECTION_POLICY)).toBe('DEFERRED')
  })

  it('confidence meets minimum → APPROVED', () => {
    expect(engine.evaluate(makeCandidate([{ confidence: 0.9 }]), DEFAULT_REFLECTION_POLICY)).toBe('APPROVED')
  })

  it('mixed confidences — uses max', () => {
    expect(engine.evaluate(makeCandidate([{ confidence: 0.2 }, { confidence: 0.8 }]), DEFAULT_REFLECTION_POLICY)).toBe('APPROVED')
  })
})
