import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildReferenceOptimiserProposal,
  STAGE_13_CONSTITUTIONAL_LAWS,
  type ReferenceOptimiserInput,
  type ReferenceOptimiserProposal,
  // E2E builders
  buildAdaptationEvidenceCorpus,
  buildAdaptationOpportunity,
  buildAdaptationProposal,
  buildAdaptationCandidateVersion,
  buildAdaptationBaseline,
  buildAdaptationEvaluation,
  transitionEvaluationStatus,
  buildAdaptationAdmission,
  buildAdaptationDeploymentPlan,
  buildAdaptationDeploymentRecord,
  transitionDeploymentStatus,
  buildAdaptationObservation,
  buildAcceptanceDecision,
  buildAdaptationRollback,
  buildAdaptationSupersession,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
const EV = { evidenceId: 'ev-1', evidenceHash: HASH }

// ── Constitutional law registry ───────────────────────────────────────────────

describe('STAGE_13_CONSTITUTIONAL_LAWS', () => {
  it('contains at least 10 constitutional laws', () => {
    expect(STAGE_13_CONSTITUTIONAL_LAWS.length).toBeGreaterThanOrEqual(10)
  })

  it('each law has an id and description', () => {
    for (const law of STAGE_13_CONSTITUTIONAL_LAWS) {
      expect(typeof law.id).toBe('string')
      expect(law.id).toMatch(/^LAW-/)
      expect(typeof law.description).toBe('string')
      expect(law.description.length).toBeGreaterThan(0)
    }
  })
})

// ── ReferenceOptimiser ────────────────────────────────────────────────────────

