import type { RuntimeFixture } from './runtime-validation-ir-6-5.js'

export type CertificationStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED'
export type CertificationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
export type CertificationCategory =
  | 'PLANNING' | 'EXECUTION' | 'MEMORY' | 'OBSERVATION' | 'ACQUISITION'
  | 'REFLECTION' | 'REASONING' | 'MULTI_AGENT' | 'DISTRIBUTED' | 'DAEMON'
  | 'AUTONOMY' | 'FULL_PIPELINE'

// invariantId is namespaced: PLAN-001, EXEC-001, MEM-001, DIST-001, AGENT-001, etc.
export interface CertificationExpectation {
  readonly invariantId: string
  readonly description: string
  readonly category: CertificationCategory
}

export interface CertificationScenario {
  readonly scenarioId: string
  readonly name: string
  readonly tags: readonly CertificationCategory[]
  readonly fixture: RuntimeFixture
  readonly expectations: readonly CertificationExpectation[]
  readonly timeoutMs?: number
}

export interface CertificationViolation {
  readonly violationId: string
  readonly invariantId: string
  readonly scenarioId: string
  readonly severity: CertificationSeverity
  readonly message: string
}

export interface CertificationBenchmark {
  readonly scenarioId: string
  readonly executionTimeMs: number
  readonly baselineMs: number
  readonly memoryMb: number
  readonly cpuPercent: number
  readonly withinBaseline: boolean
}

export interface CertificationResult {
  readonly resultId: string
  readonly scenarioId: string
  readonly name: string
  readonly category: CertificationCategory
  readonly status: CertificationStatus
  readonly violations: readonly CertificationViolation[]
  readonly benchmark: CertificationBenchmark
  readonly completedAt: string
}

export interface CertificationSummary {
  readonly totalScenarios: number
  readonly passed: number
  readonly failed: number
  readonly warned: number
  readonly skipped: number
  readonly overallStatus: CertificationStatus
}

export interface CertificationReport {
  readonly reportId: string
  readonly version: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly results: readonly CertificationResult[]
  readonly summary: CertificationSummary
  readonly violations: readonly CertificationViolation[]
}

export interface CertificationQuery {
  readonly category?: CertificationCategory
  readonly status?: CertificationStatus
  readonly limit?: number
}
