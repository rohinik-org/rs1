import { describe, it, expect } from 'vitest'
import type { ExecutionResult } from '@rohinik-org/compiler'
import { RootCauseAnalyzer } from '../critics/root-cause-analyzer.js'

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

const analyzer = new RootCauseAnalyzer()

describe('RootCauseAnalyzer', () => {
  it('TIMEOUT → TIMEOUT confidence 1.0', () => {
    const rc = analyzer.analyze(makeResult({ termination: { reason: 'TIMEOUT' } }))
    expect(rc.category).toBe('TIMEOUT')
    expect(rc.confidence).toBe(1.0)
  })

  it('PROVIDER_ERROR → PROVIDER_FAILURE confidence 1.0', () => {
    const rc = analyzer.analyze(makeResult({ termination: { reason: 'PROVIDER_ERROR' } }))
    expect(rc.category).toBe('PROVIDER_FAILURE')
    expect(rc.confidence).toBe(1.0)
  })

  it('POLICY_VIOLATION → POLICY confidence 1.0', () => {
    const rc = analyzer.analyze(makeResult({ termination: { reason: 'POLICY_VIOLATION' } }))
    expect(rc.category).toBe('POLICY')
    expect(rc.confidence).toBe(1.0)
  })

  it('FAILED with network error → NETWORK confidence 0.7', () => {
    const rc = analyzer.analyze(makeResult({
      termination: { reason: 'FAILED' },
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'FAILED', attempts: 1, error: 'network connection refused' }],
    }))
    expect(rc.category).toBe('NETWORK')
    expect(rc.confidence).toBe(0.7)
  })

  it('FAILED all SKIPPED → MISSING_CAPABILITY confidence 0.8', () => {
    const rc = analyzer.analyze(makeResult({
      termination: { reason: 'FAILED' },
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'SKIPPED', attempts: 0 }],
    }))
    expect(rc.category).toBe('MISSING_CAPABILITY')
    expect(rc.confidence).toBe(0.8)
  })

  it('FAILED generic → UNKNOWN confidence 0.5', () => {
    const rc = analyzer.analyze(makeResult({
      termination: { reason: 'FAILED' },
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'FAILED', attempts: 1, error: 'something else' }],
    }))
    expect(rc.category).toBe('UNKNOWN')
    expect(rc.confidence).toBe(0.5)
  })
})
