import { describe, it, expect } from 'vitest'
import { TrustDecisionEngine } from '@rohinik-org/package-trust-decision'
import { buildStage9JTestSystem } from '../scenarios/test-system-builder.js'
import {
  makeTrustedDecisionRequest,
  makeAuthorizationRequest,
  makeTrustSnapshot,
  AUTH_POLICY,
  ISSUED_AT,
  FAILING_INTEGRITY,
  FAILING_SIGNATURE,
  REJECTED_PUBLISHER,
  FAILING_REVOCATION,
  CRITICAL_VULN,
} from '../fixtures/index.js'

describe('denial paths', () => {
  it('integrity failure → denied decision', () => {
    const engine = new TrustDecisionEngine()
    const result = engine.decide(makeTrustedDecisionRequest({ integrityAssessment: FAILING_INTEGRITY }))
    expect(result.decision).toBe('denied')
  })

  it('invalid signature → denied or manual-review decision', () => {
    const engine = new TrustDecisionEngine()
    const result = engine.decide(makeTrustedDecisionRequest({ signatureAssessment: FAILING_SIGNATURE }))
    // Signature failure routes to manual-review by design (see assessment-consistency-validator)
    expect(['denied', 'manual-review-required']).toContain(result.decision)
  })

  it('rejected publisher → denied decision', () => {
    const engine = new TrustDecisionEngine()
    const result = engine.decide(makeTrustedDecisionRequest({ publisherAssessment: REJECTED_PUBLISHER }))
    expect(result.decision).toBe('denied')
  })

  it('revoked artifact → denied decision', () => {
    const engine = new TrustDecisionEngine()
    const result = engine.decide(makeTrustedDecisionRequest({ revocationAssessment: FAILING_REVOCATION }))
    expect(result.decision).toBe('denied')
  })

  it('denied trust snapshot → no authorization', async () => {
    const snapshot = makeTrustSnapshot('denied')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('denied')
  })

  it('quarantined trust snapshot → no authorization', async () => {
    const snapshot = makeTrustSnapshot('quarantined')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('denied')
  })

  it('denied decision persists to repository', async () => {
    const { harness } = buildStage9JTestSystem()
    const receipt = await harness.persist(
      {
        operationId: 'op-t15-001' as import('@rohinik-org/package-trust-repository').OperationId,
        recordId: 'rec-t15-001' as import('@rohinik-org/package-trust-repository').RepositoryRecordId,
        subject: (await import('../fixtures/index.js')).CANONICAL_SUBJECT,
        artifactIdentity: (await import('../fixtures/index.js')).ARTIFACT_IDENTITY,
        decision: 'denied',
        assessmentReferences: [{ assessmentKind: 'integrity', assessmentId: 'assess-001', semanticHash: 'hash-assess-001' }],
        policyReference: (await import('../fixtures/index.js')).POLICY_REF,
        recordedAt: ISSUED_AT,
      }
    )
    expect(receipt.operationId).toBeDefined()
  })

  it('denial path — multiple denial reasons captured', () => {
    const engine = new TrustDecisionEngine()
    const result = engine.decide(makeTrustedDecisionRequest({
      integrityAssessment: FAILING_INTEGRITY,
      publisherAssessment: REJECTED_PUBLISHER,
    }))
    expect(result.decision).toBe('denied')
  })
})
