import { describe, it, expect } from 'vitest'
import { TrustDecisionRequestValidator } from '../trust-decision-request-validator.js'
import { makeRequest, makePolicy, makeSubject } from './fixtures.js'

const v = new TrustDecisionRequestValidator()

describe('TrustDecisionRequestValidator', () => {
  it('valid complete request passes', () => {
    expect(v.validate(makeRequest()).valid).toBe(true)
  })

  it('missing subject rejects', () => {
    const r = { ...makeRequest(), subject: undefined as never }
    expect(v.validate(r).valid).toBe(false)
  })

  it('missing policy rejects', () => {
    const r = { ...makeRequest(), policy: undefined as never }
    expect(v.validate(r).valid).toBe(false)
  })

  it('missing context rejects', () => {
    const r = { ...makeRequest(), context: undefined as never }
    expect(v.validate(r).valid).toBe(false)
  })

  it('malformed evaluatedAt rejects', () => {
    const r = { ...makeRequest(), evaluatedAt: 'not-a-date' }
    expect(v.validate(r).valid).toBe(false)
    expect(v.validate(r).reason).toBe('malformed-evaluatedAt')
  })

  it('missing evaluatedAt rejects', () => {
    const r = { ...makeRequest(), evaluatedAt: '' }
    expect(v.validate(r).valid).toBe(false)
  })

  it('unsupported publisher assessment discriminant rejects', () => {
    const req = makeRequest({ publisherAssessment: { decision: 'unknown' as 'accepted' } })
    expect(v.validate(req).valid).toBe(false)
    expect(v.validate(req).reason).toContain('publisher-assessment-discriminant')
  })

  it('unsupported revocation assessment discriminant rejects', () => {
    const req = makeRequest({ revocationAssessment: { decision: 'unknown' as 'passed' } })
    expect(v.validate(req).valid).toBe(false)
    expect(v.validate(req).reason).toContain('revocation-assessment-discriminant')
  })

  it('missing integrity assessment rejects', () => {
    const r = { ...makeRequest(), integrityAssessment: undefined as never }
    const result = v.validate(r)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('integrityAssessment')
  })

  it('invalid request produces reason', () => {
    const r = { ...makeRequest(), evaluatedAt: 'bad' }
    const result = v.validate(r)
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })
})
