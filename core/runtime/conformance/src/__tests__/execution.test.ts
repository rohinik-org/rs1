import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runExecutionScenario } from '../scenarios/execution.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const executionScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'execution-001', name: 'Execute workflow',
  tags: ['EXECUTION'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

describe('Execution scenario', () => {
  it('execution produces SUCCESS result', async () => {
    const validator = new RuntimeValidator()
    validator.register('execution-001', runExecutionScenario)
    const report = await validator.run(executionScenario)
    expect(report.status).toBe('PASSED')
  })
})
