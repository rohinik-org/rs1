// packages/kernel/src/__tests__/router.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AiosRouter } from '../router.js'
import { MemoryTier } from '../tiers/memory.tier.js'
import { DeterministicTier } from '../tiers/deterministic.tier.js'
import { LocalToolTier } from '../tiers/local-tool.tier.js'
import { ExternalTier } from '../tiers/external.tier.js'
import { ReasoningTier } from '../tiers/reasoning.tier.js'
import { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import { DefaultExecutionResolver } from '../resolver.js'
import { ExecutionContextFactory } from '../context-factory.js'
import { DEFAULT_SYSTEM_CONFIG } from '../domain/config.js'
import { createRuntimeServices } from '../services/index.js'
import { SingleStepPlanner } from '../planner/single-step.planner.js'
import { ExecutionEngine } from '../engine/execution-engine.js'
import { ZERO_COST } from '../domain/cost.js'
import type { Capability } from '../interfaces/capability.js'
import type { Skill, SkillScore } from '../interfaces/skill.js'
import type { RoutingRequest } from '../domain/request.js'
import type { TierId } from '../interfaces/tier.js'

const services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
const factory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, services)

const makeRequest = (overrides: Partial<RoutingRequest> = {}): RoutingRequest => ({
  id: 'req-1',
  content: 'parse this CSV',
  contentType: 'TEXT',
  context: {},
  metadata: {},
  constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
  timestamp: new Date(),
  ...overrides,
})

const baseScore: SkillScore = {
  skillId: 'csv-skill',
  components: [{ id: 'confidence', value: 0.95, weight: 1.0 }],
  finalScore: 0.95,
}

const makeSkill = (id: string, tierId: TierId, matched = true): Skill => ({
  metadata: {
    skillId: id, name: id, tierId, version: '1.0.0',
    executionModel: 'DETERMINISTIC', requirements: {},
  },
  estimatedCost: () => ZERO_COST,
  evaluate: () => matched
    ? { matched: true, score: { ...baseScore, skillId: id } }
    : { matched: false },
  execute: async (_ctx, _providers) => ({
    status: 'SUCCESS', result: `output from ${id}`, skillId: id, stepId: 'step-1',
    diagnostics: [], metrics: { durationMs: 5, resourceCost: ZERO_COST, cacheHit: false },
    cacheable: false, retryable: false,
  }),
})

const makeCapability = (capId: string, tierId: TierId, skills: Skill[]): Capability => ({
  metadata: { capabilityId: capId, name: capId, tierId, version: '1.0.0', contractVersion: '1.0' },
  skills,
})

const makeRouter = (catalog: InMemoryCapabilityCatalog, resolver: DefaultExecutionResolver) => {
  const tiers = [
    new MemoryTier(catalog, resolver),
    new DeterministicTier(catalog, resolver),
    new LocalToolTier(catalog, resolver),
    new ExternalTier(catalog, resolver),
    new ReasoningTier(catalog, resolver),
  ]
  const planner = new SingleStepPlanner()
  const engine = new ExecutionEngine(catalog)
  return new AiosRouter(tiers, factory, planner, engine)
}

