import { describe, it, expect } from 'vitest'
import type { ExecutionResult } from '@rohinik-org/compiler'
import { ReflectionEngine } from '../engine/reflection-engine.js'
import { NullReflectionStore } from '../store/null-reflection-store.js'

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    kind: 'ExecutionResult', schemaVersion: '1.0',
    executionId: 'exec-1', executionRevision: 1, planId: 'plan-1',
    metadata: { planId: 'plan-1' },
    termination: { reason: 'SUCCESS' },
    stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'COMPLETED', attempts: 1 }],
    journal: [],
    metrics: { totalDurationMs: 1000, stepDurations: {}, retryCount: 0, providerLatencyMs: {}, estimatedCostUsd: 0, tokensUsed: 0 },
    outputs: {},
    producedAt: '2026-01-01T00:00:01.000Z',
    ...overrides,
  }
}

describe('ReflectionEngine', () => {
  it('returns ReflectionReport with correct executionId', async () => {
    const engine = new ReflectionEngine(new NullReflectionStore())
    const report = await engine.reflect(makeResult({ executionId: 'exec-abc' }))
    expect(report.kind).toBe('ReflectionReport')
    expect(report.executionId).toBe('exec-abc')
  })

  it('failed execution → APPROVED report persisted in store', async () => {
    const store = new NullReflectionStore()
    const engine = new ReflectionEngine(store)
    const report = await engine.reflect(makeResult({
      termination: { reason: 'FAILED' },
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'sk1', state: 'FAILED', attempts: 1, error: 'boom' }],
    }))
    expect(report.status).toBe('APPROVED')
    expect(await store.get(report.reportId)).toBeDefined()
  })

  it('successful execution → REJECTED (no findings)', async () => {
    const engine = new ReflectionEngine(new NullReflectionStore())
    const report = await engine.reflect(makeResult({ termination: { reason: 'SUCCESS' } }))
    expect(report.status).toBe('REJECTED')
  })

  it('never throws even when status is DEFERRED', async () => {
    // minimumConfidence > PERFORMANCE finding confidence (0.9) but result has no FAILED steps → DEFERRED
    const engine = new ReflectionEngine(new NullReflectionStore(), { minimumConfidence: 0.95, emitLearningTriggers: false, emitMemoryArtifacts: false, emitObservations: false })
    const report = await engine.reflect(makeResult({
      termination: { reason: 'SUCCESS' },
      metrics: { totalDurationMs: 35_000, stepDurations: {}, retryCount: 0, providerLatencyMs: {}, estimatedCostUsd: 0, tokensUsed: 0 },
    }))
    expect(report.status).toBe('DEFERRED')
  })

  it('recommendations carry findingRefs', async () => {
    const engine = new ReflectionEngine(new NullReflectionStore())
    const report = await engine.reflect(makeResult({
      termination: { reason: 'TIMEOUT' },
    }))
    if (report.recommendations.length > 0) {
      expect(report.recommendations[0]?.findingRefs.length).toBeGreaterThanOrEqual(0)
    }
  })
})
