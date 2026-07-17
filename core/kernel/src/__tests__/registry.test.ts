import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import { InMemoryCapabilityHealthService } from '../registry/health.js'
import type { Capability } from '../interfaces/capability.js'
import type { ExecutionOutcome } from '../domain/result.js'
import { ZERO_COST } from '../domain/cost.js'

const makeCapability = (id: string, tierId: 'DETERMINISTIC' | 'REASONING'): Capability => ({
  metadata: { capabilityId: id, name: id, tierId, version: '1.0.0', contractVersion: '1.0' },
  skills: [],
})

describe('InMemoryCapabilityCatalog', () => {
  let catalog: InMemoryCapabilityCatalog

  beforeEach(() => { catalog = new InMemoryCapabilityCatalog() })

  it('starts empty', () => {
    expect(catalog.getForTier('DETERMINISTIC')).toHaveLength(0)
  })

  it('returns registered capabilities for tier', () => {
    catalog.register(makeCapability('csv', 'DETERMINISTIC'))
    catalog.register(makeCapability('json', 'DETERMINISTIC'))
    catalog.register(makeCapability('llm', 'REASONING'))
    expect(catalog.getForTier('DETERMINISTIC')).toHaveLength(2)
    expect(catalog.getForTier('REASONING')).toHaveLength(1)
  })

  it('isHealthy returns true when no health recorded', () => {
    catalog.register(makeCapability('csv', 'DETERMINISTIC'))
    expect(catalog.isHealthy('csv')).toBe(true)
  })
})

describe('InMemoryCapabilityHealthService', () => {
  let health: InMemoryCapabilityHealthService

  beforeEach(() => { health = new InMemoryCapabilityHealthService() })

  it('returns HEALTHY with 1.0 success rate initially', () => {
    const h = health.getHealth('csv')
    expect(h.status).toBe('HEALTHY')
    expect(h.successRate).toBe(1.0)
  })

  it('records successful outcomes', () => {
    const outcome: ExecutionOutcome = {
      status: 'SUCCESS', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [], metrics: { durationMs: 10, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: false,
    }
    health.recordOutcome('csv', outcome)
    const h = health.getHealth('csv')
    expect(h.successRate).toBe(1.0)
    expect(h.consecutiveFailures).toBe(0)
  })

  it('records failures and updates consecutiveFailures', () => {
    const outcome: ExecutionOutcome = {
      status: 'FAILURE', result: undefined, skillId: 'csv', stepId: 'step-1',
      diagnostics: [], metrics: { durationMs: 10, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false, retryable: true,
    }
    health.recordOutcome('csv', outcome)
    health.recordOutcome('csv', outcome)
    const h = health.getHealth('csv')
    expect(h.consecutiveFailures).toBe(2)
    expect(h.successRate).toBeLessThan(1.0)
  })
})
