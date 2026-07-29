import { describe, it, expect } from 'vitest'
import { TrustRuleMatcher } from '../trust-rule-matcher.js'
import { makeRequest, makePolicy, makeRule, makeSubject } from './fixtures.js'

const m = new TrustRuleMatcher()

function canonical(policy: ReturnType<typeof makePolicy>) {
  return {
    policy,
    orderedRules: [...policy.hardRejectRules, ...policy.manualReviewRules, ...policy.degradedRules, ...policy.advisoryRules],
    valid: true,
  }
}

describe('TrustRuleMatcher', () => {
  it('global fallback matches any package', () => {
    const policy = makePolicy({ hardRejectRules: [makeRule('r1', { specificity: 'global', effect: 'deny' })] })
    const matched = m.match(makeRequest({ policy }), canonical(policy))
    expect(matched.some(mr => mr.rule.ruleId === 'r1')).toBe(true)
  })

  it('exact package-version matches only that exact version', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('exact', { specificity: 'exact-package-version', effect: 'deny', matchPattern: 'pkg@1.0.0' })],
    })
    const matched = m.match(makeRequest({ policy }), canonical(policy))
    expect(matched.some(mr => mr.rule.ruleId === 'exact')).toBe(true)
  })

  it('exact package-version does not match different version', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('exact', { specificity: 'exact-package-version', effect: 'deny', matchPattern: 'pkg@2.0.0' })],
    })
    const matched = m.match(makeRequest({ policy }), canonical(policy))
    expect(matched.some(mr => mr.rule.ruleId === 'exact')).toBe(false)
  })

  it('exact package matches package regardless of version', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('epkg', { specificity: 'exact-package', effect: 'deny', matchPattern: 'pkg' })],
    })
    expect(m.match(makeRequest({ policy }), canonical(policy)).some(mr => mr.rule.ruleId === 'epkg')).toBe(true)
  })

  it('namespace matches prefix', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('ns', { specificity: 'namespace', effect: 'deny', matchPattern: '@scope' })],
    })
    const req = makeRequest({ policy, subject: makeSubject({ packageId: '@scope/pkg' }) })
    expect(m.match(req, canonical(policy)).some(mr => mr.rule.ruleId === 'ns')).toBe(true)
  })

  it('namespace does not match unrelated package', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('ns', { specificity: 'namespace', effect: 'deny', matchPattern: '@scope' })],
    })
    const req = makeRequest({ policy })
    expect(m.match(req, canonical(policy)).some(mr => mr.rule.ruleId === 'ns')).toBe(false)
  })

  it('no unrelated rule matched', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('specific', { specificity: 'exact-package-version', effect: 'deny', matchPattern: 'other@1.0.0' })],
    })
    expect(m.match(makeRequest({ policy }), canonical(policy))).toHaveLength(0)
  })

  it('matching is deterministic across calls', () => {
    const policy = makePolicy({ hardRejectRules: [makeRule('r1', { specificity: 'global' }), makeRule('r2', { specificity: 'exact-package', matchPattern: 'pkg' })] })
    const r1 = m.match(makeRequest({ policy }), canonical(policy))
    const r2 = m.match(makeRequest({ policy }), canonical(policy))
    expect(r1.map(r => r.rule.ruleId)).toEqual(r2.map(r => r.rule.ruleId))
  })
})
