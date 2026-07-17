import { describe, it, expect } from 'vitest'
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
import { DEFAULT_BUDGET } from '../domain/request.js'
import { RuntimeRegistry } from '../runtime/runtime-registry.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'

describe('Stage 4B integration: CSV parse without LLM', () => {
  it('routes a CSV parse request to CsvParseSkill via the DETERMINISTIC tier', async () => {
    const services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
    const catalog = new InMemoryCapabilityCatalog()
    const resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
    const factory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, services)

    // RuntimeRegistry adapts SdkCapability → kernel Capability, wiring real
    // evaluate/execute methods from CsvParseSkill through to the routing pipeline.
    const registry = new RuntimeRegistry(catalog, resolver)
    registry.registerCapability(buildCoreCapability())

    const tiers = [
      new MemoryTier(catalog, resolver),
      new DeterministicTier(catalog, resolver),
      new LocalToolTier(catalog, resolver),
      new ExternalTier(catalog, resolver),
      new ReasoningTier(catalog, resolver),
    ]
    const planner = new SingleStepPlanner()
    const engine = new ExecutionEngine(catalog)
    const router = new AiosRouter(tiers, factory, planner, engine)

    const result = await router.route({
      id: 'req-csv-integration-1',
      content: 'name,age\nAlice,30\nBob,25',
      contentType: 'CSV',
      intentHint: 'csv parse',
      context: {},
      metadata: {},
      constraints: { ...DEFAULT_BUDGET, allowReasoning: false },
      timestamp: new Date(),
    })

    expect(result.skillId).toBe('csv.parse')
    expect(result.reasoningInvoked).toBe(false)
    expect(result.output).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ])
  })
})
