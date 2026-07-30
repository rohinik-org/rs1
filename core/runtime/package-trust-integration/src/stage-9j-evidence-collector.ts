import { createHash } from 'crypto'

export type LawStatus = 'verified' | 'failed' | 'not-applicable'

export interface Stage9JConstitutionalCoverageEntry {
  readonly lawId: string
  readonly owningTask: string
  readonly localTestReferences: readonly string[]
  readonly integrationTestReferences: readonly string[]
  readonly status: LawStatus
}

export interface TestSuiteEvidence {
  readonly suiteName: string
  readonly testCount: number
  readonly passed: number
  readonly failed: number
}

export interface Stage9JScenarioEvidence {
  readonly scenarioId: string
  readonly outcome: 'passed' | 'failed'
  readonly durationMs: number
}

export interface MigrationEvidence {
  readonly schemaId: string
  readonly outcome: 'compatible' | 'migration-required' | 'unsupported'
}

export interface SecurityVerificationEvidence {
  readonly testId: string
  readonly outcome: 'blocked' | 'passed'
}

export interface KnownDeviation {
  readonly deviationId: string
  readonly description: string
  readonly affectedTasks: readonly string[]
  readonly severity: 'P0' | 'P1' | 'P2' | 'P3'
  readonly mitigation: string
}

export interface PackageVersionReference {
  readonly packageName: string
  readonly version: string
}

export interface Stage9JVerificationEvidence {
  readonly evidenceId: string
  readonly stageId: '9J'
  readonly commit: string
  readonly packageVersions: readonly PackageVersionReference[]
  readonly testSuites: readonly TestSuiteEvidence[]
  readonly constitutionalCoverage: readonly Stage9JConstitutionalCoverageEntry[]
  readonly scenarioResults: readonly Stage9JScenarioEvidence[]
  readonly migrationResults: readonly MigrationEvidence[]
  readonly securityResults: readonly SecurityVerificationEvidence[]
  readonly knownDeviations: readonly KnownDeviation[]
  readonly generatedAt: string
  readonly evidenceDigest: string
}

function computeEvidenceDigest(evidence: Omit<Stage9JVerificationEvidence, 'evidenceDigest'>): string {
  const canonical = JSON.stringify({
    commit: evidence.commit,
    packageVersions: evidence.packageVersions,
    testSuites: evidence.testSuites,
    constitutionalCoverage: evidence.constitutionalCoverage.map(e => ({
      lawId: e.lawId,
      status: e.status,
    })),
    scenarioResults: evidence.scenarioResults.map(s => ({
      scenarioId: s.scenarioId,
      outcome: s.outcome,
    })),
    migrationResults: evidence.migrationResults,
    securityResults: evidence.securityResults,
    knownDeviations: evidence.knownDeviations.map(d => d.deviationId),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function buildEvidence(
  partial: Omit<Stage9JVerificationEvidence, 'evidenceId' | 'evidenceDigest'>,
): Stage9JVerificationEvidence {
  const withoutDigest = {
    ...partial,
    evidenceId: `9J-${partial.generatedAt}`,
  }
  return {
    ...withoutDigest,
    evidenceDigest: computeEvidenceDigest(withoutDigest),
  }
}

export function buildCoverageEntry(
  lawId: string,
  owningTask: string,
  localTests: string[],
  integrationTests: string[],
  status: LawStatus,
): Stage9JConstitutionalCoverageEntry {
  return {
    lawId,
    owningTask,
    localTestReferences: localTests,
    integrationTestReferences: integrationTests,
    status,
  }
}
