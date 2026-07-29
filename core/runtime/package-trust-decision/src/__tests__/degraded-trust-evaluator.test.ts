import { describe, it, expect } from 'vitest'
import { DegradedTrustEvaluator } from '../degraded-trust-evaluator.js'
import { makePolicy, makeRule } from './fixtures.js'
import type { DegradingFinding, BlockingFinding, ManualReviewFinding } from '../types.js'

const ev = new DegradedTrustEvaluator()

function degrading(code: string): DegradingFinding {
  return { kind: 'degrading', code, assessmentType: 'provenance' }
}

function blocking(code: string): BlockingFinding {
  return { kind: 'blocking', code, assessmentType: 'integrity' }
}

function manual(code: string): ManualReviewFinding {
  return { kind: 'manual-review', code, assessmentType: 'publisher' }
}

describe('DegradedTrustEvaluator', () => {
  it('permitted provenance degradation when policy allows', () => {
    const policy = makePolicy({ allowDegradedTrust: true })
    const r = ev.evaluate(policy, [degrading('prov-deg')], [], [])
    expect(r.permitted).toBe(true)
    expect(r.degradations).toHaveLength(1)
  })

  it('degradation rejected when not explicitly allowed', () => {
    const policy = makePolicy({ allowDegradedTrust: false })
    const r = ev.evaluate(policy, [degrading('prov-deg')], [], [])
    expect(r.permitted).toBe(false)
    expect(r.reason).toContain('not-permitted-by-policy')
  })

  it('degradation rejected when hard blocker exists', () => {
    const policy = makePolicy({ allowDegradedTrust: true })
    const r = ev.evaluate(policy, [degrading('d')], [blocking('b')], [])
    expect(r.permitted).toBe(false)
    expect(r.reason).toContain('hard-blocker')
  })

  it('degradation rejected when unresolved manual review exists', () => {
    const policy = makePolicy({ allowDegradedTrust: true })
    const r = ev.evaluate(policy, [degrading('d')], [], [manual('m')])
    expect(r.permitted).toBe(false)
    expect(r.reason).toContain('manual-review')
  })

  it('no degradations present produces not-permitted', () => {
    const policy = makePolicy({ allowDegradedTrust: true })
    const r = ev.evaluate(policy, [], [], [])
    expect(r.permitted).toBe(false)
  })

  it('restrictions from degraded rules collected', () => {
    const policy = makePolicy({
      allowDegradedTrust: true,
      degradedRules: [makeRule('r1', { effect: 'degrade', detail: 'restricted-network-access' })],
    })
    const r = ev.evaluate(policy, [degrading('d')], [], [])
    expect(r.restrictions).toContain('restricted-network-access')
  })

  it('degradation evidence complete', () => {
    const policy = makePolicy({ allowDegradedTrust: true })
    const degs = [degrading('d1'), degrading('d2')]
    const r = ev.evaluate(policy, degs, [], [])
    expect(r.permitted).toBe(true)
    expect(r.degradations).toHaveLength(2)
  })
})
