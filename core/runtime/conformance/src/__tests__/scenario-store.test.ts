import { describe, it, expect } from 'vitest'
import { NullScenarioStore, InMemoryScenarioStore } from '../store/scenario-store.js'
import type { RuntimeScenario, RuntimeValidationReport } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 0, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const scenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 's1', name: 'test',
  tags: ['PLANNING'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

const report: RuntimeValidationReport = {
  kind: 'RuntimeValidationReport', schemaVersion: '1.0', reportId: 'r1', scenarioId: 's1',
  startedAt: '', completedAt: '', status: 'PASSED',
  benchmark: { baselineMs: 0, executionMs: 0, memoryMb: 0, cpuMs: 0, providerCalls: 0, networkRequests: 0, tokenCount: 0 },
  findings: [],
}

describe('NullScenarioStore', () => {
  it('returns empty list', async () => {
    expect(await new NullScenarioStore().list()).toHaveLength(0)
  })
})

describe('InMemoryScenarioStore', () => {
  it('save + load round-trip', async () => {
    const store = new InMemoryScenarioStore()
    await store.save(scenario)
    expect(await store.load('s1')).toBe(scenario)
  })

  it('list by tag', async () => {
    const store = new InMemoryScenarioStore()
    await store.save(scenario)
    expect(await store.list('PLANNING')).toHaveLength(1)
    expect(await store.list('EXECUTION')).toHaveLength(0)
  })

  it('saveReport + loadReport round-trip', async () => {
    const store = new InMemoryScenarioStore()
    await store.saveReport(report)
    expect(await store.loadReport('r1')).toBe(report)
  })
})
