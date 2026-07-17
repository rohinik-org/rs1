import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runObservationTriggerScenario } from '../scenarios/observation-trigger.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 0, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const observationScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'observation-trigger-001',
  name: 'Deprecated package emits LearningTrigger',
  tags: ['OBSERVATION'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: { triggerEmitted: true }, createdAt: new Date().toISOString(),
}

describe('Observation → LearningTrigger scenario', () => {
  it('deprecated npm package triggers learning', async () => {
    const validator = new RuntimeValidator()
    validator.register('observation-trigger-001', runObservationTriggerScenario)
    const report = await validator.run(observationScenario)
    expect(report.status).toBe('PASSED')
  })
})
