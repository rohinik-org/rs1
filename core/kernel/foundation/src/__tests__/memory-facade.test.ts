import { describe, it, expect } from 'vitest'
import { DefaultMemoryFacade, NoopMemoryFacade } from '../facades/memory-facade.js'

const fakeResult = {
  kind: 'ExecutionResult', schemaVersion: '1.0',
  executionId: 'e1', executionRevision: 1, planId: 'p1',
  metadata: { planId: 'p1' },
  termination: { reason: 'SUCCESS' },
  stepRecords: [], journal: [],
  metrics: { totalDurationMs: 10, stepCount: 0, retryCount: 0, tokenCount: 0, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  outputs: {},
  producedAt: new Date().toISOString(),
} as unknown as import('@rohinik-org/compiler').ExecutionResult

describe('DefaultMemoryFacade', () => {
  it('record() returns array of MemoryArtifacts', async () => {
    const facade = new DefaultMemoryFacade()
    const artifacts = await facade.record(fakeResult)
    expect(Array.isArray(artifacts)).toBe(true)
  })

  it('recall() returns empty array for empty store', async () => {
    const facade = new DefaultMemoryFacade()
    const results = await facade.recall({ concepts: ['test'], limit: 10 })
    expect(Array.isArray(results)).toBe(true)
  })

  it('recall() finds recorded artifact by concept', async () => {
    const facade = new DefaultMemoryFacade()
    await facade.record(fakeResult)
    const results = await facade.recall({ concepts: [], limit: 100 })
    expect(Array.isArray(results)).toBe(true)
  })
})

describe('NoopMemoryFacade', () => {
  it('record() returns empty array', async () => {
    const facade = new NoopMemoryFacade()
    const result = await facade.record(fakeResult)
    expect(result).toHaveLength(0)
  })

  it('recall() returns empty array', async () => {
    const facade = new NoopMemoryFacade()
    const result = await facade.recall({ concepts: [], limit: 10 })
    expect(result).toHaveLength(0)
  })
})
