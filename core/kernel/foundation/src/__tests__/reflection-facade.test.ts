import { describe, it, expect } from 'vitest'
import { DefaultReflectionFacade, NoopReflectionFacade } from '../facades/reflection-facade.js'

const fakeResult = {
  kind: 'ExecutionResult', schemaVersion: '1.0',
  executionId: 'e1', executionRevision: 1, planId: 'p1',
  metadata: { planId: 'p1' },
  termination: { reason: 'SUCCESS' },
  stepRecords: [], journal: [],
  metrics: { totalDurationMs: 10, stepCount: 0, retryCount: 0, tokenCount: 0, providerLatencyMs: {}, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  outputs: {},
  producedAt: new Date().toISOString(),
} as unknown as import('@rohinik-org/compiler').ExecutionResult

describe('DefaultReflectionFacade', () => {
  it('reflect() returns a ReflectionReport', async () => {
    const facade = new DefaultReflectionFacade()
    const report = await facade.reflect(fakeResult)
    expect(report.kind).toBe('ReflectionReport')
  })

  it('report has rootCause', async () => {
    const facade = new DefaultReflectionFacade()
    const report = await facade.reflect(fakeResult)
    expect(report.rootCause).toBeDefined()
    expect(report.rootCause.causeId).toBeDefined()
  })

  it('report has status field', async () => {
    const facade = new DefaultReflectionFacade()
    const report = await facade.reflect(fakeResult)
    expect(['APPROVED', 'DEFERRED', 'REJECTED']).toContain(report.status)
  })

  it('reflect() does not throw', async () => {
    const facade = new DefaultReflectionFacade()
    await expect(facade.reflect(fakeResult)).resolves.toBeDefined()
  })
})

describe('NoopReflectionFacade', () => {
  it('returns report without throwing', async () => {
    const facade = new NoopReflectionFacade()
    const report = await facade.reflect(fakeResult)
    expect(report.kind).toBe('ReflectionReport')
    expect(report.status).toBe('REJECTED')
  })
})
