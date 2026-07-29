import { describe, it, expect } from 'vitest'
import { TrustPolicyCanonicalizer } from '../trust-policy-canonicalizer.js'
import { makePolicy, makeRule } from './fixtures.js'

const c = new TrustPolicyCanonicalizer()

describe('TrustPolicyCanonicalizer', () => {
  it('valid policy with no rules passes', () => {
    const r = c.canonicalize(makePolicy())
    expect(r.valid).toBe(true)
  })

  it('deterministic rule ordering', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('rule-z', { specificity: 'global', effect: 'deny' }), makeRule('rule-a', { specificity: 'exact-package', effect: 'deny' })],
    })
    const r1 = c.canonicalize(policy)
    const r2 = c.canonicalize(policy)
    expect(r1.orderedRules.map(r => r.ruleId)).toEqual(r2.orderedRules.map(r => r.ruleId))
  })

  it('exact-package specificity sorts before global', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('global-rule', { specificity: 'global', effect: 'deny' }), makeRule('pkg-rule', { specificity: 'exact-package', effect: 'deny' })],
    })
    const r = c.canonicalize(policy)
    const ids = r.orderedRules.map(r => r.ruleId)
    expect(ids.indexOf('pkg-rule')).toBeLessThan(ids.indexOf('global-rule'))
  })

  it('duplicate rule IDs across categories rejected', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('dup-id', { effect: 'deny' })],
      manualReviewRules: [makeRule('dup-id', { effect: 'manual-review' })],
    })
    const r = c.canonicalize(policy)
    expect(r.valid).toBe(false)
    expect(r.reason).toContain('dup-id')
  })

  it('missing rule ID rejects', () => {
    const policy = makePolicy({ hardRejectRules: [makeRule('', { effect: 'deny' })] })
    const r = c.canonicalize(policy)
    expect(r.valid).toBe(false)
  })

  it('canonicalization is idempotent', () => {
    const policy = makePolicy({ hardRejectRules: [makeRule('r1'), makeRule('r2')] })
    const r1 = c.canonicalize(policy)
    const r2 = c.canonicalize({ ...policy, hardRejectRules: [...policy.hardRejectRules] })
    expect(r1.orderedRules.map(r => r.ruleId)).toEqual(r2.orderedRules.map(r => r.ruleId))
  })

  it('explicit reject rule preserved in output', () => {
    const policy = makePolicy({ hardRejectRules: [makeRule('reject-rule', { effect: 'deny' })] })
    const r = c.canonicalize(policy)
    expect(r.orderedRules.some(x => x.ruleId === 'reject-rule' && x.effect === 'deny')).toBe(true)
  })

  it('manual-review rule preserved in output', () => {
    const policy = makePolicy({ manualReviewRules: [makeRule('review-rule', { effect: 'manual-review' })] })
    const r = c.canonicalize(policy)
    expect(r.orderedRules.some(x => x.ruleId === 'review-rule' && x.effect === 'manual-review')).toBe(true)
  })
})