describe('buildReferenceOptimiserProposal', () => {
  function makeOptInput(overrides?: Partial<ReferenceOptimiserInput>): ReferenceOptimiserInput {
    return {
      proposalId: 'opt-prop-1' as any,
      adaptationId: 'adapt-opt-1' as any,
      opportunityId: 'opp-opt-1' as any,
      opportunityHash: HASH,
      corpusId: 'corpus-opt',
      corpusHash: HASH,
      evidenceRef: EV,
      proposedBy: 'reference-optimiser',
      proposedAt: NOW,
      weightAdjustment: 0.05,
      targetProviderId: 'provider-a',
      rationale: 'p50 latency improved by 10ms over baseline',
      ...overrides,
    }
  }

  it('valid proposal has proposalHash and ROUTING_POLICY kind', () => {
    const p = buildReferenceOptimiserProposal(makeOptInput())
    expect(p.kind).toBe('ROUTING_POLICY')
    expect(p.proposalHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('proposalHash is deterministic', () => {
    const input = makeOptInput()
    expect(buildReferenceOptimiserProposal(input).proposalHash)
      .toBe(buildReferenceOptimiserProposal(input).proposalHash)
  })

  it('missing corpus hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildReferenceOptimiserProposal(makeOptInput({ corpusHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('missing opportunity hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildReferenceOptimiserProposal(makeOptInput({ opportunityHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('weight adjustment > 0.5 → GOVERNED_LEARNING_SCOPE_EXPANSION', () => {
    expect(() => buildReferenceOptimiserProposal(makeOptInput({ weightAdjustment: 0.6 })))
      .toThrow('GOVERNED_LEARNING_SCOPE_EXPANSION')
  })

  it('weight adjustment < -0.5 → GOVERNED_LEARNING_SCOPE_EXPANSION', () => {
    expect(() => buildReferenceOptimiserProposal(makeOptInput({ weightAdjustment: -0.6 })))
      .toThrow('GOVERNED_LEARNING_SCOPE_EXPANSION')
  })

  it('no privacy/policy/eligibility/trust mutation allowed', () => {
    const p = buildReferenceOptimiserProposal(makeOptInput()) as any
    expect('privacyPolicyChange' in p).toBe(false)
    expect('eligibilityChange' in p).toBe(false)
    expect('trustBoundaryChange' in p).toBe(false)
  })
})

// ── Full E2E acceptance scenario ──────────────────────────────────────────────

describe('E2E: full adaptation accept path', () => {
  it('corpus → opportunity → proposal → candidate → baseline → eval → admit → deploy → observe → accept', () => {
    // Corpus
    const corpus = buildAdaptationEvidenceCorpus({
      corpusId: 'e2e-corpus',
      scope: 'ROUTING_POLICY',
      observationPeriod: { startAt: NOW, endAt: NOW },
      executionEvidenceRefs: [EV],
      evaluationEvidenceRefs: [],
      reliabilityEvidenceRefs: [],
      routingEvidenceRefs: [],
      economicsEvidenceRefs: [],
      policyEvidenceRefs: [],
      sealedAt: NOW,
      sealedBy: 'e2e-test',
    })
    expect(corpus.corpusId).toBe('e2e-corpus')

    // Opportunity
    const opp = buildAdaptationOpportunity({
      opportunityId: 'e2e-opp',
      corpusId: 'e2e-corpus',
      corpusHash: corpus.corpusHash,
      kind: 'ROUTING_POLICY',
      rationale: 'p50 regression detected',
      detectedAt: NOW,
      detectedBy: 'detector',
    })
    expect(opp.opportunityHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    // Proposal
    const prop = buildAdaptationProposal({
      proposalId: 'e2e-prop' as any,
      adaptationId: 'e2e-adapt' as any,
      opportunityId: 'e2e-opp' as any,
      opportunityHash: opp.opportunityHash,
      corpusId: 'e2e-corpus',
      corpusHash: HASH,
      kind: 'ROUTING_POLICY',
      proposedBy: 'e2e-optimiser',
      proposedAt: NOW,
      evidenceRef: EV,
      rationale: 'test',
      expectedBenefit: 'lower latency',
      riskHypothesis: 'none',
    })
    expect(prop.proposalHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    // Candidate
    const candidate = buildAdaptationCandidateVersion({
      versionId: 'e2e-ver' as any,
      proposalId: 'e2e-prop' as any,
      proposalHash: prop.proposalHash,
      adaptationId: 'e2e-adapt' as any,
      kind: 'ROUTING_POLICY',
      candidateConfiguration: { weight: 0.05 },
      protectedInvariants: ['privacy', 'policy'],
      rollbackProjection: { targetVersionId: 'e2e-ver-0' as any },
      createdAt: NOW,
      createdBy: 'e2e-test',
    })
    expect(candidate.versionHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    // Baseline
    const baseline = buildAdaptationBaseline({
      baselineId: 'e2e-bl' as any,
      adaptationId: 'e2e-adapt' as any,
      kind: 'ROUTING_POLICY',
      baselineVersionId: 'e2e-ver-0' as any,
      authorityRef: EV,
      approvedAt: NOW,
      approvedBy: 'e2e-authority',
    })
    expect(baseline.baselineHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    // Evaluation
    let ev = buildAdaptationEvaluation({
      evaluationId: 'e2e-eval' as any,
      proposalId: 'e2e-prop' as any,
      proposalHash: prop.proposalHash,
      candidateVersionId: 'e2e-ver' as any,
      baselineId: 'e2e-bl' as any,
      baselineHash: baseline.baselineHash,
      evaluatorId: 'external-evaluator',
      proposedById: 'e2e-optimiser',
      requestedAt: NOW,
      requestedBy: 'admission-gate',
    })
    ev = transitionEvaluationStatus(ev, 'ADMITTED', NOW)
    ev = transitionEvaluationStatus(ev, 'QUEUED', NOW)
    ev = transitionEvaluationStatus(ev, 'RUNNING', NOW)
    ev = transitionEvaluationStatus(ev, 'PASSED', NOW)
    expect(ev.status).toBe('PASSED')

    // Admission
    const adm = buildAdaptationAdmission({
      admissionId: 'e2e-adm' as any,
      proposalId: 'e2e-prop' as any,
      proposalHash: prop.proposalHash,
      candidateVersionId: 'e2e-ver' as any,
      evaluationId: 'e2e-eval' as any,
      evaluationHash: ev.evaluationHash,
      evaluationStatus: 'PASSED',
      baselineId: 'e2e-bl' as any,
      baselineHash: baseline.baselineHash,
      corpusId: 'e2e-corpus',
      corpusAuthoritative: true,
      rollbackAvailable: true,
      scopeExpansion: false,
      policyViolation: false,
      selfEvidenceViolation: false,
      protectedInvariantsIntact: true,
      requiresReview: false,
      decidedAt: NOW,
      decidedBy: 'admission-gate',
    })
    expect(adm.outcome).toBe('ADMITTED')

    // Deployment plan
    const plan = buildAdaptationDeploymentPlan({
      planId: 'e2e-plan' as any,
      admissionId: 'e2e-adm' as any,
      admissionHash: adm.admissionHash,
      proposalId: 'e2e-prop' as any,
      candidateVersionId: 'e2e-ver' as any,
      adaptationId: 'e2e-adapt' as any,
      rolloutMode: 'CANARY',
      rolloutPercent: 5,
      rollbackProjection: { targetVersionId: 'e2e-ver-0' as any },
      environment: 'staging',
      createdAt: NOW,
      createdBy: 'e2e-test',
    })
    expect(plan.planHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    // Deployment record
    let dep = buildAdaptationDeploymentRecord({
      deploymentId: 'e2e-dep' as any,
      planId: 'e2e-plan' as any,
      planHash: plan.planHash,
      admissionId: 'e2e-adm' as any,
      admissionHash: adm.admissionHash,
      proposalId: 'e2e-prop' as any,
      candidateVersionId: 'e2e-ver' as any,
      adaptationId: 'e2e-adapt' as any,
      rolloutMode: 'CANARY',
      rolloutPercent: 5,
      environment: 'staging',
      startedAt: NOW,
      startedBy: 'e2e-controller',
    })
    dep = transitionDeploymentStatus(dep, 'CANARY', NOW)
    dep = transitionDeploymentStatus(dep, 'OBSERVING', NOW)
    dep = transitionDeploymentStatus(dep, 'ACTIVE', NOW)
    expect(dep.status).toBe('ACTIVE')

    // Observation
    const obs = buildAdaptationObservation({
      observationId: 'e2e-obs' as any,
      deploymentId: 'e2e-dep' as any,
      deploymentHash: dep.deploymentHash,
      adaptationId: 'e2e-adapt' as any,
      candidateVersionId: 'e2e-ver' as any,
      windowStartAt: NOW,
      windowEndAt: NOW,
      sampleCount: 2000,
      minSampleCount: 500,
      minDurationMs: 3600000,
      actualDurationMs: 7200000,
      primaryMetricsDelta: { p50_latency: -0.1 },
      guardrailMetricsDelta: { error_rate: 0.001 },
      policyViolationDetected: false,
      safetyViolationDetected: false,
      privacyViolationDetected: false,
      regressionDetected: false,
      observedAt: NOW,
      observedBy: 'e2e-observer',
    })
    expect(obs.observationHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    // Acceptance
    const acc = buildAcceptanceDecision({
      acceptanceId: 'e2e-acc' as any,
      deploymentId: 'e2e-dep' as any,
      observationId: 'e2e-obs' as any,
      observationHash: obs.observationHash,
      adaptationId: 'e2e-adapt' as any,
      candidateVersionId: 'e2e-ver' as any,
      decidedAt: NOW,
      decidedBy: 'acceptance-gate',
    })
    expect(acc.acceptanceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

// ── E2E rollback scenario ─────────────────────────────────────────────────────

describe('E2E: regression → rollback', () => {
  it('observed regression triggers rollback', () => {
    const dep = buildAdaptationDeploymentRecord({
      deploymentId: 'rb-dep' as any,
      planId: 'rb-plan' as any,
      planHash: HASH,
      admissionId: 'rb-adm' as any,
      admissionHash: HASH,
      proposalId: 'rb-prop' as any,
      candidateVersionId: 'rb-ver' as any,
      adaptationId: 'rb-adapt' as any,
      rolloutMode: 'CANARY',
      rolloutPercent: 5,
      environment: 'staging',
      startedAt: NOW,
      startedBy: 'e2e-controller',
    })

    const rb = buildAdaptationRollback({
      rollbackId: 'rb-1' as any,
      deploymentId: 'rb-dep' as any,
      deploymentHash: dep.deploymentHash,
      adaptationId: 'rb-adapt' as any,
      candidateVersionId: 'rb-ver' as any,
      targetVersionId: 'rb-ver-0' as any,
      reason: 'regression detected in error_rate guardrail',
      requestedAt: NOW,
      requestedBy: 'rollback-controller',
    })
    expect(rb.rollbackHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(rb.targetVersionId).toBe('rb-ver-0')
  })
})

// ── E2E supersession scenario ─────────────────────────────────────────────────

describe('E2E: accepted version → supersession', () => {
  it('new accepted version supersedes prior', () => {
    const sup = buildAdaptationSupersession({
      supersessionId: 'sup-e2e' as any,
      adaptationId: 'sup-adapt' as any,
      priorVersionId: 'ver-1' as any,
      newVersionId: 'ver-2' as any,
      acceptanceId: 'acc-v2' as any,
      acceptanceHash: HASH,
      reason: 'improved routing weight',
      supersededAt: NOW,
      supersededBy: 'version-registry',
    })
    expect(sup.supersessionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(sup.priorVersionId).toBe('ver-1')
    expect(sup.newVersionId).toBe('ver-2')
  })
})
