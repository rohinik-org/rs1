import { describe, it, expect } from 'vitest'
import { AssessmentSetValidator } from '../assessment-set-validator.js'
import { makeRequest, makePolicy } from './fixtures.js'
import type { AssessmentType } from '../types.js'

const v = new AssessmentSetValidator()

describe('AssessmentSetValidator', () => {
  it('all required assessments present passes', () => {
    const r = v.validate(makeRequest())
    expect(r.complete).toBe(true)
    expect(r.missingAssessments).toEqual([])
  })

  it('optional assessment absent does not fail completeness', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['integrity'] as AssessmentType[] }) })
    expect(v.validate(req).complete).toBe(true)
  })

  it('mandatory integrity assessment absent produces blocking finding', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['integrity'] as AssessmentType[] }), integrityAssessment: undefined as never })
    const r = v.validate(req)
    expect(r.complete).toBe(false)
    expect(r.missingAssessments).toContain('integrity')
    expect(r.findings[0]?.kind).toBe('blocking')
  })

  it('mandatory signature assessment absent produces blocking finding', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['signature'] as AssessmentType[] }), signatureAssessment: undefined as never })
    const r = v.validate(req)
    expect(r.complete).toBe(false)
    expect(r.missingAssessments).toContain('signature')
  })

  it('mandatory publisher assessment absent produces blocking finding', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['publisher'] as AssessmentType[] }), publisherAssessment: undefined as never })
    const r = v.validate(req)
    expect(r.complete).toBe(false)
    expect(r.missingAssessments).toContain('publisher')
  })

  it('mandatory revocation assessment absent produces blocking finding', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['revocation'] as AssessmentType[] }), revocationAssessment: undefined as never })
    const r = v.validate(req)
    expect(r.complete).toBe(false)
  })

  it('mandatory provenance assessment absent produces blocking finding', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['provenance'] as AssessmentType[] }), provenanceAssessment: undefined as never })
    const r = v.validate(req)
    expect(r.complete).toBe(false)
  })

  it('mandatory permission assessment absent produces blocking finding', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['permission'] as AssessmentType[] }), permissionAssessment: undefined as never })
    const r = v.validate(req)
    expect(r.complete).toBe(false)
  })

  it('mandatory vulnerability assessment absent produces blocking finding', () => {
    const req = makeRequest({ policy: makePolicy({ requiredAssessments: ['vulnerability'] as AssessmentType[] }), vulnerabilityAssessment: undefined as never })
    const r = v.validate(req)
    expect(r.complete).toBe(false)
  })

  it('deterministic missing-assessment ordering', () => {
    const req = makeRequest({
      policy: makePolicy({ requiredAssessments: ['vulnerability', 'integrity'] as AssessmentType[] }),
      integrityAssessment: undefined as never,
      vulnerabilityAssessment: undefined as never,
    })
    const r1 = v.validate(req)
    const r2 = v.validate(req)
    expect(r1.missingAssessments).toEqual(r2.missingAssessments)
    expect([...r1.missingAssessments]).toEqual([...r1.missingAssessments].sort())
  })
})
