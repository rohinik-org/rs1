import { describe, it, expect, beforeEach } from 'vitest'
import { BudgetEnforcer } from '../engine/budget-enforcer.js'
import { StepExecutor } from '../engine/step-executor.js'
import { TimeoutExecutor } from '../engine/timeout-executor.js'
import { RetryExecutor } from '../engine/retry-executor.js'
import { FallbackExecutor } from '../engine/fallback-executor.js'
import { ExecutionEngine } from '../engine/execution-engine.js'
import { InMemoryMetricsCollector } from '../services/metrics.js'
import { InMemoryCapabilityCatalog as CatalogImpl } from '../registry/catalog.js'
import type { Capability } from '../interfaces/capability.js'
import { ExecutionContextFactory } from '../context-factory.js'
import { DEFAULT_SYSTEM_CONFIG } from '../domain/config.js'
import { createRuntimeServices } from '../services/index.js'
import { ZERO_COST } from '../domain/cost.js'
import type { ExecutionStep, ExecutionPlan } from '../domain/plan.js'
import type { SkillScore } from '../interfaces/skill.js'
import type { Skill } from '../interfaces/skill.js'

const services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
const factory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, services)

const makeCtx = (overrides: Partial<import('../domain/request.js').ExecutionBudget> = {}) =>
  factory.create({
    id: 'req-1', content: 'test', contentType: 'TEXT',
    context: {}, metadata: {},
    constraints: {
      maxRetries: 3,
      allowReasoning: true,
      allowNetwork: true,
      allowDisk: true,
      mode: 'BALANCED',
      ...overrides,
    },
    timestamp: new Date(),
  })

const baseScore: SkillScore = {
  skillId: 'csv',
  components: [{ id: 'confidence', value: 0.9, weight: 1.0 }],
  finalScore: 0.9,
}

const makeStep = (overrides: Partial<ExecutionStep> = {}): ExecutionStep => ({
  stepId: 'step-1',
  skillId: 'csv',
  tierId: 'DETERMINISTIC',
  inputs: [{ source: 'REQUEST' }],
  executionPolicy: 'BEST_SCORE',
  timeoutMs: 30_000,
  retryPolicy: { maxAttempts: 3, retryableStatuses: ['FAILURE', 'TIMEOUT'] },
  resolvedProviders: {},
  estimatedCost: ZERO_COST,
  score: baseScore,
  dependsOn: [],
  constraints: {},
  ...overrides,
})

describe('BudgetEnforcer', () => {
  let enforcer: BudgetEnforcer

  beforeEach(() => {
    enforcer = new BudgetEnforcer()
  })

  it('passes when no budget limits set', () => {
    const result = enforcer.check(makeStep(), makeCtx())
    expect(result).toBeNull()
  })

  it('blocks REASONING step when allowReasoning is false', () => {
    const step = makeStep({ tierId: 'REASONING' })
    const ctx = makeCtx({ allowReasoning: false })
    const result = enforcer.check(step, ctx)
    expect(result).not.toBeNull()
    expect(result?.status).toBe('BUDGET_EXCEEDED')
    expect(result?.skillId).toBe('csv')
    expect(result?.stepId).toBe('step-1')
  })

  it('blocks step when estimated cost exceeds maxCostUsd', () => {
    const step = makeStep({
      estimatedCost: { estimated: { usd: 0.50 } },
    })
    const ctx = makeCtx({ maxCostUsd: 0.10 })
    const result = enforcer.check(step, ctx)
    expect(result?.status).toBe('BUDGET_EXCEEDED')
  })

  it('blocks step when estimated tokens exceed maxTokens', () => {
    const step = makeStep({
      estimatedCost: { estimated: { tokens: 5000 } },
    })
    const ctx = makeCtx({ maxTokens: 1000 })
    const result = enforcer.check(step, ctx)
    expect(result?.status).toBe('BUDGET_EXCEEDED')
  })

  it('passes when cost is within budget', () => {
    const step = makeStep({
      estimatedCost: { estimated: { usd: 0.05 } },
    })
    const ctx = makeCtx({ maxCostUsd: 0.10 })
    expect(enforcer.check(step, ctx)).toBeNull()
  })

  it('passes when REASONING step and allowReasoning is true', () => {
    const step = makeStep({ tierId: 'REASONING' })
    const ctx = makeCtx({ allowReasoning: true })
    expect(enforcer.check(step, ctx)).toBeNull()
  })
})

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
  metadata: {
    skillId: 'csv',
    name: 'CSV Skill',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
  },
  estimatedCost: () => ZERO_COST,
  evaluate: () => ({ matched: true, score: baseScore }),
  execute: async (_ctx, _providers) => ({
    status: 'SUCCESS',
    result: 'parsed',
    skillId: 'csv',
    stepId: 'step-1',
    diagnostics: [],
    metrics: { durationMs: 5, resourceCost: ZERO_COST, cacheHit: false },
    cacheable: true,
    retryable: false,
  }),
  ...overrides,
})

