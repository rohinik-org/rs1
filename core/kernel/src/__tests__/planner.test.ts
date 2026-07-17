import { describe, it, expect } from 'vitest'
import { SingleStepPlanner } from '../planner/single-step.planner.js'
import { ExecutionContextFactory } from '../context-factory.js'
import { DEFAULT_SYSTEM_CONFIG } from '../domain/config.js'
import { createRuntimeServices } from '../services/index.js'
import { ZERO_COST } from '../domain/cost.js'
import type { SelectedSkill } from '../domain/selected-skill.js'
import type { Skill } from '../interfaces/skill.js'

const services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
const factory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, services)
const planner = new SingleStepPlanner()

const makeCtx = () => factory.create({
  id: 'req-1', content: 'parse csv', contentType: 'CSV',
  context: {}, metadata: {},
  constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
  timestamp: new Date(),
})

const stubSkill: Skill = {
  metadata: { skillId: 'csv', name: 'CSV Skill', tierId: 'DETERMINISTIC', version: '1.0.0', executionModel: 'DETERMINISTIC', requirements: {} },
  estimatedCost: () => ZERO_COST,
  evaluate: () => ({ matched: true, score: { skillId: 'csv', components: [{ id: 'confidence', value: 0.9, weight: 1.0 }], finalScore: 0.9 } }),
  execute: async () => ({ status: 'SUCCESS', result: undefined, skillId: 'csv', stepId: 'x', diagnostics: [], metrics: { durationMs: 0, resourceCost: ZERO_COST, cacheHit: false }, cacheable: false, retryable: false }),
}

const makeSelected = (): SelectedSkill => ({
  skill: stubSkill,
  score: { skillId: 'csv', components: [{ id: 'confidence', value: 0.9, weight: 1.0 }], finalScore: 0.9 },
  resolvedProviders: {},
  estimatedCost: ZERO_COST,
  tierId: 'DETERMINISTIC',
})

describe('SingleStepPlanner', () => {
  it('creates a plan with exactly one step', async () => {
    const plan = await planner.createPlan(makeSelected(), makeCtx())
    expect(plan.steps).toHaveLength(1)
  })

  it('step copies skillId, tierId, resolvedProviders, estimatedCost, score from SelectedSkill', async () => {
    const selected = makeSelected()
    const plan = await planner.createPlan(selected, makeCtx())
    const step = plan.steps[0]!
    expect(step.skillId).toBe('csv')
    expect(step.tierId).toBe('DETERMINISTIC')
    expect(step.resolvedProviders).toBe(selected.resolvedProviders)
    expect(step.estimatedCost).toBe(selected.estimatedCost)
    expect(step.score).toBe(selected.score)
  })

  it('step has inputs: [{ source: REQUEST }]', async () => {
    const plan = await planner.createPlan(makeSelected(), makeCtx())
    expect(plan.steps[0]?.inputs).toEqual([{ source: 'REQUEST' }])
  })

  it('step has empty dependsOn', async () => {
    const plan = await planner.createPlan(makeSelected(), makeCtx())
    expect(plan.steps[0]?.dependsOn).toEqual([])
  })

  it('plan requestId matches context request id', async () => {
    const plan = await planner.createPlan(makeSelected(), makeCtx())
    expect(plan.requestId).toBe('req-1')
  })

  it('plan is frozen (immutable)', async () => {
    const plan = await planner.createPlan(makeSelected(), makeCtx())
    expect(() => (plan as any).steps.push('x')).toThrow()
  })
})
