import type { Stage9JVerificationEvidence } from './stage-9j-evidence-collector.js'
import type { Stage9JReleaseGateResult } from './stage-9j-release-gate.js'

export interface Stage9JCompletionReport {
  readonly title: 'Stage 9J — Integration and Constitutional Verification'
  readonly purpose: string
  readonly packages: readonly string[]
  readonly taskMatrix: Record<string, 'complete' | 'pending'>
  readonly architecturalBoundaries: readonly string[]
  readonly totalTests: number
  readonly constitutionalLawCount: number
  readonly verifiedLawCount: number
  readonly knownDeviationCount: number
  readonly releaseGate: Stage9JReleaseGateResult
  readonly evidenceDigest: string
  readonly generatedAt: string
}

const TASK_MATRIX: Record<string, 'complete' | 'pending'> = {
  'Task 1 — Package Trust IR': 'complete',
  'Task 2 — Artifact Acquisition': 'complete',
  'Task 3 — Artifact Integrity': 'complete',
  'Task 4 — Signature Verification': 'complete',
  'Task 5 — Publisher Trust': 'complete',
  'Task 6 — Revocation Evaluation': 'complete',
  'Task 7 — Provenance Verification': 'complete',
  'Task 8 — Permission Evaluation': 'complete',
  'Task 9 — Vulnerability Evaluation': 'complete',
  'Task 10 — Trust Decision Engine': 'complete',
  'Task 11 — Package Quarantine': 'complete',
  'Task 12 — Package Trust Repository': 'complete',
  'Task 13 — Package Trust Reevaluation': 'complete',
  'Task 14 — Provisioning Authorization': 'complete',
  'Task 15 — Integration Verification': 'complete',
}

export function buildCompletionReport(
  evidence: Stage9JVerificationEvidence,
  gate: Stage9JReleaseGateResult,
): Stage9JCompletionReport {
  const totalTests = evidence.testSuites.reduce((sum, s) => sum + s.testCount, 0)
  const verifiedLaws = evidence.constitutionalCoverage.filter(e => e.status === 'verified').length

  return {
    title: 'Stage 9J — Integration and Constitutional Verification',
    purpose:
      'Proves that Tasks 1–14 operate together as one deterministic, fail-closed, auditable, upgrade-safe package trust system while preserving every architectural boundary, constitutional law, lifecycle guarantee, and downstream safety condition.',
    packages: evidence.packageVersions.map(p => p.packageName),
    taskMatrix: TASK_MATRIX,
    architecturalBoundaries: [
      'Task 10 sole trust-decision authority',
      'Task 11 sole quarantine-action boundary',
      'Task 12 sole durable trust-history boundary',
      'Task 13 sole reevaluation-orchestration boundary',
      'Task 14 sole provisioning-authorization boundary',
      'Capability Binding remains downstream of Task 14',
    ],
    totalTests,
    constitutionalLawCount: evidence.constitutionalCoverage.length,
    verifiedLawCount: verifiedLaws,
    knownDeviationCount: evidence.knownDeviations.length,
    releaseGate: gate,
    evidenceDigest: evidence.evidenceDigest,
    generatedAt: evidence.generatedAt,
  }
}
