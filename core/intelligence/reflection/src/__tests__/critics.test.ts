import { describe, it, expect } from 'vitest'
import type { ExecutionResult } from '@rohinik-org/compiler'
import { PlanCritic, ExecutionCritic, ProviderCritic } from '../critics/critics.js'

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

describe('PlanCritic', () => {
  const critic = new PlanCritic()

  it('empty step records emits PLANNING finding', () => {
    const findings = critic.analyze(makeResult({ stepRecords: [], metrics: { totalDurationMs: 0, stepDurations: {}, retryCount: 0, providerLatencyMs: {}, estimatedCostUsd: 0, tokensUsed: 0 } }))
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings.some(f => f.category === 'PLANNING')).toBe(true)
  })

  it('no findings for normal plan', () => {
    const findings = critic.analyze(makeResult({
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'COMPLETED', attempts: 1 }],
      metrics: { totalDurationMs: 1000, stepDurations: {}, retryCount: 0, providerLatencyMs: {}, estimatedCostUsd: 0, tokensUsed: 0 },
    }))
    expect(findings.length).toBe(0)
  })
})

describe('ExecutionCritic', () => {
  const critic = new ExecutionCritic()

  it('slow execution emits PERFORMANCE finding', () => {
    const findings = critic.analyze(makeResult({ metrics: { totalDurationMs: 35_000, stepDurations: {}, retryCount: 0, providerLatencyMs: {}, estimatedCostUsd: 0, tokensUsed: 0 } }))
    expect(findings.some(f => f.category === 'PERFORMANCE')).toBe(true)
  })

  it('failed step emits RELIABILITY finding', () => {
    const findings = critic.analyze(makeResult({
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'FAILED', attempts: 1, error: 'oops' }],
    }))
    expect(findings.some(f => f.category === 'RELIABILITY')).toBe(true)
  })
})

describe('ProviderCritic', () => {
  const critic = new ProviderCritic()

  it('high provider latency emits PROVIDER finding', () => {
    const findings = critic.analyze(makeResult({
      metrics: { totalDurationMs: 6_000, stepDurations: {}, retryCount: 0, providerLatencyMs: { gpt4: 6_000 }, estimatedCostUsd: 0, tokensUsed: 0 },
    }))
    expect(findings.some(f => f.category === 'PROVIDER')).toBe(true)
  })

  it('no findings for fast provider', () => {
    const findings = critic.analyze(makeResult({
      metrics: { totalDurationMs: 1_000, stepDurations: {}, retryCount: 0, providerLatencyMs: { gpt4: 500 }, estimatedCostUsd: 0, tokensUsed: 0 },
    }))
    expect(findings.length).toBe(0)
  })
})
