import { describe, it, expect, beforeEach } from 'vitest'
import { DefaultExecutionResolver } from '../resolver.js'
import { ExecutionContextFactory } from '../context-factory.js'
import { DEFAULT_SYSTEM_CONFIG } from '../domain/config.js'
import { createRuntimeServices } from '../services/index.js'
import type { Provider } from '../interfaces/provider.js'
import type { ReasoningProvider } from '../interfaces/reasoning.js'
import type { ExecutionRequirements } from '../interfaces/skill.js'

const services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
const factory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, services)

const makeCtx = (mode: 'BALANCED' | 'STRICT' = 'BALANCED') => factory.create({
  id: 'req-1', content: 'test', contentType: 'TEXT',
  context: {}, metadata: {},
  constraints: { maxRetries: 1, allowReasoning: true, allowNetwork: true, allowDisk: true, mode },
  timestamp: new Date(),
})

const makeProvider = (id: string, caps: import('../interfaces/provider.js').ProviderCapabilityType[]): Provider => ({
  metadata: { providerId: id, name: id, environments: ['NETWORK'], capabilities: caps, version: '1.0.0' },
  isAvailable: async () => true,
  health: async () => ({ status: 'HEALTHY' }),
})

const makeReasoningProvider = (id: string): ReasoningProvider => ({
  ...makeProvider(id, ['REASONING_ENGINE']),
  capabilities: new Set(['reasoning']),
  hasCapability: (k: string) => k === 'reasoning',
  reason: async () => ({ status: 'SKIPPED', result: undefined, skillId: id, stepId: 'x', diagnostics: [], metrics: { durationMs: 0, resourceCost: { estimated: {} }, cacheHit: false }, cacheable: false, retryable: false }),
  stream: async function* () {},
  estimateCost: () => ({ estimated: { usd: 0.001 } }),
})

describe('DefaultExecutionResolver', () => {
  let resolver: DefaultExecutionResolver

  beforeEach(() => {
    resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
  })

  it('isResolvable returns true when no providers required', () => {
    const req: ExecutionRequirements = {}
    expect(resolver.isResolvable(req, makeCtx())).toBe(true)
  })

  it('isResolvable returns false when required reasoning engine not registered', () => {
    const req: ExecutionRequirements = { providerCapabilities: { reasoningEngine: { reasoning: true } } }
    expect(resolver.isResolvable(req, makeCtx())).toBe(false)
  })

  it('isResolvable returns true when required reasoning engine registered', () => {
    resolver.registerProvider(makeReasoningProvider('null-llm'))
    const req: ExecutionRequirements = { providerCapabilities: { reasoningEngine: { reasoning: true } } }
    expect(resolver.isResolvable(req, makeCtx())).toBe(true)
  })

  it('resolve returns empty ResolvedProviders for skill with no requirements', async () => {
    const result = await resolver.resolve({}, 'FIRST_AVAILABLE', makeCtx())
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('resolve returns ProviderResolution with policy and candidates', async () => {
    resolver.registerProvider(makeReasoningProvider('null-llm'))
    const req: ExecutionRequirements = { providerCapabilities: { reasoningEngine: { reasoning: true } } }
    const result = await resolver.resolve(req, 'FIRST_AVAILABLE', makeCtx())
    const resolution = result['reasoningEngine']
    expect(resolution).toBeDefined()
    expect(resolution?.policy).toBe('FIRST_AVAILABLE')
    expect(resolution?.candidates).toContain('null-llm')
    expect(resolution?.provider.metadata.providerId).toBe('null-llm')
  })

  it('resolve throws when required provider unavailable', async () => {
    const req: ExecutionRequirements = { providerCapabilities: { reasoningEngine: { reasoning: true } } }
    await expect(resolver.resolve(req, 'FIRST_AVAILABLE', makeCtx())).rejects.toThrow()
  })
})
