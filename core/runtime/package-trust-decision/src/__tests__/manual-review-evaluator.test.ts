import { describe, it, expect } from 'vitest'
import { ManualReviewEvaluator } from '../manual-review-evaluator.js'
import { makeRequest, makePublisherAssessment, makeRevocationAssessment, makeContext, makePolicySnapshot } from './fixtures.js'
import type { ManualReviewFinding } from '../types.js'

const ev = new ManualReviewEvaluator()

describe('ManualReviewEvaluator', () => {
  it('no manual review triggers when all pass', () => {
    const r = ev.evaluate(makeRequest(), [])
    expect(r.required).toBe(false)
    expect(r.findings).toHaveLength(0)
  })

  it('upstream publisher manual-review propagates', () => {
    const req = makeRequest({ publisherAssessment: makePublisherAssessment({ decision: 'manual-review-required', reason: 'scope-mismatch' }) })
    const r = ev.evaluate(req, [])
    expect(r.required).toBe(true)
    expect(r.findings.some(f => f.code === 'upstream-publisher-manual-review')).toBe(true)
  })

  it('upstream revocation manual-review propagates', () => {
    const req = makeRequest({ revocationAssessment: makeRevocationAssessment({ decision: 'manual-review-required' }) })
    const r = ev.evaluate(req, [])
    expect(r.required).toBe(true)
    expect(r.findings.some(f => f.code === 'upstream-revocation-manual-review')).toBe(true)
  })

  it('missing revocation data triggers manual review per policy', () => {
    // Build revocation assessment without checkedSnapshotSemanticHash (exactOptionalPropertyTypes — omit don't set undefined)
    const revAssessment = { decision: 'passed' as const }
    const req = makeRequest({
      revocationAssessment: revAssessment,
      context: makeContext({ policySnapshot: makePolicySnapshot({ missingRevocationDataDecision: 'manual-review' }) }),
    })
    const r = ev.evaluate(req, [])
    expect(r.required).toBe(true)
    expect(r.findings.some(f => f.code === 'missing-revocation-data')).toBe(true)
  })

  it('policy-triggered manual-review findings included', () => {
    const findings: ManualReviewFinding[] = [{ kind: 'manual-review', code: 'policy-conflict', assessmentType: 'policy' }]
    const r = ev.evaluate(makeRequest(), findings)
    expect(r.required).toBe(true)
    expect(r.findings.some(f => f.code === 'policy-conflict')).toBe(true)
  })

  it('findings sorted deterministically', () => {
    const req = makeRequest({
      publisherAssessment: makePublisherAssessment({ decision: 'manual-review-required' }),
      revocationAssessment: makeRevocationAssessment({ decision: 'manual-review-required' }),
    })
    const r1 = ev.evaluate(req, [])
    const r2 = ev.evaluate(req, [])
    expect(r1.findings.map(f => f.code)).toEqual(r2.findings.map(f => f.code))
  })

  it('review result contains machine-readable reasons', () => {
    const req = makeRequest({ publisherAssessment: makePublisherAssessment({ decision: 'manual-review-required', reason: 'scope-mismatch' }) })
    const r = ev.evaluate(req, [])
    expect(r.findings[0]?.code).toBeDefined()
  })
})
