import type { CertificationResult, CertificationReport, CertificationSummary, CertificationViolation } from '@rohinik-org/compiler'

export function createReport(results: readonly CertificationResult[], startedAt: string): CertificationReport {
  const summary = computeSummary(results)
  const violations = results.flatMap(r => r.violations as CertificationViolation[])

  return {
    reportId: crypto.randomUUID(),
    version: '0.1.0',
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    summary,
    violations,
  }
}

function computeSummary(results: readonly CertificationResult[]): CertificationSummary {
  let passed = 0, failed = 0, warned = 0, skipped = 0

  for (const r of results) {
    if (r.status === 'PASS') passed++
    else if (r.status === 'FAIL') failed++
    else if (r.status === 'WARNING') warned++
    else if (r.status === 'SKIPPED') skipped++
  }

  const overallStatus =
    failed > 0 ? 'FAIL' :
    warned > 0 ? 'WARNING' :
    'PASS'

  return { totalScenarios: results.length, passed, failed, warned, skipped, overallStatus }
}