describe('AiosRouter', () => {
  let catalog: InMemoryCapabilityCatalog
  let resolver: DefaultExecutionResolver
  let router: AiosRouter

  beforeEach(() => {
    catalog = new InMemoryCapabilityCatalog()
    resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
    router = makeRouter(catalog, resolver)
  })

  it('returns no-match result when no skills registered', async () => {
    const result = await router.route(makeRequest())
    expect(result.requestId).toBe('req-1')
    expect(result.output).toBeUndefined()
    expect(result.skillId).toBe('')
    expect(result.reasoningInvoked).toBe(false)
    expect(result.confidence).toBe(0)
    expect(result.explanation).toBeTruthy()
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('routes to DETERMINISTIC tier when skill matches', async () => {
    catalog.register(makeCapability('cap-csv', 'DETERMINISTIC', [makeSkill('csv-skill', 'DETERMINISTIC')]))
    const result = await router.route(makeRequest())
    expect(result.skillId).toBe('csv-skill')
    expect(result.tierId).toBe('DETERMINISTIC')
    expect(result.output).toBe('output from csv-skill')
    expect(result.reasoningInvoked).toBe(false)
    expect(result.confidence).toBeCloseTo(0.95)
    const events = result.decisionTrace.events
    expect(events.filter(e => e.type === 'COMPLETED').length).toBe(1)
  })

  it('emits REQUEST_RECEIVED event in trace', async () => {
    const result = await router.route(makeRequest())
    const events = result.decisionTrace.events
    expect(events.some(e => e.type === 'REQUEST_RECEIVED' && e.contentType === 'TEXT')).toBe(true)
  })

  it('emits COMPLETED event in trace', async () => {
    const result = await router.route(makeRequest())
    const events = result.decisionTrace.events
    expect(events.some(e => e.type === 'COMPLETED')).toBe(true)
  })

  it('returns explanation string', async () => {
    catalog.register(makeCapability('cap-csv', 'DETERMINISTIC', [makeSkill('csv-skill', 'DETERMINISTIC')]))
    const result = await router.route(makeRequest())
    expect(typeof result.explanation).toBe('string')
    expect(result.explanation.length).toBeGreaterThan(0)
  })

  it('short-circuits at MEMORY tier if skill matches', async () => {
    catalog.register(makeCapability('cap-mem', 'MEMORY', [makeSkill('mem-skill', 'MEMORY')]))
    catalog.register(makeCapability('cap-det', 'DETERMINISTIC', [makeSkill('det-skill', 'DETERMINISTIC')]))
    const result = await router.route(makeRequest())
    expect(result.tierId).toBe('MEMORY')
    expect(result.skillId).toBe('mem-skill')
  })

  it('falls through to DETERMINISTIC when MEMORY has no match', async () => {
    catalog.register(makeCapability('cap-mem', 'MEMORY', [makeSkill('mem-skill', 'MEMORY', false)]))
    catalog.register(makeCapability('cap-det', 'DETERMINISTIC', [makeSkill('det-skill', 'DETERMINISTIC')]))
    const result = await router.route(makeRequest())
    expect(result.tierId).toBe('DETERMINISTIC')
    expect(result.skillId).toBe('det-skill')
  })

  it('calls beforeRoute and afterRoute hooks', async () => {
    const beforeFn = vi.fn()
    const afterFn = vi.fn()
    router.hooks.beforeRoute.push(beforeFn)
    router.hooks.afterRoute.push(afterFn)
    await router.route(makeRequest())
    expect(beforeFn).toHaveBeenCalledOnce()
    expect(afterFn).toHaveBeenCalledOnce()
  })

  it('calls beforeSkill and afterSkill hooks when skill executes', async () => {
    catalog.register(makeCapability('cap-det', 'DETERMINISTIC', [makeSkill('det-skill', 'DETERMINISTIC')]))
    const beforeSkillFn = vi.fn()
    const afterSkillFn = vi.fn()
    router.hooks.beforeSkill.push(beforeSkillFn)
    router.hooks.afterSkill.push(afterSkillFn)
    await router.route(makeRequest())
    expect(beforeSkillFn).toHaveBeenCalledOnce()
    expect(afterSkillFn).toHaveBeenCalledOnce()
  })

  it('calls onFailure hook when execution fails', async () => {
    const failingSkill: Skill = {
      ...makeSkill('fail-skill', 'DETERMINISTIC'),
      execute: async (_ctx, _providers) => ({
        status: 'FAILURE', result: undefined, skillId: 'fail-skill', stepId: 'step-1',
        diagnostics: [{ code: 'ERR', message: 'boom' }],
        metrics: { durationMs: 0, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    }
    catalog.register(makeCapability('cap-fail', 'DETERMINISTIC', [failingSkill]))
    const onFailureFn = vi.fn()
    router.hooks.onFailure.push(onFailureFn)
    await router.route(makeRequest())
    expect(onFailureFn).toHaveBeenCalledOnce()
  })

  it('returns reasoningInvoked: true when REASONING tier is used', async () => {
    const reasoningSkill: Skill = {
      metadata: {
        skillId: 'reasoning-skill', name: 'reasoning', tierId: 'REASONING',
        version: '1.0.0', executionModel: 'REASONING', requirements: {},
      },
      estimatedCost: () => ZERO_COST,
      evaluate: () => ({ matched: true, score: { skillId: 'reasoning-skill', components: [{ id: 'confidence', value: 0.8, weight: 1.0 }], finalScore: 0.8 } }),
      execute: async (_ctx, _providers) => ({
        status: 'SUCCESS', result: 'reasoning output', skillId: 'reasoning-skill', stepId: 's1',
        diagnostics: [], metrics: { durationMs: 200, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    }
    catalog.register(makeCapability('cap-reason', 'REASONING', [reasoningSkill]))
    const result = await router.route(makeRequest())
    expect(result.tierId).toBe('REASONING')
    expect(result.reasoningInvoked).toBe(true)
  })

  it('STRICT mode: REASONING tier disabled, returns no match', async () => {
    const reasoningSkill: Skill = {
      metadata: {
        skillId: 'r-skill', name: 'r', tierId: 'REASONING',
        version: '1.0.0', executionModel: 'REASONING', requirements: {},
      },
      estimatedCost: () => ZERO_COST,
      evaluate: () => ({ matched: true, score: { skillId: 'r-skill', components: [], finalScore: 0.9 } }),
      execute: async (_ctx, _providers) => ({ status: 'SUCCESS', result: 'x', skillId: 'r-skill', stepId: 's1', diagnostics: [], metrics: { durationMs: 0, resourceCost: ZERO_COST, cacheHit: false }, cacheable: false, retryable: false }),
    }
    catalog.register(makeCapability('cap-r', 'REASONING', [reasoningSkill]))
    const result = await router.route(makeRequest({
      constraints: { maxRetries: 1, allowReasoning: false, allowNetwork: true, allowDisk: true, mode: 'STRICT' },
    }))
    expect(result.output).toBeUndefined()
    expect(result.skillId).toBe('')
  })
})