describe('StepExecutor', () => {
  it('calls skill.execute with ctx and step.resolvedProviders', async () => {
    let capturedProviders: unknown
    const skill = makeSkill({
      execute: async (_ctx, providers) => {
        capturedProviders = providers
        return {
          status: 'SUCCESS', result: 'ok', skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: false,
        }
      },
    })

    const executor = new StepExecutor(skill)
    const step = makeStep()
    await executor.execute(step, makeCtx())
    expect(capturedProviders).toBe(step.resolvedProviders)
  })

  it('returns the outcome from skill.execute', async () => {
    const skill = makeSkill()
    const executor = new StepExecutor(skill)
    const outcome = await executor.execute(makeStep(), makeCtx())
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toBe('parsed')
  })

  it('returns FAILURE outcome when skill.execute throws', async () => {
    const skill = makeSkill({
      execute: async () => { throw new Error('skill exploded') },
    })
    const executor = new StepExecutor(skill)
    const outcome = await executor.execute(makeStep(), makeCtx())
    expect(outcome.status).toBe('FAILURE')
    expect(outcome.retryable).toBe(true)
    expect(outcome.error?.message).toBe('skill exploded')
  })
})

describe('TimeoutExecutor', () => {
  it('returns the outcome when skill completes within timeout', async () => {
    const skill = makeSkill()
    const inner = new StepExecutor(skill)
    const executor = new TimeoutExecutor(inner)
    const outcome = await executor.execute(makeStep({ timeoutMs: 1000 }), makeCtx())
    expect(outcome.status).toBe('SUCCESS')
  })

  it('returns TIMEOUT outcome when skill exceeds timeoutMs', async () => {
    const skill = makeSkill({
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return {
          status: 'SUCCESS', result: 'late', skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 200, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: false,
        }
      },
    })
    const inner = new StepExecutor(skill)
    const executor = new TimeoutExecutor(inner)
    const outcome = await executor.execute(makeStep({ timeoutMs: 50 }), makeCtx())
    expect(outcome.status).toBe('TIMEOUT')
    expect(outcome.retryable).toBe(true)
    expect(outcome.skillId).toBe('csv')
    expect(outcome.stepId).toBe('step-1')
  })
})

