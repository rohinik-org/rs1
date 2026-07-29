import { describe, it, expect } from 'vitest'
import { DecisionEvidenceBuilder } from '../decision-evidence-builder.js'
import { makeRequest } from './fixtures.js'

const eb = new DecisionEvidenceBuilder()

describe('DecisionEvidenceBuilder', () => {
  it('builds evidence with all assessment types', () => {
    const evidence = eb.build(makeRequest(), [], [], [], [], [], [])
    expect(evidence.assessmentTypes).toContain('integrity')
    expect(evidence.assessmentTypes).toContain('vulnerability')
  })

  it('includes applied rule IDs', () => {
    const evidence = eb.build(makeRequest(), [], [], [], [], [], ['rule-1', 'rule-2'])
    expect(evidence.appliedRuleIds).toContain('rule-1')
    expect(evidence.appliedRuleIds).toContain('rule-2')
  })

  it('applied rule IDs sorted', () => {
    const evidence = eb.build(makeRequest(), [], [], [], [], [], ['zzz', 'aaa'])
    expect(evidence.appliedRuleIds[0]).toBe('aaa')
  })

  it('blocking findings included in evidence', () => {
    const b = [{ kind: 'blocking' as const, code: 'b1', assessmentType: 'integrity' as const }]
    const evidence = eb.build(makeRequest(), b, [], [], [], [], [])
    expect(evidence.blockingFindings).toHaveLength(1)
  })

  it('evaluation time preserved', () => {
    const req = makeRequest({ evaluatedAt: '2024-06-15T00:00:00.000Z' })
    const evidence = eb.build(req, [], [], [], [], [], [])
    expect(evidence.evaluatedAt).toBe('2024-06-15T00:00:00.000Z')
  })

  it('policy ID and version preserved', () => {
    const evidence = eb.build(makeRequest(), [], [], [], [], [], [])
    expect(evidence.policyId).toBe('policy-1')
    expect(evidence.policyVersion).toBe('1.0')
  })

  it('restrictions sorted deterministically', () => {
    const evidence = eb.build(makeRequest(), [], [], [], [], ['zzz', 'aaa'], [])
    expect(evidence.restrictions[0]).toBe('aaa')
  })
})
