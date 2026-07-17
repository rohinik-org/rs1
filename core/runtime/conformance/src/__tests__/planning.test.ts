import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runPlanningScenario } from '../scenarios/planning.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const planningScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'planning-001', name: 'Build plan from intent',
  tags: ['PLANNING'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

describe('Planning scenario', () => {
  it('produces a WorkflowPlan', async () => {
    const validator = new RuntimeValidator()
    validator.register('planning-001', runPlanningScenario)
    const report = await validator.run(planningScenario)
    expect(report.status).toBe('PASSED')
  })
})
