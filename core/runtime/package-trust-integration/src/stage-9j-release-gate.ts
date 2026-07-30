import type { Stage9JVerificationEvidence } from './stage-9j-evidence-collector.js'

export type ReleaseGateOutcome = 'passed' | 'failed' | 'blocked'

export interface Stage9JReleaseGateReason {
  readonly code: string
  readonly detail: string
}

export interface Stage9JReleaseGateResult {
  readonly outcome: ReleaseGateOutcome
  readonly reasons: readonly Stage9JReleaseGateReason[]
  readonly evidenceDigest?: string
  readonly requiredActions: readonly string[]
}

export function evaluateReleaseGate(evidence: Stage9JVerificationEvidence): Stage9JReleaseGateResult {
  const reasons: Stage9JReleaseGateReason[] = []
  const required: string[] = []

  // All laws must be verified (no failed)
  const failedLaws = evidence.constitutionalCoverage.filter(e => e.status === 'failed')
  if (failedLaws.length > 0) {
    reasons.push({
      code: 'constitutional-law-failed',
      detail: `Laws failed: ${failedLaws.map(l => l.lawId).join(', ')}`,
    })
    required.push('Resolve all failing constitutional laws')
  }

  // All scenarios must pass
  const failedScenarios = evidence.scenarioResults.filter(s => s.outcome === 'failed')
  if (failedScenarios.length > 0) {
    reasons.push({
      code: 'scenario-failed',
      detail: `Scenarios failed: ${failedScenarios.map(s => s.scenarioId).join(', ')}`,
    })
    required.push('Fix all failing integration scenarios')
  }

  // All security tests must pass
  const failedSecurity = evidence.securityResults.filter(s => s.outcome !== 'blocked' && s.outcome !== 'passed')
  if (failedSecurity.length > 0) {
    reasons.push({
      code: 'security-verification-failed',
      detail: `Security tests failed: ${failedSecurity.map(s => s.testId).join(', ')}`,
    })
    required.push('Fix all failing security tests')
  }

  // All test suites must have zero failures
  const failedSuites = evidence.testSuites.filter(s => s.failed > 0)
  if (failedSuites.length > 0) {
    reasons.push({
      code: 'test-suite-failed',
      detail: `Test suites with failures: ${failedSuites.map(s => s.suiteName).join(', ')}`,
    })
    required.push('Fix all test suite failures')
  }

  // No P0 known deviations (they cannot be waived)
  const p0deviations = evidence.knownDeviations.filter(d => d.severity === 'P0')
  if (p0deviations.length > 0) {
    reasons.push({
      code: 'p0-deviation-present',
      detail: `P0 deviations: ${p0deviations.map(d => d.deviationId).join(', ')}`,
    })
    required.push('Resolve all P0 constitutional/security violations')
  }

  // No P1 known deviations
  const p1deviations = evidence.knownDeviations.filter(d => d.severity === 'P1')
  if (p1deviations.length > 0) {
    reasons.push({
      code: 'p1-deviation-present',
      detail: `P1 deviations: ${p1deviations.map(d => d.deviationId).join(', ')}`,
    })
    required.push('Resolve all P1 correctness/durability violations')
  }

  const outcome: ReleaseGateOutcome = reasons.length === 0 ? 'passed' : 'failed'
  return {
    outcome,
    reasons,
    ...(outcome === 'passed' && { evidenceDigest: evidence.evidenceDigest }),
    requiredActions: required,
  }
}
