import { describe, it, expect } from 'vitest'
import { TrustDecisionEngine } from '@rohinik-org/package-trust-decision'
import { buildCompletionReport } from '../stage-9j-completion-report.js'
import { buildEvidence, buildCoverageEntry } from '../stage-9j-evidence-collector.js'
import { evaluateReleaseGate } from '../stage-9j-release-gate.js'
import { buildStage9JTestSystem } from '../scenarios/test-system-builder.js'
import {
  makeTrustedDecisionRequest,
  makeRecordTrustDecisionCommand,
  makeAuthorizationRequest,
  makeTrustSnapshot,
  AUTH_POLICY,
  ISSUED_AT,
  EVALUATED_AT,
  PACKAGE_ID,
  PACKAGE_VERSION,
  ARTIFACT_DIGEST,
  TENANT_ID,
  ENVIRONMENT_ID,
} from '../fixtures/index.js'
import {
  buildAuthorizationToken,
  verifyAuthorizationToken,
} from '@rohinik-org/package-provisioning-authorization'

describe('happy path', () => {
  it('trusted package — decision engine produces trusted', () => {
    const engine = new TrustDecisionEngine()
    const result = engine.decide(makeTrustedDecisionRequest())
    // TrustDecisionEngine maps 'trusted' outcome to 'trusted' decision
    expect(['trusted', 'conditionally-trusted']).toContain(result.decision)
  })

  it('trusted package — repository persists and returns record', async () => {
    const { harness } = buildStage9JTestSystem()
    const receipt = await harness.persist(makeRecordTrustDecisionCommand('trusted'))
    expect(receipt.operationId).toBe('op-t15-001')
    expect(receipt.revision).toBeGreaterThan(0)
  })

  it('trusted package — provisioning authorization granted', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(['authorized', 'authorized-with-conditions']).toContain(result.decision.outcome)
  })

  it('trusted package — authorization token builds and verifies', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(['authorized', 'authorized-with-conditions']).toContain(result.decision.outcome)
    const token = buildAuthorizationToken(result.decision, false)
    const verified = verifyAuthorizationToken(token, result.record!, 1, ISSUED_AT)
    expect(verified.valid).toBe(true)
  })

  it('trusted package — token consumed once', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness, authRecordStore } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(['authorized', 'authorized-with-conditions']).toContain(result.decision.outcome)
    const token = buildAuthorizationToken(result.decision, false)

    // Consume
    const consumeResult = await harness['config'].authorizationController.consumeAuthorization({
      authorizationId: result.record!.authorizationId,
      consumedByOperationId: 'op-consume-001',
      tokenDigest: token.split('.')[2]!,
      consumedAt: EVALUATED_AT,
      currentRepositoryRevision: 1,
    })
    expect(consumeResult.state).toBe('CONSUMED')

    // Second consume fails
    await expect(
      harness['config'].authorizationController.consumeAuthorization({
        authorizationId: result.record!.authorizationId,
        consumedByOperationId: 'op-consume-002',
        tokenDigest: token.split('.')[2]!,
        consumedAt: EVALUATED_AT,
        currentRepositoryRevision: 1,
      }),
    ).rejects.toThrow()
  })

  it('end-to-end pipeline steps are all reachable through public contracts', () => {
    // Verify each step can be called via harness (structural test — no private internals)
    const { harness } = buildStage9JTestSystem()
    expect(typeof harness.decide).toBe('function')
    expect(typeof harness.persist).toBe('function')
    expect(typeof harness.quarantine).toBe('function')
    expect(typeof harness.reevaluate).toBe('function')
    expect(typeof harness.authorizeProvisioning).toBe('function')
  })

  it('release evidence builds and digests', () => {
    const evidence = buildEvidence({
      stageId: '9J',
      commit: 'abc123',
      packageVersions: [{ packageName: '@rohinik-org/package-trust-integration', version: '0.1.0' }],
      testSuites: [{ suiteName: 'happy-path', testCount: 7, passed: 7, failed: 0 }],
      constitutionalCoverage: [buildCoverageEntry('L-9J-1401', 'Task 15', [], ['happy-path'], 'verified')],
      scenarioResults: [{ scenarioId: 'trusted-package', outcome: 'passed', durationMs: 10 }],
      migrationResults: [],
      securityResults: [],
      knownDeviations: [],
      generatedAt: ISSUED_AT,
    })
    expect(evidence.evidenceDigest).toBeDefined()
    expect(evidence.evidenceDigest.length).toBe(64)
    const gate = evaluateReleaseGate(evidence)
    expect(gate.outcome).toBe('passed')
  })

  it('completion report builds from evidence', () => {
    const evidence = buildEvidence({
      stageId: '9J',
      commit: 'abc123',
      packageVersions: [{ packageName: '@rohinik-org/package-trust-integration', version: '0.1.0' }],
      testSuites: [{ suiteName: 'happy-path', testCount: 8, passed: 8, failed: 0 }],
      constitutionalCoverage: [],
      scenarioResults: [],
      migrationResults: [],
      securityResults: [],
      knownDeviations: [],
      generatedAt: ISSUED_AT,
    })
    const gate = evaluateReleaseGate(evidence)
    const report = buildCompletionReport(evidence, gate)
    expect(report.title).toBe('Stage 9J — Integration and Constitutional Verification')
    expect(report.taskMatrix['Task 15 — Integration Verification']).toBe('complete')
  })
})
