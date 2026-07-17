import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runMemoryScenario } from '../scenarios/memory.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const memoryScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'memory-001', name: 'Episode stored after execution',
  tags: ['MEMORY'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: { episodeRecorded: true }, createdAt: new Date().toISOString(),
}

describe('Memory scenario', () => {
  it('episode recorded after execution', async () => {
    const validator = new RuntimeValidator()
    validator.register('memory-001', runMemoryScenario)
    const report = await validator.run(memoryScenario)
    expect(report.status).toBe('PASSED')
  })
})
