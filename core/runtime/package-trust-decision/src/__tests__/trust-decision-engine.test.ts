import { describe, it, expect } from 'vitest'
import { TrustDecisionEngine } from '../trust-decision-engine.js'
import { makeRequest, makePolicy, makeRule, makeIntegrityAssessment, makePublisherAssessment, makeRevocationAssessment, makeProvenanceAssessment, makePermissionAssessment, makeVulnerabilityAssessment, makePolicySnapshot, makeContext } from './fixtures.js'
import type { AssessmentType } from '../types.js'

const engine = new TrustDecisionEngine()

describe('TrustDecisionEngine', () => {
  it('all assessments pass → trusted', () => {
    const r = engine.decide(makeRequest())
    expect(r.outcome).toBe('trusted')
    expect(r.decision).toBe('trusted')
  })

  it('integrity failure → rejected', () => {
    const req = makeRequest({ integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }) })
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
    expect(r.blockingFindings.length).toBeGreaterThan(0)
  })

  it('revocation failed → rejected', () => {
    const req = makeRequest({ revocationAssessment: makeRevocationAssessment({ decision: 'failed', reason: 'revoked' }) })
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
  })

  it('publisher rejected with required policy → rejected', () => {
    const req = makeRequest({
      publisherAssessment: makePublisherAssessment({ decision: 'rejected', reason: 'namespace-unauthorized' }),
      policy: makePolicy({ requiredAssessments: ['integrity', 'signature', 'publisher', 'revocation', 'provenance', 'permission', 'vulnerability'] as AssessmentType[] }),
    })
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
  })

  it('permission denied → rejected', () => {
    const req = makeRequest({ permissionAssessment: makePermissionAssessment({ decision: 'denied' }) })
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
  })

  it('critical vulnerability with deny policy → rejected', () => {
    const req = makeRequest({
      vulnerabilityAssessment: makeVulnerabilityAssessment({ findings: [{ advisoryId: 'CVE-1', severity: 'critical' }] }),
      context: makeContext({ policySnapshot: makePolicySnapshot({ vulnerabilityRules: [{ order: 0, severity: 'critical', effect: 'deny' }] }) }),
    })
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
    expect(r.blockingFindings.some(f => f.code.includes('critical'))).toBe(true)
  })

  it('publisher manual-review → manual-review-required', () => {
    const req = makeRequest({ publisherAssessment: makePublisherAssessment({ decision: 'manual-review-required' }) })
    const r = engine.decide(req)
    expect(r.outcome).toBe('manual-review-required')
  })

  it('hard rejection from rule cannot be overridden by allow rule', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('deny-global', { effect: 'deny', specificity: 'exact-package', matchPattern: 'pkg' })],
      advisoryRules: [makeRule('allow-global', { effect: 'allow', specificity: 'global' })],
    })
    const r = engine.decide(makeRequest({ policy }))
    expect(r.outcome).toBe('rejected')
  })

  it('degraded trust when policy allows and degrading finding present', () => {
    const policy = makePolicy({
      allowDegradedTrust: true,
      degradedRules: [makeRule('degrade-provenance', { effect: 'degrade', specificity: 'global' })],
    })
    const r = engine.decide(makeRequest({ policy }))
    expect(r.outcome).toBe('trusted-degraded')
    expect(r.degradingFindings.length).toBeGreaterThan(0)
  })

  it('degraded trust not permitted when policy does not allow → rejected', () => {
    const policy = makePolicy({
      allowDegradedTrust: false,
      degradedRules: [makeRule('degrade-prov', { effect: 'degrade', specificity: 'global' })],
    })
    const r = engine.decide(makeRequest({ policy }))
    expect(r.outcome).toBe('rejected')
  })

  it('missing mandatory assessment → rejected', () => {
    const req = makeRequest({
      policy: makePolicy({ requiredAssessments: ['integrity'] as AssessmentType[] }),
      integrityAssessment: undefined as never,
    })
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
    expect(r.blockingFindings.length).toBeGreaterThan(0)
  })

  it('result contains all assessment references', () => {
    const r = engine.decide(makeRequest())
    expect(r.integrityAssessment).toBeDefined()
    expect(r.signatureAssessment).toBeDefined()
    expect(r.vulnerabilityAssessment).toBeDefined()
  })

  it('result contains policy references', () => {
    const r = engine.decide(makeRequest())
    expect(r.policyId).toBe('policy-1')
    expect(r.policyVersion).toBe('1.0')
  })

  it('evaluatedAt preserved from request', () => {
    const req = makeRequest({ evaluatedAt: '2020-06-15T12:00:00.000Z' })
    const r = engine.decide(req)
    expect(r.evaluatedAt).toBe('2020-06-15T12:00:00.000Z')
  })

  it('result is immutable', () => {
    const r = engine.decide(makeRequest())
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('invalid request → rejected without rule evaluation', () => {
    const req = { ...makeRequest(), evaluatedAt: 'not-a-date' }
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
  })
})
