import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runAutonomyLoopScenario } from '../scenarios/autonomy-loop.scenario.js'
import { runAutonomyTriggerScenario } from '../scenarios/autonomy-trigger.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const loopScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'autonomy-loop-001',
  name: 'LoopEngine executes pre-seeded USER goal and records episode',
  tags: ['AUTONOMY'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: { goalsCompleted: 1, episodeRecorded: true }, createdAt: new Date().toISOString(),
}

const triggerScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'autonomy-trigger-001',
  name: 'LearningTrigger → TriggerRouter → LoopEngine → episode',
  tags: ['AUTONOMY', 'FULL_PIPELINE'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: { triggerRouted: true, episodeRecorded: true }, createdAt: new Date().toISOString(),
}

describe('Autonomy loop scenario', () => {
  it('pre-seeded USER goal completes and records episode', async () => {
    const validator = new RuntimeValidator()
    validator.register('autonomy-loop-001', runAutonomyLoopScenario)
    const report = await validator.run(loopScenario)
    expect(report.status).toBe('PASSED')
  })
})

describe('Autonomy trigger scenario', () => {
  it('LearningTrigger routes through LoopEngine and produces episode', async () => {
    const validator = new RuntimeValidator()
    validator.register('autonomy-trigger-001', runAutonomyTriggerScenario)
    const report = await validator.run(triggerScenario)
    expect(report.status).toBe('PASSED')
  })
})
