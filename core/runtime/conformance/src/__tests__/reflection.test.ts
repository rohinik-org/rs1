import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runReflectionScenario } from '../scenarios/reflection.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const reflectionScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'reflection-001',
  name: 'Execute goal then reflect on result → REJECTED (no failures)',
  tags: ['MEMORY'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: { episodeRecorded: true }, createdAt: new Date().toISOString(),
}

describe('Reflection scenario', () => {
  it('execute → reflect produces ReflectionReport persisted in store', async () => {
    const validator = new RuntimeValidator()
    validator.register('reflection-001', runReflectionScenario)
    const report = await validator.run(reflectionScenario)
    expect(report.status).toBe('PASSED')
  })

  it('reflection engine does not throw on clean execution', async () => {
    const emptyLoaded = { fixture: emptyFixture, loadedAt: new Date().toISOString() }
    const result = await runReflectionScenario(emptyLoaded as any, { episodeRecorded: true })
    expect(typeof result.reflectionReportStatus).toBe('string')
  })
})
