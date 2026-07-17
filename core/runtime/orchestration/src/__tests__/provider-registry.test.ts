import { describe, it, expect } from 'vitest'
import { ProviderRegistry } from '../provider/provider-registry.js'
import { RoutingPolicyEngine } from '../policy/routing-policy-engine.js'
import { DEFAULT_ROUTING_POLICY } from '@rohinik-org/compiler'
import type { ProviderEntry } from '@rohinik-org/compiler'

function makeEntry(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    providerId: 'test-provider',
    displayName: 'Test',
    supportedSkillTags: ['llm'],
    maxContextWindow: 8192,
    estimatedCostTier: 'low',
    estimatedLatencyTier: 'medium',
    available: true,
    ...overrides,
  }
}

describe('ProviderRegistry', () => {
  it('registers and looks up by ID', () => {
    const reg = new ProviderRegistry()
    const entry = makeEntry()
    reg.register(entry)
    expect(reg.lookup('test-provider')).toBe(entry)
  })

  it('lists all registered providers', () => {
    const reg = new ProviderRegistry()
    reg.register(makeEntry({ providerId: 'a' }))
    reg.register(makeEntry({ providerId: 'b' }))
    expect(reg.list().length).toBe(2)
  })

  it('returns undefined for unknown ID', () => {
    expect(new ProviderRegistry().lookup('nope')).toBeUndefined()
  })
})

describe('RoutingPolicyEngine', () => {
  const engine = new RoutingPolicyEngine()

  it('excludes unavailable providers', () => {
    const result = engine.filter([makeEntry({ available: false })], DEFAULT_ROUTING_POLICY)
    expect(result).toHaveLength(0)
  })

  it('excludes blocked providers', () => {
    const result = engine.filter(
      [makeEntry({ providerId: 'blocked-one' })],
      { ...DEFAULT_ROUTING_POLICY, blockedProviders: ['blocked-one'] },
    )
    expect(result).toHaveLength(0)
  })

  it('excludes providers exceeding maxCostTier', () => {
    const result = engine.filter(
      [makeEntry({ estimatedCostTier: 'high' })],
      { ...DEFAULT_ROUTING_POLICY, maxCostTier: 'low' },
    )
    expect(result).toHaveLength(0)
  })

  it('includes providers within maxCostTier', () => {
    const result = engine.filter(
      [makeEntry({ estimatedCostTier: 'free' })],
      { ...DEFAULT_ROUTING_POLICY, maxCostTier: 'low' },
    )
    expect(result).toHaveLength(1)
  })

  it('excludes providers with insufficient context window', () => {
    const result = engine.filter(
      [makeEntry({ maxContextWindow: 1024 })],
      { ...DEFAULT_ROUTING_POLICY, minimumContextWindow: 4096 },
    )
    expect(result).toHaveLength(0)
  })

  it('returns empty when all filtered', () => {
    const result = engine.filter(
      [makeEntry({ available: false }), makeEntry({ estimatedCostTier: 'high', available: false })],
      DEFAULT_ROUTING_POLICY,
    )
    expect(result).toHaveLength(0)
  })
})
