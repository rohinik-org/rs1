import { describe, it, expect } from 'vitest'
import type {
  ExecutionRecord, ExecutionCandidate, TierLatency, ProviderResolutionRecord,
} from '../execution-record.js'

describe('ExecutionRecord', () => {
  it('accepts a minimal successful record', () => {
    const record: ExecutionRecord = {
      kind: 'ExecutionRecord',
      schemaVersion: '1.0',
      recordId: 'sha256-abc123',
      runtimeId: 'runtime-1',
      timestamp: '2026-07-08T12:00:00Z',
      requestId: 'req-001',
      requestHash: 'sha256-req',
      contentType: 'TEXT',
      requestSizeBytes: 42,
      outcome: 'SUCCESS',
      winnerTierId: 'DETERMINISTIC',
      winnerSkillId: 'csv.parse',
      allCandidates: [],
      reasoningInvoked: false,
      retried: false,
      retryCount: 0,
      totalLatencyMs: 12,
      tierLatencies: [],
      providerResolutions: [],
      sourceTraceId: 'req-001',
      runtimeVersion: '0.1.0-alpha.1',
    }
    expect(record.kind).toBe('ExecutionRecord')
    expect(record.outcome).toBe('SUCCESS')
    expect(record.schemaVersion).toBe('1.0')
  })

  it('accepts all four outcome values', () => {
    const outcomes: ExecutionRecord['outcome'][] = ['SUCCESS', 'FAILED', 'NO_ROUTE', 'TIMEOUT']
    for (const outcome of outcomes) {
      const r: ExecutionRecord = {
        kind: 'ExecutionRecord', schemaVersion: '1.0', recordId: 'x', runtimeId: 'r',
        timestamp: '2026-07-08T00:00:00Z', requestId: 'q', requestHash: 'h',
        contentType: 'TEXT', requestSizeBytes: 1, outcome,
        allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
        totalLatencyMs: 0, tierLatencies: [], providerResolutions: [],
        sourceTraceId: 'q', runtimeVersion: '0.1.0',
      }
      expect(r.outcome).toBe(outcome)
    }
  })

  it('accepts optional cost and token fields', () => {
    const record: ExecutionRecord = {
      kind: 'ExecutionRecord', schemaVersion: '1.0', recordId: 'x', runtimeId: 'r',
      timestamp: '2026-07-08T00:00:00Z', requestId: 'q', requestHash: 'h',
      contentType: 'TEXT', requestSizeBytes: 10, outcome: 'SUCCESS',
      allCandidates: [], reasoningInvoked: true, retried: false, retryCount: 0,
      totalLatencyMs: 800, tierLatencies: [], providerResolutions: [],
      sourceTraceId: 'q', runtimeVersion: '0.1.0',
      estimatedCostUsd: 0.002, tokensUsed: 450,
    }
    expect(record.estimatedCostUsd).toBe(0.002)
    expect(record.tokensUsed).toBe(450)
  })

  it('accepts ExecutionCandidate array', () => {
    const candidate: ExecutionCandidate = {
      skillId: 'csv.parse', tierId: 'DETERMINISTIC', score: 0.95, selected: true,
    }
    expect(candidate.selected).toBe(true)
  })

  it('accepts TierLatency array', () => {
    const tl: TierLatency = {
      tierId: 'DETERMINISTIC', latencyMs: 5, evaluated: true, rejected: false,
    }
    expect(tl.evaluated).toBe(true)
  })

  it('accepts ProviderResolutionRecord array', () => {
    const pr: ProviderResolutionRecord = {
      requirementKey: 'reasoning', providerId: 'anthropic', providerKind: 'reasoning',
      resolved: true, latencyMs: 350,
    }
    expect(pr.resolved).toBe(true)
  })
})
