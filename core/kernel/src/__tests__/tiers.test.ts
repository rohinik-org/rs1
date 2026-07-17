// packages/kernel/src/__tests__/tiers.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { BaseTier } from '../tiers/base.tier.js'
import { MemoryTier } from '../tiers/memory.tier.js'
import { DeterministicTier } from '../tiers/deterministic.tier.js'
import { LocalToolTier } from '../tiers/local-tool.tier.js'
import { ExternalTier } from '../tiers/external.tier.js'
import { ReasoningTier } from '../tiers/reasoning.tier.js'
import type { TierId } from '../interfaces/tier.js'
import type { SelectedSkill } from '../domain/selected-skill.js'
import type { ExecutionContext } from '../domain/context.js'
import { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import { DefaultExecutionResolver } from '../resolver.js'
import { ExecutionContextFactory } from '../context-factory.js'
import { DEFAULT_SYSTEM_CONFIG } from '../domain/config.js'
import { createRuntimeServices } from '../services/index.js'
import { ZERO_COST } from '../domain/cost.js'
import type { Capability } from '../interfaces/capability.js'
import type { Skill, SkillScore } from '../interfaces/skill.js'
import type { ExecutionBudget } from '../domain/request.js'

// ---- Test helpers ----

const services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
const factory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, services)

const makeCtx = (overrides: Partial<ExecutionBudget> = {}): ExecutionContext =>
  factory.create({
    id: 'req-1', content: 'test', contentType: 'TEXT',
    context: {}, metadata: {},
    constraints: {
      maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED',
      ...overrides,
    },
    timestamp: new Date(),
  })

const baseScore: SkillScore = {
  skillId: 'skill-a',
  components: [{ id: 'confidence', value: 0.9, weight: 1.0 }],
  finalScore: 0.9,
}

const makeSkill = (id: string, tierId: TierId, matched = true, score = baseScore): Skill => ({
  metadata: {
    skillId: id,
    name: id,
    tierId,
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
  },
  estimatedCost: () => ZERO_COST,
  evaluate: () => matched ? { matched: true, score: { ...score, skillId: id } } : { matched: false },
  execute: async () => ({
    status: 'SUCCESS', result: 'ok', skillId: id, stepId: 'step-1',
    diagnostics: [], metrics: { durationMs: 10, resourceCost: ZERO_COST, cacheHit: false },
    cacheable: false, retryable: false,
  }),
})

const makeCapability = (capId: string, tierId: TierId, skills: Skill[]): Capability => ({
  metadata: { capabilityId: capId, name: capId, tierId, version: '1.0.0', contractVersion: '1.0' },
  skills,
})

// Concrete test tier — DeterministicTier behavior
class TestTier extends BaseTier {
  readonly tierId: TierId = 'DETERMINISTIC'
}

// ---- Tests ----

