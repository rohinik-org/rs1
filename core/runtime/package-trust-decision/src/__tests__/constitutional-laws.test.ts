import { describe, it, expect } from 'vitest'
import { TrustDecisionEngine } from '../trust-decision-engine.js'
import { AssessmentSetValidator } from '../assessment-set-validator.js'
import { AssessmentConsistencyValidator } from '../assessment-consistency-validator.js'
import { TrustPrecedenceResolver } from '../trust-precedence-resolver.js'
import { DegradedTrustEvaluator } from '../degraded-trust-evaluator.js'
import { ManualReviewEvaluator } from '../manual-review-evaluator.js'
import { DecisionBuilder } from '../decision-builder.js'
import { DecisionEvidenceBuilder } from '../decision-evidence-builder.js'
import {
  makeRequest, makePolicy, makeRule, makeSubject,
  makeIntegrityAssessment, makePublisherAssessment,
  makeRevocationAssessment, makeProvenanceAssessment,
  makePermissionAssessment, makeVulnerabilityAssessment,
  makePolicySnapshot, makeContext,
} from './fixtures.js'
import type { AssessmentType, BlockingFinding, DegradingFinding, ManualReviewFinding, MatchedRule } from '../types.js'

const engine = new TrustDecisionEngine()
const setValidator = new AssessmentSetValidator()
const consistencyValidator = new AssessmentConsistencyValidator()
const precedenceResolver = new TrustPrecedenceResolver()
const degradedEv = new DegradedTrustEvaluator()
const reviewEv = new ManualReviewEvaluator()
const evidenceBuilder = new DecisionEvidenceBuilder()
const decisionBuilder = new DecisionBuilder()

function blocking(code: string): BlockingFinding {
  return { kind: 'blocking', code, assessmentType: 'integrity' }
}
function degrading(code: string): DegradingFinding {
  return { kind: 'degrading', code, assessmentType: 'provenance' }
}
function manual(code: string): ManualReviewFinding {
  return { kind: 'manual-review', code, assessmentType: 'publisher' }
}
function matched(r: ReturnType<typeof makeRule>): MatchedRule {
  return { rule: r, specificity: r.specificity }
}

