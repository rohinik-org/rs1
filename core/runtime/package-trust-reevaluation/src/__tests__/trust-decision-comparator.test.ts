import { describe, it, expect } from 'vitest'
import { compareDecisions } from '../trust-decision-comparator.js'

describe('TrustDecisionComparator', () => {
  it('classifies same decision as no-semantic-change', () => {
    const r = compareDecisions('trusted', 'trusted')
    expect(r.classification).toBe('no-semantic-change')
    expect(r.isDowngrade).toBe(false)
  })

  it('classifies trusted → conditionally-trusted as restriction-added', () => {
    const r = compareDecisions('trusted', 'conditionally-trusted')
    expect(r.classification).toBe('restriction-added')
    expect(r.isDowngrade).toBe(true)
  })

  it('classifies conditionally-trusted → trusted as restriction-removed', () => {
    const r = compareDecisions('conditionally-trusted', 'trusted')
    expect(r.classification).toBe('restriction-removed')
    expect(r.isDowngrade).toBe(false)
  })

  it('classifies → denied as denied-introduced with quarantine required', () => {
    const r = compareDecisions('trusted', 'denied')
    expect(r.classification).toBe('denied-introduced')
    expect(r.requiresQuarantine).toBe(true)
    expect(r.isDowngrade).toBe(true)
  })

  it('classifies denied → trusted as denied-resolved', () => {
    const r = compareDecisions('denied', 'trusted')
    expect(r.classification).toBe('denied-resolved')
    expect(r.isDowngrade).toBe(false)
  })

  it('classifies trusted → manual-review-required as manual-review-introduced', () => {
    const r = compareDecisions('trusted', 'manual-review-required')
    expect(r.classification).toBe('manual-review-introduced')
  })

  it('classifies manual-review-required → trusted as manual-review-resolved', () => {
    const r = compareDecisions('manual-review-required', 'trusted')
    expect(r.classification).toBe('manual-review-resolved')
  })

  it('classifies conditionally-trusted → denied as denied-introduced', () => {
    const r = compareDecisions('conditionally-trusted', 'denied')
    expect(r.classification).toBe('denied-introduced')
    expect(r.requiresQuarantine).toBe(true)
  })

  it('severity order: trusted < conditionally-trusted < manual-review-required < denied', () => {
    const r1 = compareDecisions('trusted', 'conditionally-trusted')
    expect(r1.isDowngrade).toBe(true)
    const r2 = compareDecisions('conditionally-trusted', 'manual-review-required')
    expect(r2.isDowngrade).toBe(true)
    const r3 = compareDecisions('manual-review-required', 'denied')
    expect(r3.isDowngrade).toBe(true)
  })

  it('includes description in result', () => {
    const r = compareDecisions('trusted', 'denied')
    expect(r.description).toContain('trusted')
    expect(r.description).toContain('denied')
  })
})
