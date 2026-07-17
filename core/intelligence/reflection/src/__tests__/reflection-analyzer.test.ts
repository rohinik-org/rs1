import { describe, it, expect } from 'vitest'
import type { ExecutionResult } from '@rohinik-org/compiler'
import { ReflectionAnalyzer } from '../analyzer/reflection-analyzer.js'

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    kind: 'ExecutionResult', schemaVersion: '1.0',
    executionId: 'exec-1', executionRevision: 1, planId: 'plan-1',
    metadata: { planId: 'plan-1' },
    termination: { reason: 'SUCCESS' },
    stepRecords: [],
    journal: [],
    metrics: { totalDurationMs: 1000, stepDurations: {}, retryCount: 0, providerLatencyMs: {}, estimatedCostUsd: 0, tokensUsed: 0 },
    outputs: {},
    producedAt: '2026-01-01T00:00:01.000Z',
    ...overrides,
  }
}

const analyzer = new ReflectionAnalyzer()

describe('ReflectionAnalyzer', () => {
  it('returns ReflectionCandidate with correct executionId', () => {
    const candidate = analyzer.analyze(makeResult({ executionId: 'exec-xyz' }))
    expect(candidate.kind).toBe('ReflectionCandidate')
    expect(candidate.executionId).toBe('exec-xyz')
    expect(candidate.schemaVersion).toBe('1.0')
  })

  it('failed execution produces findings', () => {
    const candidate = analyzer.analyze(makeResult({
      termination: { reason: 'FAILED' },
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'FAILED', attempts: 1, error: 'boom' }],
    }))
    expect(candidate.findings.length).toBeGreaterThan(0)
  })

  it('successful fast execution produces no findings', () => {
    const candidate = analyzer.analyze(makeResult({
      termination: { reason: 'SUCCESS' },
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'COMPLETED', attempts: 1 }],
    }))
    expect(candidate.findings.length).toBe(0)
  })

  it('root cause reflects termination reason', () => {
    const candidate = analyzer.analyze(makeResult({ termination: { reason: 'TIMEOUT' } }))
    expect(candidate.rootCause.category).toBe('TIMEOUT')
  })
})
