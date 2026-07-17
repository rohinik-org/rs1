import { describe, it, expect } from 'vitest'
import { createReport } from '../reporter/certification-reporter.js'
import type { CertificationResult, CertificationBenchmark } from '@rohinik-org/compiler'

function makeBenchmark(scenarioId: string): CertificationBenchmark {
  return { scenarioId, executionTimeMs: 100, baselineMs: 200, memoryMb: 10, cpuPercent: 0, withinBaseline: true }
}

function makeResult(scenarioId: string, status: CertificationResult['status'], violations: CertificationResult['violations'] = []): CertificationResult {
  return { resultId: scenarioId, scenarioId, name: scenarioId, category: 'PLANNING', status, violations, benchmark: makeBenchmark(scenarioId), completedAt: new Date().toISOString() }
}

describe('createReport', () => {
  it('correct total scenario count', () => {
    expect(createReport([makeResult('s1', 'PASS'), makeResult('s2', 'PASS')], new Date().toISOString()).summary.totalScenarios).toBe(2)
  })

  it('overallStatus PASS when all pass', () => {
    expect(createReport([makeResult('s1', 'PASS')], new Date().toISOString()).summary.overallStatus).toBe('PASS')
  })

  it('overallStatus FAIL when any fail', () => {
    expect(createReport([makeResult('s1', 'PASS'), makeResult('s2', 'FAIL')], new Date().toISOString()).summary.overallStatus).toBe('FAIL')
  })

  it('overallStatus WARNING when any warn but none fail', () => {
    expect(createReport([makeResult('s1', 'PASS'), makeResult('s2', 'WARNING')], new Date().toISOString()).summary.overallStatus).toBe('WARNING')
  })

  it('violations flattened across all results', () => {
    const v = { violationId: 'v1', invariantId: 'PLAN-001', scenarioId: 's1', severity: 'ERROR' as const, message: 'failed' }
    const report = createReport([makeResult('s1', 'FAIL', [v])], new Date().toISOString())
    expect(report.violations.length).toBe(1)
    expect(report.violations[0]!.violationId).toBe('v1')
  })

  it('reportId is unique across calls', () => {
    const r1 = createReport([], new Date().toISOString())
    const r2 = createReport([], new Date().toISOString())
    expect(r1.reportId).not.toBe(r2.reportId)
  })
})
