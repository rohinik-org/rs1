import { describe, it, expect } from 'vitest'
import { evaluateQuarantinePolicy } from '../quarantine-policy-evaluator.js'
import { makeRequest, makePolicy } from './fixtures.js'

describe('QuarantinePolicyEvaluator', () => {
  it('denied + quarantineDenied=true → required', () => {
    expect(evaluateQuarantinePolicy(makeRequest('denied'), makePolicy({ quarantineDenied: true }))).toBe('required')
  })

  it('manual-review + quarantineManualReview=true → required', () => {
    expect(evaluateQuarantinePolicy(makeRequest('manual-review-required'), makePolicy({ quarantineManualReview: true }))).toBe('required')
  })

  it('conditionally-trusted + quarantineConditionallyTrusted=true → required-with-restrictions', () => {
    expect(evaluateQuarantinePolicy(makeRequest('conditionally-trusted'), makePolicy({ quarantineConditionallyTrusted: true }))).toBe('required-with-restrictions')
  })

  it('trusted + no emergency rules → not-required', () => {
    expect(evaluateQuarantinePolicy(makeRequest('trusted'), makePolicy({ emergencyRules: [] }))).toBe('not-required')
  })

  it('trusted + matching emergency rule quarantine=true → required', () => {
    const policy = makePolicy({ emergencyRules: [{ packagePattern: 'test-pkg', quarantine: true }] })
    expect(evaluateQuarantinePolicy(makeRequest('trusted'), policy)).toBe('required')
  })

  it('trusted + conflicting emergency rules → policy-conflict', () => {
    const policy = makePolicy({
      emergencyRules: [
        { packagePattern: 'test-pkg', quarantine: true },
        { packagePattern: 'test', quarantine: false },
      ],
    })
    expect(evaluateQuarantinePolicy(makeRequest('trusted'), policy)).toBe('policy-conflict')
  })

  it('quarantined trust decision → required', () => {
    expect(evaluateQuarantinePolicy(makeRequest('quarantined'), makePolicy())).toBe('required')
  })

  it('denied + quarantineDenied=false → not-required', () => {
    const policy = makePolicy({ quarantineDenied: false, quarantineManualReview: false, quarantineConditionallyTrusted: false })
    // denied but policy says not to quarantine denied — returns not-required
    expect(evaluateQuarantinePolicy(makeRequest('denied'), policy)).toBe('not-required')
  })
})