describe('RetryExecutor', () => {
  it('returns first success without retrying', async () => {
    let calls = 0
    const skill = makeSkill({
      execute: async () => {
        calls++
        return {
          status: 'SUCCESS', result: 'ok', skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: false,
        }
      },
    })
    const inner = new TimeoutExecutor(new StepExecutor(skill))
    const executor = new RetryExecutor(inner)
    const outcome = await executor.execute(makeStep({ retryPolicy: { maxAttempts: 3, retryableStatuses: ['FAILURE', 'TIMEOUT'] } }), makeCtx())
    expect(outcome.status).toBe('SUCCESS')
    expect(calls).toBe(1)
  })

  it('retries on FAILURE and returns last outcome after max attempts', async () => {
    let calls = 0
    const skill = makeSkill({
      execute: async () => {
        calls++
        return {
          status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: true,
        }
      },
    })
    const inner = new TimeoutExecutor(new StepExecutor(skill))
    const executor = new RetryExecutor(inner)
    const outcome = await executor.execute(makeStep({ retryPolicy: { maxAttempts: 3, retryableStatuses: ['FAILURE'] } }), makeCtx())
    expect(outcome.status).toBe('FAILURE')
    expect(calls).toBe(3)
  })

  it('does not retry when outcome.retryable is false', async () => {
    let calls = 0
    const skill = makeSkill({
      execute: async () => {
        calls++
        return {
          status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: false,
        }
      },
    })
    const inner = new TimeoutExecutor(new StepExecutor(skill))
    const executor = new RetryExecutor(inner)
    const outcome = await executor.execute(makeStep({ retryPolicy: { maxAttempts: 3, retryableStatuses: ['FAILURE'] } }), makeCtx())
    expect(outcome.status).toBe('FAILURE')
    expect(calls).toBe(1)
  })

  it('does not retry non-retryable status even if retryable flag is true', async () => {
    let calls = 0
    const skill = makeSkill({
      execute: async () => {
        calls++
        return {
          status: 'BUDGET_EXCEEDED', result: undefined, skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: true,
        }
      },
    })
    const inner = new TimeoutExecutor(new StepExecutor(skill))
    const executor = new RetryExecutor(inner)
    // retryableStatuses does NOT include BUDGET_EXCEEDED
    const outcome = await executor.execute(makeStep({ retryPolicy: { maxAttempts: 3, retryableStatuses: ['FAILURE', 'TIMEOUT'] } }), makeCtx())
    expect(outcome.status).toBe('BUDGET_EXCEEDED')
    expect(calls).toBe(1)
  })

  it('succeeds on second attempt after first failure', async () => {
    let calls = 0
    const skill = makeSkill({
      execute: async () => {
        calls++
        if (calls === 1) {
          return {
            status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
            diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
            cacheable: false, retryable: true,
          }
        }
        return {
          status: 'SUCCESS', result: 'ok', skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: false,
        }
      },
    })
    const inner = new TimeoutExecutor(new StepExecutor(skill))
    const executor = new RetryExecutor(inner)
    const outcome = await executor.execute(makeStep({ retryPolicy: { maxAttempts: 3, retryableStatuses: ['FAILURE'] } }), makeCtx())
    expect(outcome.status).toBe('SUCCESS')
    expect(calls).toBe(2)
  })
})

const makeCapabilityWith = (skillId: string, skill: Skill): Capability => ({
  metadata: { capabilityId: skillId, name: skillId, tierId: 'DETERMINISTIC', version: '1.0.0', contractVersion: '1.0' },
  skills: [skill],
})

