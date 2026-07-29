import { describe, it, expect } from 'vitest'
import { AssessmentConsistencyValidator } from '../assessment-consistency-validator.js'
import { makeRequest, makeIntegrityAssessment, makeProvenanceAssessment, makeSignatureAssessment } from './fixtures.js'

const v = new AssessmentConsistencyValidator()

describe('AssessmentConsistencyValidator', () => {
  it('consistent assessments produce no blocking findings', () => {
    const r = v.validate(makeRequest())
    expect(r.findings.filter(f => f.kind === 'blocking')).toHaveLength(0)
    expect(r.consistent).toBe(true)
  })

  it('integrity mismatch reason produces blocking finding', () => {
    const req = makeRequest({ integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }) })
    const r = v.validate(req)
    expect(r.consistent).toBe(false)
    const blockingCodes = r.findings.filter(f => f.kind === 'blocking').map(f => f.code)
    expect(blockingCodes).toContain('artifact-digest-mismatch')
  })

  it('provenance artifact mismatch reason produces blocking finding', () => {
    const req = makeRequest({ provenanceAssessment: makeProvenanceAssessment({ passed: false, reason: 'artifact-mismatch' }) })
    const r = v.validate(req)
    expect(r.consistent).toBe(false)
    const blockingCodes = r.findings.filter(f => f.kind === 'blocking').map(f => f.code)
    expect(blockingCodes).toContain('provenance-artifact-mismatch')
  })

  it('failed signature produces manual-review finding not blocking', () => {
    const req = makeRequest({ signatureAssessment: makeSignatureAssessment({ passed: false, reason: 'issuer-not-trusted' }) })
    const r = v.validate(req)
    const reviewFindings = r.findings.filter(f => f.kind === 'manual-review')
    expect(reviewFindings.length).toBeGreaterThan(0)
  })

  it('findings sorted deterministically', () => {
    const req = makeRequest({
      integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }),
      provenanceAssessment: makeProvenanceAssessment({ passed: false, reason: 'artifact-mismatch' }),
    })
    const r1 = v.validate(req)
    const r2 = v.validate(req)
    expect(r1.findings.map(f => f.code)).toEqual(r2.findings.map(f => f.code))
  })

  it('consistent flag false when blocking finding present', () => {
    const req = makeRequest({ integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }) })
    expect(v.validate(req).consistent).toBe(false)
  })
})
