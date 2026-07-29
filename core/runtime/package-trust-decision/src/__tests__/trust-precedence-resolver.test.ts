import { describe, it, expect } from 'vitest'
import { TrustPrecedenceResolver } from '../trust-precedence-resolver.js'
import { makeRule } from './fixtures.js'
import type { MatchedRule } from '../types.js'

const r = new TrustPrecedenceResolver()

function matched(rule: ReturnType<typeof makeRule>): MatchedRule {
  return { rule, specificity: rule.specificity }
}

describe('TrustPrecedenceResolver', () => {
  it('deny rule produces blocking finding', () => {
    const res = r.resolve([matched(makeRule('r1', { effect: 'deny', specificity: 'global' }))])
    expect(res.blockingFindings).toHaveLength(1)
    expect(res.blockingFindings[0]?.code).toBe('r1')
  })

  it('manual-review rule produces manual-review finding', () => {
    const res = r.resolve([matched(makeRule('r2', { effect: 'manual-review', specificity: 'global' }))])
    expect(res.manualReviewFindings).toHaveLength(1)
  })

  it('degrade rule produces degrading finding', () => {
    const res = r.resolve([matched(makeRule('r3', { effect: 'degrade', specificity: 'global' }))])
    expect(res.degradingFindings).toHaveLength(1)
  })

  it('advisory rule produces advisory finding', () => {
    const res = r.resolve([matched(makeRule('r4', { effect: 'advisory', specificity: 'global' }))])
    expect(res.advisoryFindings).toHaveLength(1)
  })

  it('allow rule produces no finding', () => {
    const res = r.resolve([matched(makeRule('r5', { effect: 'allow', specificity: 'global' }))])
    expect(res.blockingFindings).toHaveLength(0)
    expect(res.manualReviewFindings).toHaveLength(0)
  })

  it('exact-package beats global: deny + allow at different specificity → deny wins', () => {
    const exactDeny = matched(makeRule('exact', { effect: 'deny', specificity: 'exact-package', matchPattern: 'pkg' }))
    const globalAllow = matched(makeRule('glob', { effect: 'allow', specificity: 'global' }))
    const res = r.resolve([exactDeny, globalAllow])
    expect(res.blockingFindings.some(f => f.code === 'exact')).toBe(true)
  })

  it('equal-specificity allow + deny produces manual-review (fail-closed)', () => {
    const deny = matched(makeRule('deny1', { effect: 'deny', specificity: 'global' }))
    const allow = matched(makeRule('allow1', { effect: 'allow', specificity: 'global' }))
    const res = r.resolve([deny, allow])
    expect(res.manualReviewFindings.some(f => f.code === 'equal-specificity-policy-conflict')).toBe(true)
    expect(res.blockingFindings).toHaveLength(0)
  })

  it('equal-specificity conflict never silently resolves as trusted', () => {
    const deny = matched(makeRule('d', { effect: 'deny', specificity: 'namespace' }))
    const allow = matched(makeRule('a', { effect: 'allow', specificity: 'namespace' }))
    const res = r.resolve([deny, allow])
    // either manual review or blocking — not empty
    expect(res.blockingFindings.length + res.manualReviewFindings.length).toBeGreaterThan(0)
  })

  it('findings sorted deterministically', () => {
    const rules = [
      matched(makeRule('zzz', { effect: 'deny', specificity: 'global' })),
      matched(makeRule('aaa', { effect: 'deny', specificity: 'global' })),
    ]
    const res1 = r.resolve(rules)
    const res2 = r.resolve([...rules].reverse())
    expect(res1.blockingFindings.map(f => f.code)).toEqual(res2.blockingFindings.map(f => f.code))
  })

  it('no matched rules produces empty resolution', () => {
    const res = r.resolve([])
    expect(res.blockingFindings).toHaveLength(0)
    expect(res.manualReviewFindings).toHaveLength(0)
  })
})
