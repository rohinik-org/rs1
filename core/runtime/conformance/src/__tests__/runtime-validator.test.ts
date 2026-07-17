import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 0, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const makeScenario = (overrides: Partial<RuntimeScenario> = {}): RuntimeScenario => ({
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 's1', name: 'test',
  tags: ['PLANNING'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
  ...overrides,
})

describe('RuntimeValidator', () => {
  it('returns a report', async () => {
    const report = await new RuntimeValidator().run(makeScenario())
    expect(report.kind).toBe('RuntimeValidationReport')
  })

  it('status PASSED for empty expectation', async () => {
    const report = await new RuntimeValidator().run(makeScenario())
    expect(report.status).toBe('PASSED')
  })

  it('benchmark executionMs >= 0', async () => {
    const report = await new RuntimeValidator().run(makeScenario())
    expect(report.benchmark.executionMs).toBeGreaterThanOrEqual(0)
  })

  it('LIVE scenario blocked when policy disallows', async () => {
    const report = await new RuntimeValidator().run(makeScenario({ scenarioType: 'LIVE' }))
    expect(report.status).toBe('FAILED')
    expect(report.findings[0]?.message).toContain('LIVE')
  })
})
