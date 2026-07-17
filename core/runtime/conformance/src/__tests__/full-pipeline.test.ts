import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runFullPipelineScenario } from '../scenarios/full-pipeline.scenario.js'
import { runOrchestrationFallbackScenario } from '../scenarios/orchestration-fallback.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const fullPipelineScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'full-pipeline-001',
  name: 'Observation → Acquisition → Planner → Executor → Memory',
  tags: ['FULL_PIPELINE'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: { triggerEmitted: true, episodeRecorded: true }, createdAt: new Date().toISOString(),
}

const fallbackScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'orchestration-fallback-001',
  name: 'Primary provider fails → fallback completes',
  tags: ['ORCHESTRATION'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

describe('Full-pipeline scenario', () => {
  it('end-to-end chain produces episode', async () => {
    const validator = new RuntimeValidator()
    validator.register('full-pipeline-001', runFullPipelineScenario)
    const report = await validator.run(fullPipelineScenario)
    expect(report.status).toBe('PASSED')
  })
})

describe('Orchestration fallback scenario', () => {
  it('failing primary routes to fallback provider', async () => {
    const validator = new RuntimeValidator()
    validator.register('orchestration-fallback-001', runOrchestrationFallbackScenario)
    const report = await validator.run(fallbackScenario)
    expect(report.status).toBe('PASSED')
  })
})
