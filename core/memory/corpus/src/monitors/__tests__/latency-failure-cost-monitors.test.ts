import { describe, it, expect } from 'vitest'
import { LatencyMonitor } from '../latency-monitor.js'
import { FailureMonitor } from '../failure-monitor.js'
import { CostMonitor } from '../cost-monitor.js'
import type { ExecutionRecord } from '@rohinik-org/compiler'
import { randomUUID } from 'node:crypto'

function rec(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0', recordId: randomUUID(),
    runtimeId: 'r', timestamp: '2026-07-08T12:00:00Z', requestId: randomUUID(),
    requestHash: 'h', contentType: 'TEXT', requestSizeBytes: 10,
    outcome: 'SUCCESS', allCandidates: [], reasoningInvoked: false,
    retried: false, retryCount: 0, totalLatencyMs: 100, tierLatencies: [],
    providerResolutions: [], sourceTraceId: 't', runtimeVersion: '0.1.0',
    winnerSkillId: 'csv.parse', ...overrides,
  }
}

describe('LatencyMonitor', () => {
  it('returns null while latency is stable', () => {
    const monitor = new LatencyMonitor({ deviationThresholdPercent: 50, minSamples: 5 })
    for (let i = 0; i < 5; i++) expect(monitor.observe(rec({ totalLatencyMs: 100 }))).toBeNull()
  })

  it('emits LATENCY_REGRESSION when P95 exceeds baseline by threshold', () => {
    const monitor = new LatencyMonitor({ deviationThresholdPercent: 50, minSamples: 3 })
    monitor.observe(rec({ totalLatencyMs: 100 }))
    monitor.observe(rec({ totalLatencyMs: 100 }))
    monitor.observe(rec({ totalLatencyMs: 100 }))
    const trigger = monitor.observe(rec({ totalLatencyMs: 5000 }))
    expect(trigger?.triggerKind).toBe('LATENCY_REGRESSION')
    expect(trigger?.evidence.metric).toBe('p95_latency_ms')
  })

  it('reset clears state', () => {
    const monitor = new LatencyMonitor({ deviationThresholdPercent: 10, minSamples: 2 })
    monitor.observe(rec({ totalLatencyMs: 100 }))
    monitor.observe(rec({ totalLatencyMs: 100 }))
    monitor.observe(rec({ totalLatencyMs: 5000 }))
    monitor.reset()
    expect(monitor.observe(rec({ totalLatencyMs: 100 }))).toBeNull()
  })
})

describe('FailureMonitor', () => {
  it('returns null below failure rate threshold', () => {
    const monitor = new FailureMonitor({ failureRateThreshold: 0.5, minSamples: 4 })
    for (let i = 0; i < 4; i++) {
      expect(monitor.observe(rec({ outcome: i === 0 ? 'FAILED' : 'SUCCESS' }))).toBeNull()
    }
  })

  it('emits FAILURE_SPIKE when failure rate exceeds threshold', () => {
    const monitor = new FailureMonitor({ failureRateThreshold: 0.5, minSamples: 2 })
    monitor.observe(rec({ outcome: 'FAILED' }))
    const trigger = monitor.observe(rec({ outcome: 'FAILED' }))
    expect(trigger?.triggerKind).toBe('FAILURE_SPIKE')
    expect(trigger?.evidence.metric).toBe('failure_rate')
  })
})

describe('CostMonitor', () => {
  it('returns null when cost is stable', () => {
    const monitor = new CostMonitor({ deviationThresholdPercent: 100, minSamples: 3 })
    for (let i = 0; i < 3; i++) expect(monitor.observe(rec({ estimatedCostUsd: 0.01 }))).toBeNull()
  })

  it('emits COST_ANOMALY when cost spikes', () => {
    const monitor = new CostMonitor({ deviationThresholdPercent: 50, minSamples: 3 })
    monitor.observe(rec({ estimatedCostUsd: 0.01 }))
    monitor.observe(rec({ estimatedCostUsd: 0.01 }))
    monitor.observe(rec({ estimatedCostUsd: 0.01 }))
    const trigger = monitor.observe(rec({ estimatedCostUsd: 1.00 }))
    expect(trigger?.triggerKind).toBe('COST_ANOMALY')
  })
})