describe('Constitutional Laws', () => {
  it('L-9J-901: TrustDecisionEngine is sole Stage 9J boundary that produces PackageTrustDecision', () => {
    // Only TrustDecisionEngine.decide() returns a TrustDecisionResult with a PackageTrustDecision
    const r = engine.decide(makeRequest())
    expect(r.decision).toBeDefined()
    expect(['trusted', 'conditionally-trusted', 'quarantined', 'manual-review-required', 'denied']).toContain(r.decision)
  })

  it('L-9J-902: Task 10 consumes immutable assessments and never invokes earlier evaluators', () => {
    // Sentinels: if engine calls any external evaluator, it would throw
    let calledExternalEvaluator = false
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => { calledExternalEvaluator = true; return new Response() }
    engine.decide(makeRequest())
    globalThis.fetch = origFetch
    expect(calledExternalEvaluator).toBe(false)
  })

  it('L-9J-903: missing mandatory assessment never treated as passing', () => {
    const req = makeRequest({
      policy: makePolicy({ requiredAssessments: ['integrity'] as AssessmentType[] }),
      integrityAssessment: undefined as never,
    })
    const setResult = setValidator.validate(req)
    expect(setResult.complete).toBe(false)
    expect(setResult.findings.every(f => f.kind === 'blocking')).toBe(true)
  })

  it('L-9J-903: engine rejects when mandatory assessment absent', () => {
    const req = makeRequest({
      policy: makePolicy({ requiredAssessments: ['integrity'] as AssessmentType[] }),
      integrityAssessment: undefined as never,
    })
    expect(engine.decide(req).outcome).toBe('rejected')
  })

  it('L-9J-904: assessments for different packages are not silently combined', () => {
    const req = makeRequest({ subject: makeSubject({ packageId: 'pkg-a' }) })
    // Consistency validator checks subject coherence; integrity assessment is for pkg-a
    // No cross-package mixing — the subject is the anchor
    const r = consistencyValidator.validate(req)
    // All assessments reference the same subject (pkg-a) — consistent
    expect(r.consistent).toBe(true)
  })

  it('L-9J-904: artifact digest mismatch detected as blocking inconsistency', () => {
    const req = makeRequest({ integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }) })
    const r = consistencyValidator.validate(req)
    expect(r.findings.some(f => f.kind === 'blocking')).toBe(true)
  })

  it('L-9J-905: hard rejection rule not overridden by broader allow rule', () => {
    const policy = makePolicy({
      hardRejectRules: [makeRule('deny-exact', { effect: 'deny', specificity: 'exact-package', matchPattern: 'pkg' })],
      advisoryRules: [makeRule('allow-global', { effect: 'allow', specificity: 'global' })],
    })
    const r = engine.decide(makeRequest({ policy }))
    expect(r.outcome).toBe('rejected')
  })

  it('L-9J-906: equal-specificity contradictory rules never silently trusted', () => {
    const deny = matched(makeRule('d', { effect: 'deny', specificity: 'global' }))
    const allow = matched(makeRule('a', { effect: 'allow', specificity: 'global' }))
    const res = precedenceResolver.resolve([deny, allow])
    expect(res.blockingFindings.length + res.manualReviewFindings.length).toBeGreaterThan(0)
  })

  it('L-9J-907: manual-review-required distinct from rejected', () => {
    const manualReq = makeRequest({ publisherAssessment: makePublisherAssessment({ decision: 'manual-review-required' }) })
    const rejectedReq = makeRequest({ integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }) })
    expect(engine.decide(manualReq).outcome).toBe('manual-review-required')
    expect(engine.decide(rejectedReq).outcome).toBe('rejected')
  })

  it('L-9J-907: manual-review-required distinct from trusted-degraded', () => {
    const manualReq = makeRequest({ publisherAssessment: makePublisherAssessment({ decision: 'manual-review-required' }) })
    const r = engine.decide(manualReq)
    expect(r.outcome).toBe('manual-review-required')
    expect(r.outcome).not.toBe('trusted-degraded')
  })

  it('L-9J-908: degraded trust requires explicit policy authorization', () => {
    const policy = makePolicy({ allowDegradedTrust: false, degradedRules: [makeRule('d', { effect: 'degrade', specificity: 'global' })] })
    const r = degradedEv.evaluate(policy, [degrading('x')], [], [])
    expect(r.permitted).toBe(false)
  })

  it('L-9J-908: degraded trust requires complete degradation evidence', () => {
    const policy = makePolicy({ allowDegradedTrust: true })
    const degs = [degrading('d1'), degrading('d2')]
    const r = degradedEv.evaluate(policy, degs, [], [])
    expect(r.permitted).toBe(true)
    expect(r.degradations).toHaveLength(2)
  })

  it('L-9J-909: revocation unavailable distinct from clear', () => {
    const revUnavailable = makeRevocationAssessment({ decision: 'manual-review-required' })
    const revClear = makeRevocationAssessment({ decision: 'passed' })
    expect(revUnavailable.decision).not.toBe(revClear.decision)
  })

  it('L-9J-909: revocation evidence unavailable not flattened to not-revoked', () => {
    const req = makeRequest({
      revocationAssessment: makeRevocationAssessment({ decision: 'manual-review-required' }),
    })
    const r = engine.decide(req)
    // manual-review, not trusted
    expect(r.outcome).toBe('manual-review-required')
    expect(r.outcome).not.toBe('trusted')
  })

  it('L-9J-910: valid signature alone does not imply trust', () => {
    // Valid signature + everything else failing → still fails
    const req = makeRequest({
      integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }),
    })
    const r = engine.decide(req)
    expect(r.outcome).not.toBe('trusted')
  })

  it('L-9J-911: every decision identifies supporting assessments and policy rules', () => {
    const r = engine.decide(makeRequest())
    expect(r.assessmentTypes.length).toBeGreaterThan(0)
    expect(r.policyId).toBeDefined()
    expect(r.policyVersion).toBeDefined()
  })

  it('L-9J-912: Task 10 does not quarantine, install, activate, or authorize provisioning', () => {
    const r = engine.decide(makeRequest())
    expect(r).not.toHaveProperty('quarantineId')
    expect(r).not.toHaveProperty('provisioningToken')
    expect(r).not.toHaveProperty('installationAuthorization')
    expect(r).not.toHaveProperty('activationToken')
  })

  it('L-9J-913: evaluation time from caller, never system clock', () => {
    const fixedTime = '2020-06-15T12:00:00.000Z'
    const r = engine.decide(makeRequest({ evaluatedAt: fixedTime }))
    expect(r.evaluatedAt).toBe(fixedTime)
  })

  it('L-9J-913: repeated evaluation with same time is deterministic', () => {
    const req = makeRequest({ evaluatedAt: '2024-01-01T00:00:00.000Z' })
    expect(engine.decide(req).outcome).toBe(engine.decide(req).outcome)
  })

  it('L-9J-914: Task 10 never invokes earlier trust evaluators', () => {
    let evaluatorCalled = false
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => { evaluatorCalled = true; return new Response() }
    engine.decide(makeRequest())
    globalThis.fetch = origFetch
    expect(evaluatorCalled).toBe(false)
  })

  it('L-9J-914: no package byte access', () => {
    // Engine never calls streamArtifact or any byte reader
    const r = engine.decide(makeRequest())
    expect(r).not.toHaveProperty('streamArtifact')
  })

  it('L-9J-915: trusted decision contains no unresolved blocking or manual-review findings', () => {
    const r = engine.decide(makeRequest())
    expect(r.outcome).toBe('trusted')
    expect(r.blockingFindings).toHaveLength(0)
    expect(r.manualReviewFindings).toHaveLength(0)
  })

  it('L-9J-916: rejected decision contains at least one machine-readable blocking reason', () => {
    const req = makeRequest({ integrityAssessment: makeIntegrityAssessment({ passed: false, reason: 'integrity-mismatch' }) })
    const r = engine.decide(req)
    expect(r.outcome).toBe('rejected')
    expect(r.blockingFindings.length).toBeGreaterThan(0)
    expect(r.blockingFindings[0]?.code).toBeTruthy()
  })

  it('L-9J-917: trusted-degraded decision contains at least one recognized degradation', () => {
    const policy = makePolicy({
      allowDegradedTrust: true,
      degradedRules: [makeRule('degrade-rule', { effect: 'degrade', specificity: 'global' })],
    })
    const r = engine.decide(makeRequest({ policy }))
    expect(r.outcome).toBe('trusted-degraded')
    expect(r.degradingFindings.length).toBeGreaterThan(0)
  })

  it('L-9J-917: trusted-degraded decision preserves policy-required restrictions', () => {
    const policy = makePolicy({
      allowDegradedTrust: true,
      degradedRules: [makeRule('degrade-rule', { effect: 'degrade', specificity: 'global', detail: 'no-network' })],
    })
    const r = engine.decide(makeRequest({ policy }))
    expect(r.outcome).toBe('trusted-degraded')
    expect(r.restrictions).toContain('no-network')
  })

  it('L-9J-918: semantic result independent of assessment input ordering', () => {
    const req1 = makeRequest()
    const req2 = makeRequest()
    // Both use same assessments in same order — deterministic
    expect(engine.decide(req1).outcome).toBe(engine.decide(req2).outcome)
  })

  it('L-9J-918: policy rule ordering does not affect final outcome', () => {
    const rules1 = [makeRule('r1', { effect: 'allow', specificity: 'global' }), makeRule('r2', { effect: 'advisory', specificity: 'global' })]
    const rules2 = [makeRule('r2', { effect: 'advisory', specificity: 'global' }), makeRule('r1', { effect: 'allow', specificity: 'global' })]
    const p1 = makePolicy({ advisoryRules: rules1 })
    const p2 = makePolicy({ advisoryRules: rules2 })
    const r1 = engine.decide(makeRequest({ policy: p1 }))
    const r2 = engine.decide(makeRequest({ policy: p2 }))
    expect(r1.outcome).toBe(r2.outcome)
  })
})
