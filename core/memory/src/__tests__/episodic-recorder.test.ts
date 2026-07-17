import { describe, it, expect } from 'vitest'
import { EpisodicRecorder } from '../episodic/episodic-recorder.js'
import { NullMemoryStore } from '../store/null-memory-store.js'
import type { ExecutionResult } from '@rohinik-org/compiler'

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    kind: 'ExecutionResult',
    schemaVersion: '1.0',
    executionId: 'exec-abc123',
    executionRevision: 1,
    planId: 'plan-1',
    metadata: { planId: 'plan-1', triggeredBy: 'test' },
    termination: { reason: 'SUCCESS' },
    stepRecords: [
      { stepId: 's1', position: 0, skillId: 'csv-reader', state: 'COMPLETED', attempts: 1, providerUsed: 'node' },
      { stepId: 's2', position: 1, skillId: 'data-filter', state: 'COMPLETED', attempts: 2, providerUsed: 'node' },
    ],
    journal: [],
    metrics: {
      totalDurationMs: 500,
      stepDurations: {},
      retryCount: 1,
      providerLatencyMs: {},
      estimatedCostUsd: 0.001,
      tokensUsed: 100,
    },
    outputs: {},
    producedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ExecutionResult
}

describe('EpisodicRecorder', () => {
  it('produces episode with correct shape', async () => {
    const store = new NullMemoryStore()
    const recorder = new EpisodicRecorder(store)
    const episode = await recorder.record(makeResult())
    expect(episode.kind).toBe('MemoryEpisode')
    expect(episode.executionId).toBe('exec-abc123')
    expect(episode.planId).toBe('plan-1')
    expect(episode.outcome).toBe('SUCCESS')
  })

  it('episodeId is deterministic SHA-256 of executionId', async () => {
    const store = new NullMemoryStore()
    const recorder = new EpisodicRecorder(store)
    const e1 = await recorder.record(makeResult())
    const e2 = await recorder.record(makeResult())
    expect(e1.episodeId).toBe(e2.episodeId)
    expect(e1.episodeId).toHaveLength(64)
  })

  it('extracts skillsUsed from stepRecords', async () => {
    const store = new NullMemoryStore()
    const recorder = new EpisodicRecorder(store)
    const episode = await recorder.record(makeResult())
    expect(episode.skillsUsed).toEqual(['csv-reader', 'data-filter'])
  })

  it('records durationMs and retryCount from metrics', async () => {
    const store = new NullMemoryStore()
    const recorder = new EpisodicRecorder(store)
    const episode = await recorder.record(makeResult())
    expect(episode.durationMs).toBe(500)
    expect(episode.retryCount).toBe(1)
  })

  it('maps FAILED termination to FAILED outcome', async () => {
    const store = new NullMemoryStore()
    const recorder = new EpisodicRecorder(store)
    const episode = await recorder.record(makeResult({ termination: { reason: 'FAILED', message: 'oops' } }))
    expect(episode.outcome).toBe('FAILED')
  })
})