describe('FallbackExecutor', () => {
  let catalog: CatalogImpl

  beforeEach(() => {
    catalog = new CatalogImpl()
  })

  it('returns primary outcome when primary succeeds', async () => {
    const primary = makeSkill()
    const inner = new RetryExecutor(new TimeoutExecutor(new StepExecutor(primary)))
    const executor = new FallbackExecutor(inner, catalog)
    const outcome = await executor.execute(makeStep(), makeCtx())
    expect(outcome.status).toBe('SUCCESS')
  })

  it('returns primary outcome when no fallbackSkillId set', async () => {
    const primary = makeSkill({ execute: async () => ({
      status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: false,
    }) })
    const inner = new RetryExecutor(new TimeoutExecutor(new StepExecutor(primary)))
    const executor = new FallbackExecutor(inner, catalog)
    const outcome = await executor.execute(makeStep(), makeCtx())
    expect(outcome.status).toBe('FAILURE')
  })

  it('attempts fallback skill when primary fails and fallbackSkillId is set', async () => {
    const primary = makeSkill({ execute: async () => ({
      status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: false,
    }) })

    const fallbackSkill = makeSkill({
      metadata: {
        skillId: 'json',
        name: 'JSON Skill',
        tierId: 'DETERMINISTIC',
        version: '1.0.0',
        executionModel: 'DETERMINISTIC',
        requirements: {},
      },
      execute: async () => ({
        status: 'SUCCESS', result: 'fallback-result', skillId: 'json', stepId: 'step-1',
        diagnostics: [], metrics: { durationMs: 2, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    })
    catalog.register(makeCapabilityWith('json', fallbackSkill))

    const inner = new RetryExecutor(new TimeoutExecutor(new StepExecutor(primary)))
    const executor = new FallbackExecutor(inner, catalog)

    const step = makeStep({ fallbackSkillId: 'json' })
    const outcome = await executor.execute(step, makeCtx())
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toBe('fallback-result')
  })

  it('returns fallback failure when both primary and fallback fail', async () => {
    const primary = makeSkill({ execute: async () => ({
      status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: false,
    }) })

    const fallbackSkill = makeSkill({
      metadata: { skillId: 'json', name: 'JSON Skill', tierId: 'DETERMINISTIC', version: '1.0.0', executionModel: 'DETERMINISTIC', requirements: {} },
      execute: async () => ({
        status: 'FAILURE', result: undefined, skillId: 'json', stepId: 'step-1',
        diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    })
    catalog.register(makeCapabilityWith('json', fallbackSkill))

    const inner = new RetryExecutor(new TimeoutExecutor(new StepExecutor(primary)))
    const executor = new FallbackExecutor(inner, catalog)

    const step = makeStep({ fallbackSkillId: 'json' })
    const outcome = await executor.execute(step, makeCtx())
    expect(outcome.status).toBe('FAILURE')
  })

  // ── Stage 16C schema-fallback guard ─────────────────────────────────────

  it('blocks fallback when schemaIsBound=true and fallback lacks structuredOutput requirement', async () => {
    const primary = makeSkill({ execute: async () => ({
      status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [{ code: 'PRIMARY_FAILED', message: 'primary failed' }],
      metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: false,
    }) })

    // Fallback skill WITHOUT structuredOutput requirement
    const fallbackSkill = makeSkill({
      metadata: {
        skillId: 'plain-text', name: 'Plain Text Skill',
        tierId: 'DETERMINISTIC', version: '1.0.0',
        executionModel: 'DETERMINISTIC',
        requirements: {
          providerCapabilities: { reasoningEngine: { reasoning: true } },
          // structuredOutput intentionally absent
        },
      },
      execute: async () => ({
        status: 'SUCCESS', result: 'plain text', skillId: 'plain-text', stepId: 'step-1',
        diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    })
    catalog.register(makeCapabilityWith('plain-text', fallbackSkill))

    const inner = new RetryExecutor(new TimeoutExecutor(new StepExecutor(primary)))
    const executor = new FallbackExecutor(inner, catalog)

    const step = makeStep({ fallbackSkillId: 'plain-text' })
    const ctx = makeCtx()
    ctx.schemaIsBound = true

    const outcome = await executor.execute(step, ctx)
    // Primary failure returned — fallback blocked
    expect(outcome.status).toBe('FAILURE')
    const blocked = outcome.diagnostics.find(d => d.code === 'SCHEMA_FALLBACK_BLOCKED')
    expect(blocked).toBeDefined()
    expect(blocked!.message).toContain('plain-text')
  })

  it('permits fallback when schemaIsBound=true and fallback has structuredOutput requirement', async () => {
    const primary = makeSkill({ execute: async () => ({
      status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [],
      metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: false,
    }) })

    // Fallback skill WITH structuredOutput requirement
    const fallbackSkill = makeSkill({
      metadata: {
        skillId: 'structured-fb', name: 'Structured Fallback',
        tierId: 'DETERMINISTIC', version: '1.0.0',
        executionModel: 'DETERMINISTIC',
        requirements: {
          providerCapabilities: { reasoningEngine: { structuredOutput: true } },
        },
      },
      execute: async () => ({
        status: 'SUCCESS', result: '{"ok":true}', skillId: 'structured-fb', stepId: 'step-1',
        diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    })
    catalog.register(makeCapabilityWith('structured-fb', fallbackSkill))

    const inner = new RetryExecutor(new TimeoutExecutor(new StepExecutor(primary)))
    const executor = new FallbackExecutor(inner, catalog)

    const step = makeStep({ fallbackSkillId: 'structured-fb' })
    const ctx = makeCtx()
    ctx.schemaIsBound = true

    const outcome = await executor.execute(step, ctx)
    // Fallback succeeded and is annotated as permitted degradation
    expect(outcome.status).toBe('SUCCESS')
    const degradation = outcome.diagnostics.find(d => d.code === 'SCHEMA_FALLBACK_PERMITTED_DEGRADATION')
    expect(degradation).toBeDefined()
  })

  it('no schema bound — fallback proceeds without schema check', async () => {
    const primary = makeSkill({ execute: async () => ({
      status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [],
      metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: false,
    }) })

    // Fallback skill WITHOUT structuredOutput — but no schema bound, so allowed
    const fallbackSkill = makeSkill({
      metadata: {
        skillId: 'plain-text2', name: 'Plain Text Skill 2',
        tierId: 'DETERMINISTIC', version: '1.0.0',
        executionModel: 'DETERMINISTIC',
        requirements: {},
      },
      execute: async () => ({
        status: 'SUCCESS', result: 'text output', skillId: 'plain-text2', stepId: 'step-1',
        diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    })
    catalog.register(makeCapabilityWith('plain-text2', fallbackSkill))

    const inner = new RetryExecutor(new TimeoutExecutor(new StepExecutor(primary)))
    const executor = new FallbackExecutor(inner, catalog)

    const step = makeStep({ fallbackSkillId: 'plain-text2' })
    const ctx = makeCtx()
    // schemaIsBound NOT set

    const outcome = await executor.execute(step, ctx)
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toBe('text output')
    // No SCHEMA_FALLBACK_BLOCKED diagnostic
    expect(outcome.diagnostics.find(d => d.code === 'SCHEMA_FALLBACK_BLOCKED')).toBeUndefined()
  })
})

const makePlan = (step: ExecutionStep): ExecutionPlan => ({
  planId: 'plan-1',
  requestId: 'req-1',
  steps: [step],
  budget: {
    maxRetries: 3,
    allowReasoning: true,
    allowNetwork: true,
    allowDisk: true,
    mode: 'BALANCED',
  },
  createdAt: new Date(),
})

describe('ExecutionEngine', () => {
  it('executes a plan and returns SUCCESS outcome', async () => {
    const skill = makeSkill()
    const catalog = new CatalogImpl()
    catalog.register(makeCapabilityWith('csv', skill))
    const engine = new ExecutionEngine(catalog)

    const ctx = makeCtx()
    const plan = makePlan(makeStep())
    const outcome = await engine.execute(plan, ctx)
    expect(outcome.status).toBe('SUCCESS')
  })

  it('appends EXECUTION_STARTED and EXECUTION_SUCCEEDED trace events on success', async () => {
    const skill = makeSkill()
    const catalog = new CatalogImpl()
    catalog.register(makeCapabilityWith('csv', skill))
    const engine = new ExecutionEngine(catalog)

    const ctx = makeCtx()
    await engine.execute(makePlan(makeStep()), ctx)

    const trace = ctx.traceBuilder.build()
    const types = trace.events.map(e => e.type)
    expect(types).toContain('EXECUTION_STARTED')
    expect(types).toContain('EXECUTION_SUCCEEDED')
  })

  it('appends EXECUTION_FAILED trace event on failure', async () => {
    const skill = makeSkill({
      execute: async () => ({
        status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
        diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false, retryable: false,
      }),
    })
    const catalog = new CatalogImpl()
    catalog.register(makeCapabilityWith('csv', skill))
    const engine = new ExecutionEngine(catalog)

    const ctx = makeCtx()
    await engine.execute(makePlan(makeStep()), ctx)

    const trace = ctx.traceBuilder.build()
    const types = trace.events.map(e => e.type)
    expect(types).toContain('EXECUTION_FAILED')
  })

  it('appends COMPLETED trace event after execution', async () => {
    const skill = makeSkill()
    const catalog = new CatalogImpl()
    catalog.register(makeCapabilityWith('csv', skill))
    const engine = new ExecutionEngine(catalog)

    const ctx = makeCtx()
    await engine.execute(makePlan(makeStep()), ctx)

    const trace = ctx.traceBuilder.build()
    const completedEvent = trace.events.find(e => e.type === 'COMPLETED')
    expect(completedEvent).toBeDefined()
  })

  it('increments reasoning_avoided_total for non-REASONING successful execution', async () => {
    const metrics = new InMemoryMetricsCollector()
    const servicesWithMetrics = { ...services, metrics }
    const factory2 = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, servicesWithMetrics)
    const ctx = factory2.create({
      id: 'req-metrics', content: 'test', contentType: 'TEXT',
      context: {}, metadata: {},
      constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
      timestamp: new Date(),
    })

    const skill = makeSkill()
    const catalog = new CatalogImpl()
    catalog.register(makeCapabilityWith('csv', skill))
    const engine = new ExecutionEngine(catalog)

    await engine.execute(makePlan(makeStep({ tierId: 'DETERMINISTIC' })), ctx)
    expect(metrics.getCounter('reasoning_avoided_total')).toBe(1)
  })

  it('does NOT increment reasoning_avoided_total for REASONING execution', async () => {
    const metrics = new InMemoryMetricsCollector()
    const servicesWithMetrics = { ...services, metrics }
    const factory2 = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, servicesWithMetrics)
    const ctx = factory2.create({
      id: 'req-reasoning', content: 'test', contentType: 'TEXT',
      context: {}, metadata: {},
      constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
      timestamp: new Date(),
    })

    const reasoningSkill = makeSkill({
      metadata: {
        skillId: 'llm',
        name: 'LLM Skill',
        tierId: 'REASONING',
        version: '1.0.0',
        executionModel: 'REASONING',
        requirements: {},
      },
    })
    const catalog = new CatalogImpl()
    catalog.register({
      metadata: { capabilityId: 'llm', name: 'LLM', tierId: 'REASONING', version: '1.0.0', contractVersion: '1.0' },
      skills: [reasoningSkill],
    })
    const engine = new ExecutionEngine(catalog)

    await engine.execute(makePlan(makeStep({ skillId: 'llm', tierId: 'REASONING' })), ctx)
    expect(metrics.getCounter('reasoning_avoided_total')).toBe(0)
  })

  it('returns BUDGET_EXCEEDED without calling skill when budget check fails', async () => {
    let skillCalled = false
    const skill = makeSkill({
      execute: async () => {
        skillCalled = true
        return {
          status: 'SUCCESS', result: 'ok', skillId: 'csv', stepId: 'step-1',
          diagnostics: [], metrics: { durationMs: 1, resourceCost: ZERO_COST, cacheHit: false },
          cacheable: false, retryable: false,
        }
      },
    })
    const catalog = new CatalogImpl()
    catalog.register(makeCapabilityWith('csv', skill))
    const engine = new ExecutionEngine(catalog)

    const ctx = makeCtx({ allowReasoning: false })
    const plan = makePlan(makeStep({ tierId: 'REASONING' }))
    const outcome = await engine.execute(plan, ctx)
    expect(outcome.status).toBe('BUDGET_EXCEEDED')
    expect(skillCalled).toBe(false)
  })

  it('throws when skill not found in catalog', async () => {
    const catalog = new CatalogImpl()
    const engine = new ExecutionEngine(catalog)
    const ctx = makeCtx()
    await expect(engine.execute(makePlan(makeStep()), ctx)).rejects.toThrow('Skill not found: csv')
  })
})
