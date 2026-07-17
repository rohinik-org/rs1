import { describe, it, expect } from 'vitest'
import { MemoryEngine } from '../engine/memory-engine.js'
import { NullMemoryStore } from '../store/null-memory-store.js'
import { DEFAULT_MEMORY_POLICY } from '@rohinik-org/compiler'
import type { ExecutionResult } from '@rohinik-org/compiler'

function makeResult(outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED' = 'SUCCESS', concepts: string[] = []): ExecutionResult {
  return {
    kind: 'ExecutionResult',
    schemaVersion: '1.0',
    executionId: `exec-${Math.random().toString(36).slice(2)}`,
    executionRevision: 1,
    planId: 'plan-1',
    metadata: { planId: 'plan-1', triggeredBy: 'test' },
    termination: { reason: outcome },
    stepRecords: [{ stepId: 's1', position: 0, skillId: 'csv-reader', state: 'COMPLETED', attempts: 1, providerUsed: 'node' }],
    journal: [],
    metrics: {
      totalDurationMs: 100,
      stepDurations: {},
      retryCount: 0,
      providerLatencyMs: {},
      estimatedCostUsd: 0,
      tokensUsed: 0,
    },
    outputs: {},
    producedAt: new Date().toISOString(),
  } as ExecutionResult
}

describe('MemoryEngine integration', () => {
  it('record + recall round-trip returns the episode', async () => {
    const store = new NullMemoryStore()
    const engine = new MemoryEngine(store, DEFAULT_MEMORY_POLICY)
    await engine.record(makeResult('SUCCESS'))
    const results = await engine.recall({})
    expect(results.length).toBeGreaterThan(0)
  })

  it('policy blocks semantic when semanticEnabled is false', async () => {
    const store = new NullMemoryStore()
    const engine = new MemoryEngine(store, { ...DEFAULT_MEMORY_POLICY, semanticEnabled: false })
    await engine.record(makeResult())
    const results = await engine.recall({ kinds: ['SEMANTIC_FACT'] })
    expect(results.filter(r => r.artifact.artifactKind === 'SEMANTIC_FACT')).toHaveLength(0)
  })

  it('failed execution still creates episode', async () => {
    const store = new NullMemoryStore()
    const engine = new MemoryEngine(store, DEFAULT_MEMORY_POLICY)
    await engine.record(makeResult('FAILED'))
    const results = await engine.recall({ kinds: ['EPISODE'] })
    expect(results.length).toBeGreaterThan(0)
    const outcome = (results[0]!.artifact.content as Record<string, unknown>).outcome
    expect(outcome).toBe('FAILED')
  })

  it('recall returns empty for unknown concepts (no artifacts)', async () => {
    const store = new NullMemoryStore()
    const engine = new MemoryEngine(store, DEFAULT_MEMORY_POLICY)
    const results = await engine.recall({ concepts: ['completely-unknown-xyz'] })
    expect(results).toHaveLength(0)
  })

  it('importanceScore starts at 1 on fresh record', async () => {
    const store = new NullMemoryStore()
    const engine = new MemoryEngine(store, DEFAULT_MEMORY_POLICY)
    await engine.record(makeResult())
    const results = await engine.recall({})
    expect(results[0]!.artifact.importanceScore).toBe(1.0)
  })
})
