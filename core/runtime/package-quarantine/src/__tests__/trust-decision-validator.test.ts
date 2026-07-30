import { describe, it, expect } from 'vitest'
import { validateTrustDecision } from '../trust-decision-validator.js'
import { makeRequest, makeArtifactRef, makeSubject } from './fixtures.js'

describe('TrustDecisionValidator', () => {
  it('accepts valid denied with reason codes', () => {
    const r = makeRequest('denied', { trustDecisionReasonCodes: ['source-denied'] })
    expect(validateTrustDecision(r)).toEqual({ valid: true })
  })

  it('accepts trusted with no blocking codes', () => {
    expect(validateTrustDecision(makeRequest('trusted'))).toEqual({ valid: true })
  })

  it('rejects when packageId mismatch', () => {
    const subject = makeSubject('pkg-a')
    const artifact = makeArtifactRef('pkg-b')
    const r = makeRequest('denied', { subject, artifact })
    const result = validateTrustDecision(r)
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining('packageId') })
  })

  it('rejects denied with empty reasonCodes when provided', () => {
    const r = makeRequest('denied', { trustDecisionReasonCodes: [] })
    expect(validateTrustDecision(r)).toMatchObject({ valid: false })
  })

  it('rejects trusted with blocking reason code', () => {
    const r = makeRequest('trusted', { trustDecisionReasonCodes: ['source-denied'] })
    expect(validateTrustDecision(r)).toMatchObject({ valid: false, reason: expect.stringContaining('source-denied') })
  })

  it('accepts conditionally-trusted', () => {
    expect(validateTrustDecision(makeRequest('conditionally-trusted'))).toEqual({ valid: true })
  })

  it('accepts manual-review-required', () => {
    expect(validateTrustDecision(makeRequest('manual-review-required'))).toEqual({ valid: true })
  })
})