describe('BaseTier', () => {
  let catalog: InMemoryCapabilityCatalog
  let resolver: DefaultExecutionResolver
  let tier: TestTier

  beforeEach(() => {
    catalog = new InMemoryCapabilityCatalog()
    resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
    tier = new TestTier(catalog, resolver)
  })

  it('returns undefined when no capabilities registered for tier', async () => {
    const result = await tier.evaluate(makeCtx())
    expect(result).toBeUndefined()
  })

  it('returns undefined when tier is not in allowedTiers (STRICT mode blocks REASONING)', async () => {
    class ReasoningTestTier extends BaseTier { readonly tierId: TierId = 'REASONING' }
    const reasoningTier = new ReasoningTestTier(catalog, resolver)
    catalog.register(makeCapability('cap-r', 'REASONING', [makeSkill('r-skill', 'REASONING')]))
    const ctx = makeCtx({ mode: 'STRICT' })
    const result = await reasoningTier.evaluate(ctx)
    expect(result).toBeUndefined()
    const events = ctx.traceBuilder.build().events
    expect(events.some(e => e.type === 'SKILL_REJECTED' && e.reason === 'TIER_DISABLED')).toBe(true)
  })

  it('selects the single matching skill', async () => {
    catalog.register(makeCapability('cap-a', 'DETERMINISTIC', [makeSkill('skill-a', 'DETERMINISTIC')]))
    const ctx = makeCtx()
    const result = await tier.evaluate(ctx)
    expect(result).toBeDefined()
    expect(result!.skill.metadata.skillId).toBe('skill-a')
    expect(result!.tierId).toBe('DETERMINISTIC')
  })

  it('returns undefined when skill evaluate returns matched: false', async () => {
    catalog.register(makeCapability('cap-a', 'DETERMINISTIC', [makeSkill('skill-a', 'DETERMINISTIC', false)]))
    const ctx = makeCtx()
    const result = await tier.evaluate(ctx)
    expect(result).toBeUndefined()
  })

  it('picks highest-score winner when multiple skills match', async () => {
    const lowScore: SkillScore = { skillId: 'low', components: [{ id: 'confidence', value: 0.5, weight: 1.0 }], finalScore: 0.5 }
    const highScore: SkillScore = { skillId: 'high', components: [{ id: 'confidence', value: 0.9, weight: 1.0 }], finalScore: 0.9 }
    catalog.register(makeCapability('cap-a', 'DETERMINISTIC', [
      makeSkill('low-skill', 'DETERMINISTIC', true, lowScore),
      makeSkill('high-skill', 'DETERMINISTIC', true, highScore),
    ]))
    const ctx = makeCtx()
    const result = await tier.evaluate(ctx)
    expect(result!.skill.metadata.skillId).toBe('high-skill')
  })

  it('emits TIER_STARTED and SKILL_SCORED and SKILL_SELECTED events', async () => {
    catalog.register(makeCapability('cap-a', 'DETERMINISTIC', [makeSkill('skill-a', 'DETERMINISTIC')]))
    const ctx = makeCtx()
    await tier.evaluate(ctx)
    const events = ctx.traceBuilder.build().events
    expect(events.some(e => e.type === 'TIER_STARTED' && e.tierId === 'DETERMINISTIC')).toBe(true)
    expect(events.some(e => e.type === 'SKILL_SCORED' && e.skillId === 'skill-a')).toBe(true)
    expect(events.some(e => e.type === 'SKILL_SELECTED' && e.skillId === 'skill-a')).toBe(true)
  })

  it('emits SKILL_REJECTED EXECUTION_MODEL_FORBIDDEN for REASONING skill in STRICT mode', async () => {
    const reasoningSkill: Skill = {
      ...makeSkill('r-skill', 'DETERMINISTIC'),
      metadata: { ...makeSkill('r-skill', 'DETERMINISTIC').metadata, executionModel: 'REASONING' },
    }
    catalog.register(makeCapability('cap-r', 'DETERMINISTIC', [reasoningSkill]))
    const ctx = makeCtx({ mode: 'STRICT' })
    const result = await tier.evaluate(ctx)
    expect(result).toBeUndefined()
    const events = ctx.traceBuilder.build().events
    expect(events.some(e =>
      e.type === 'SKILL_REJECTED' && e.reason === 'EXECUTION_MODEL_FORBIDDEN' && e.skillId === 'r-skill'
    )).toBe(true)
  })

  it('emits SKILL_REJECTED PROVIDER_UNAVAILABLE when resolver cannot resolve', async () => {
    const needsReasoningEngine: Skill = {
      ...makeSkill('llm-skill', 'DETERMINISTIC'),
      metadata: {
        ...makeSkill('llm-skill', 'DETERMINISTIC').metadata,
        requirements: { providerCapabilities: { reasoningEngine: { reasoning: true } } },
      },
    }
    catalog.register(makeCapability('cap-llm', 'DETERMINISTIC', [needsReasoningEngine]))
    const ctx = makeCtx()
    const result = await tier.evaluate(ctx)
    expect(result).toBeUndefined()
    const events = ctx.traceBuilder.build().events
    expect(events.some(e =>
      e.type === 'SKILL_REJECTED' && e.reason === 'PROVIDER_UNAVAILABLE' && e.skillId === 'llm-skill'
    )).toBe(true)
  })

  it('emits PROVIDER_RESOLVED event when skill has provider requirements and resolution succeeds', async () => {
    const needsReasoningEngine: Skill = {
      ...makeSkill('llm-skill', 'DETERMINISTIC'),
      metadata: {
        ...makeSkill('llm-skill', 'DETERMINISTIC').metadata,
        requirements: { providerCapabilities: { reasoningEngine: { reasoning: true } } },
      },
    }
    catalog.register(makeCapability('cap-llm', 'DETERMINISTIC', [needsReasoningEngine]))
    // Register a reasoning provider so resolution succeeds
    resolver.registerProvider({
      metadata: { providerId: 'claude', name: 'Claude', environments: ['NETWORK'], capabilities: ['REASONING_ENGINE'], version: '1.0.0' },
      isAvailable: async () => true,
      health: async () => ({ status: 'HEALTHY' }),
    })
    const ctx = makeCtx()
    await tier.evaluate(ctx)
    const events = ctx.traceBuilder.build().events
    expect(events.some(e =>
      e.type === 'PROVIDER_RESOLVED' && e.requirementKey === 'reasoningEngine' && e.skillId === 'llm-skill'
    )).toBe(true)
  })

  it('emits SKILL_REJECTED HEALTH_CHECK_FAILED and skips capability when unhealthy', async () => {
    catalog.register(makeCapability('unhealthy-cap', 'DETERMINISTIC', [makeSkill('skill-a', 'DETERMINISTIC')]))
    const originalIsHealthy = catalog.isHealthy.bind(catalog)
    catalog.isHealthy = (id: string) => id === 'unhealthy-cap' ? false : originalIsHealthy(id)
    const ctx = makeCtx()
    const result = await tier.evaluate(ctx)
    expect(result).toBeUndefined()
    const events = ctx.traceBuilder.build().events
    expect(events.some(e =>
      e.type === 'SKILL_REJECTED' && e.reason === 'HEALTH_CHECK_FAILED' && e.skillId === 'skill-a'
    )).toBe(true)
  })

  it('skips health check when skipHealthChecks is true (FAST mode)', async () => {
    catalog.register(makeCapability('unhealthy-cap', 'DETERMINISTIC', [makeSkill('skill-a', 'DETERMINISTIC')]))
    catalog.isHealthy = () => false  // would fail if health checked
    const ctx = makeCtx({ mode: 'FAST' })
    const result = await tier.evaluate(ctx)
    expect(result).toBeDefined()
    expect(result!.skill.metadata.skillId).toBe('skill-a')
  })
})

