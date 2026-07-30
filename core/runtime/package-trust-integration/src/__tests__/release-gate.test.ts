import { describe, it, expect } from 'vitest'
import { buildEvidence, buildCoverageEntry } from '../stage-9j-evidence-collector.js'
import { evaluateReleaseGate } from '../stage-9j-release-gate.js'
import { buildCompletionReport } from '../stage-9j-completion-report.js'
import { verifyConstitutionalCoverage } from '../stage-9j-constitutional-verifier.js'
import { ISSUED_AT } from '../fixtures/index.js'

const ALL_LAWS = Array.from({ length: 28 }, (_, i) => `L-9J-${1401 + i}`)

function makeFullEvidence(overrides: Partial<Parameters<typeof buildEvidence>[0]> = {}) {
  const constitutionalCoverage = ALL_LAWS.map(lawId =>
    buildCoverageEntry(lawId, 'Task 15', [], [`${lawId} constitutional test`], 'verified'),
  )
  return buildEvidence({
    stageId: '9J',
    commit: 'test-commit-abc',
    packageVersions: [
      { packageName: '@rohinik-org/package-trust-integration', version: '0.1.0' },
    ],
    testSuites: [
      { suiteName: 'happy-path', testCount: 9, passed: 9, failed: 0 },
      { suiteName: 'degraded-paths', testCount: 6, passed: 6, failed: 0 },
      { suiteName: 'denial-paths', testCount: 8, passed: 8, failed: 0 },
      { suiteName: 'quarantine', testCount: 6, passed: 6, failed: 0 },
      { suiteName: 'reevaluation', testCount: 7, passed: 7, failed: 0 },
      { suiteName: 'authorization', testCount: 8, passed: 8, failed: 0 },
      { suiteName: 'idempotency', testCount: 6, passed: 6, failed: 0 },
      { suiteName: 'concurrency', testCount: 5, passed: 5, failed: 0 },
      { suiteName: 'recovery', testCount: 6, passed: 6, failed: 0 },
      { suiteName: 'migrations', testCount: 7, passed: 7, failed: 0 },
      { suiteName: 'compatibility', testCount: 6, passed: 6, failed: 0 },
      { suiteName: 'security', testCount: 8, passed: 8, failed: 0 },
      { suiteName: 'constitutional-laws', testCount: 28, passed: 28, failed: 0 },
    ],
    constitutionalCoverage,
    scenarioResults: [
      { scenarioId: 'trusted-package', outcome: 'passed', durationMs: 50 },
      { scenarioId: 'conditionally-trusted', outcome: 'passed', durationMs: 50 },
      { scenarioId: 'manual-review', outcome: 'passed', durationMs: 50 },
      { scenarioId: 'denied-integrity', outcome: 'passed', durationMs: 50 },
    ],
    migrationResults: [
      { schemaId: 'PackageTrustDecisionRecord@1.0', outcome: 'compatible' },
      { schemaId: 'PackageQuarantineRecord@1.0', outcome: 'compatible' },
      { schemaId: 'AuthorizationRecord@1.0', outcome: 'compatible' },
    ],
    securityResults: ALL_LAWS.map((_, i) => ({ testId: `sec-${i + 1}`, outcome: 'blocked' as const })),
    knownDeviations: [],
    generatedAt: ISSUED_AT,
    ...overrides,
  })
}

describe('release gate', () => {
  it('passes when all laws verified, all tests pass, no deviations', () => {
    const evidence = makeFullEvidence()
    const gate = evaluateReleaseGate(evidence)
    expect(gate.outcome).toBe('passed')
  })

  it('fails when any constitutional law fails', () => {
    const evidence = makeFullEvidence({
      constitutionalCoverage: [
        ...ALL_LAWS.slice(1).map(lawId => buildCoverageEntry(lawId, 'T15', [], [], 'verified')),
        buildCoverageEntry('L-9J-1401', 'T15', [], [], 'failed'), // one failing
      ],
    })
    const gate = evaluateReleaseGate(evidence)
    expect(gate.outcome).toBe('failed')
    expect(gate.reasons.some(r => r.code === 'constitutional-law-failed')).toBe(true)
  })

  it('fails when any test suite has failures', () => {
    const evidence = makeFullEvidence({
      testSuites: [{ suiteName: 'happy-path', testCount: 9, passed: 8, failed: 1 }],
    })
    const gate = evaluateReleaseGate(evidence)
    expect(gate.outcome).toBe('failed')
  })

  it('fails when P0 deviation present', () => {
    const evidence = makeFullEvidence({
      knownDeviations: [{
        deviationId: 'DEV-001',
        description: 'P0 violation',
        affectedTasks: ['Task 14'],
        severity: 'P0',
        mitigation: 'none',
      }],
    })
    const gate = evaluateReleaseGate(evidence)
    expect(gate.outcome).toBe('failed')
    expect(gate.reasons.some(r => r.code === 'p0-deviation-present')).toBe(true)
  })

  it('fails when P1 deviation present', () => {
    const evidence = makeFullEvidence({
      knownDeviations: [{
        deviationId: 'DEV-002',
        description: 'P1 violation',
        affectedTasks: ['Task 12'],
        severity: 'P1',
        mitigation: 'pending',
      }],
    })
    const gate = evaluateReleaseGate(evidence)
    expect(gate.outcome).toBe('failed')
  })

  it('evidence digest changes when any covered field changes', () => {
    const e1 = makeFullEvidence()
    const e2 = makeFullEvidence({ commit: 'different-commit' })
    expect(e1.evidenceDigest).not.toBe(e2.evidenceDigest)
  })

  it('evidence digest is deterministic for same inputs', () => {
    const e1 = makeFullEvidence()
    const e2 = makeFullEvidence()
    expect(e1.evidenceDigest).toBe(e2.evidenceDigest)
  })

  it('passed gate includes evidence digest', () => {
    const evidence = makeFullEvidence()
    const gate = evaluateReleaseGate(evidence)
    expect(gate.outcome).toBe('passed')
    expect(gate.evidenceDigest).toBe(evidence.evidenceDigest)
  })

  it('completion report produced from evidence and gate', () => {
    const evidence = makeFullEvidence()
    const gate = evaluateReleaseGate(evidence)
    const report = buildCompletionReport(evidence, gate)
    expect(report.title).toBe('Stage 9J — Integration and Constitutional Verification')
    expect(report.releaseGate.outcome).toBe('passed')
    expect(report.verifiedLawCount).toBe(28)
  })

  it('constitutional verifier returns allVerified=true when all laws verified', () => {
    const entries = ALL_LAWS.map(lawId =>
      buildCoverageEntry(lawId, 'T15', [], [], 'verified'),
    )
    const result = verifyConstitutionalCoverage(entries)
    expect(result.allVerified).toBe(true)
    expect(result.lawCount).toBe(28)
  })

  it('constitutional verifier returns allVerified=false when any law fails', () => {
    const entries = [
      ...ALL_LAWS.slice(1).map(lawId => buildCoverageEntry(lawId, 'T15', [], [], 'verified')),
      buildCoverageEntry('L-9J-1401', 'T15', [], [], 'failed'),
    ]
    const result = verifyConstitutionalCoverage(entries)
    expect(result.allVerified).toBe(false)
    expect(result.failed.length).toBe(1)
  })
})
