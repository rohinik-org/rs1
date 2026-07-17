import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runAcquisitionScenario } from '../scenarios/acquisition.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 0, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const acquisitionScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'acquisition-001',
  name: 'LearningTrigger → CapabilityAcquisitionEngine',
  tags: ['ACQUISITION'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

describe('Acquisition scenario', () => {
  it('acquisition engine processes LearningTrigger', async () => {
    const validator = new RuntimeValidator()
    validator.register('acquisition-001', runAcquisitionScenario)
    const report = await validator.run(acquisitionScenario)
    expect(report.status).toBe('PASSED')
  })
})