describe('Concrete Tiers', () => {
  let catalog: InMemoryCapabilityCatalog
  let resolver: DefaultExecutionResolver

  beforeEach(() => {
    catalog = new InMemoryCapabilityCatalog()
    resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
  })

  it('MemoryTier has tierId MEMORY', () => {
    const tier = new MemoryTier(catalog, resolver)
    expect(tier.tierId).toBe('MEMORY')
  })

  it('DeterministicTier has tierId DETERMINISTIC', () => {
    const tier = new DeterministicTier(catalog, resolver)
    expect(tier.tierId).toBe('DETERMINISTIC')
  })

  it('LocalToolTier has tierId LOCAL_TOOL', () => {
    const tier = new LocalToolTier(catalog, resolver)
    expect(tier.tierId).toBe('LOCAL_TOOL')
  })

  it('ExternalTier has tierId EXTERNAL', () => {
    const tier = new ExternalTier(catalog, resolver)
    expect(tier.tierId).toBe('EXTERNAL')
  })

  it('ReasoningTier has tierId REASONING', () => {
    const tier = new ReasoningTier(catalog, resolver)
    expect(tier.tierId).toBe('REASONING')
  })

  it('ReasoningTier uses LOWEST_COST provider policy', async () => {
    const tier = new ReasoningTier(catalog, resolver)
    const reasoningSkill: Skill = {
      metadata: {
        skillId: 'r-skill', name: 'r-skill', tierId: 'REASONING',
        version: '1.0.0', executionModel: 'REASONING',
        requirements: { providerCapabilities: { reasoningEngine: { reasoning: true } } },
      },
      estimatedCost: () => ZERO_COST,
      evaluate: () => ({ matched: true, score: { skillId: 'r-skill', components: [{ id: 'confidence', value: 0.8, weight: 1.0 }], finalScore: 0.8 } }),
      execute: async () => ({ status: 'SUCCESS', result: 'ok', skillId: 'r-skill', stepId: 's1', diagnostics: [], metrics: { durationMs: 0, resourceCost: ZERO_COST, cacheHit: false }, cacheable: false, retryable: false }),
    }
    catalog.register(makeCapability('cap-r', 'REASONING', [reasoningSkill]))
    resolver.registerProvider({
      metadata: { providerId: 'claude', name: 'Claude', environments: ['NETWORK'], capabilities: ['REASONING_ENGINE'], version: '1.0.0' },
      isAvailable: async () => true,
      health: async () => ({ status: 'HEALTHY' }),
    })
    const ctx = makeCtx()
    await tier.evaluate(ctx)
    const events = ctx.traceBuilder.build().events
    const resolvedEvent = events.find(e => e.type === 'PROVIDER_RESOLVED')
    expect(resolvedEvent).toBeDefined()
    expect(resolvedEvent!.resolution.policy).toBe('LOWEST_COST')
  })

  it('DeterministicTier selects skill from DETERMINISTIC tier', async () => {
    const tier = new DeterministicTier(catalog, resolver)
    catalog.register(makeCapability('cap-det', 'DETERMINISTIC', [makeSkill('det-skill', 'DETERMINISTIC')]))
    const ctx = makeCtx()
    const result = await tier.evaluate(ctx)
    expect(result).toBeDefined()
    expect(result!.tierId).toBe('DETERMINISTIC')
    expect(result!.skill.metadata.skillId).toBe('det-skill')
  })

  it('DeterministicTier does not select skills from other tiers', async () => {
    const tier = new DeterministicTier(catalog, resolver)
    catalog.register(makeCapability('cap-mem', 'MEMORY', [makeSkill('mem-skill', 'MEMORY')]))
    const ctx = makeCtx()
    const result = await tier.evaluate(ctx)
    expect(result).toBeUndefined()
  })
})
