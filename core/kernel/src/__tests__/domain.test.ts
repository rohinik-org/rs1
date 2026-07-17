import { describe, it, expect } from 'vitest'
import type { ResourceCost } from '../domain/cost.js'
import { RUNTIME_MODE_POLICIES } from '../domain/mode.js'
import type { RoutingRequest } from '../domain/request.js'
import type { Skill, SkillScore, SkillEvaluation, ScoreComponent } from '../interfaces/skill.js'
import type { TierId } from '../interfaces/tier.js'
import type { Capability } from '../interfaces/capability.js'

describe('domain/cost', () => {
  it('ResourceCost has estimated and optional actual', () => {
    const cost: ResourceCost = { estimated: { usd: 0.001, tokens: 100 } }
    expect(cost.estimated.tokens).toBe(100)
    expect(cost.actual).toBeUndefined()
  })
})

describe('domain/mode', () => {
  it('STRICT mode forbids REASONING tier', () => {
    const policy = RUNTIME_MODE_POLICIES['STRICT']
    expect(policy.allowedTiers).not.toContain('REASONING')
    expect(policy.maxReasoningAttempts).toBe(0)
  })

  it('BALANCED mode allows REASONING tier', () => {
    const policy = RUNTIME_MODE_POLICIES['BALANCED']
    expect(policy.allowedTiers).toContain('REASONING')
  })

  it('FAST mode uses aggressive cache and skips health checks', () => {
    const policy = RUNTIME_MODE_POLICIES['FAST']
    expect(policy.aggressiveCache).toBe(true)
    expect(policy.skipHealthChecks).toBe(true)
  })
})

describe('domain/request', () => {
  it('RoutingRequest type compiles with required fields', () => {
    const req: RoutingRequest = {
      id: 'req-1',
      content: 'parse this csv',
      contentType: 'CSV',
      context: {},
      metadata: {},
      constraints: {
        maxRetries: 3,
        allowReasoning: true,
        allowNetwork: true,
        allowDisk: true,
        mode: 'BALANCED',
      },
      timestamp: new Date(),
    }
    expect(req.id).toBe('req-1')
  })
})

describe('interfaces/skill', () => {
  it('SkillScore finalScore is computed from components', () => {
    const score: SkillScore = {
      skillId: 'csv',
      components: [
        { id: 'confidence', value: 0.9, weight: 0.60 },
        { id: 'cost', value: 1.0, weight: 0.20 },
        { id: 'latency', value: 0.8, weight: 0.10 },
        { id: 'reliability', value: 1.0, weight: 0.10 },
      ],
      finalScore: 0.9 * 0.60 + 1.0 * 0.20 + 0.8 * 0.10 + 1.0 * 0.10,
    }
    expect(score.finalScore).toBeCloseTo(0.92)
  })

  it('SkillEvaluation can be unmatched with reason', () => {
    const ev: SkillEvaluation = { matched: false, reason: 'content type mismatch' }
    expect(ev.matched).toBe(false)
    expect('score' in ev).toBe(false)
  })
})

describe('interfaces/tier', () => {
  it('TierId covers all five tiers', () => {
    const tiers: TierId[] = ['MEMORY', 'DETERMINISTIC', 'LOCAL_TOOL', 'EXTERNAL', 'REASONING']
    expect(tiers).toHaveLength(5)
  })
})

import type { Provider } from '../interfaces/provider.js'
import type { ReasoningProvider } from '../interfaces/reasoning.js'
import { REASONING_CAPABILITY } from '../interfaces/reasoning.js'
import type { ResolvedProviders, ProviderResolution } from '../interfaces/resolver.js'

describe('interfaces/provider', () => {
  it('Provider has metadata and health methods', () => {
    const p: Provider = {
      metadata: { providerId: 'test', name: 'Test', environments: ['NETWORK'], capabilities: ['REASONING_ENGINE'], version: '1.0.0' },
      isAvailable: async () => true,
      health: async () => ({ status: 'HEALTHY' }),
    }
    expect(p.metadata.providerId).toBe('test')
  })
})

describe('interfaces/reasoning', () => {
  it('REASONING_CAPABILITY has expected keys', () => {
    expect(REASONING_CAPABILITY.REASONING).toBe('reasoning')
    expect(REASONING_CAPABILITY.VISION).toBe('vision')
  })
})

describe('interfaces/resolver', () => {
  it('ResolvedProviders maps requirement key to ProviderResolution', () => {
    const resolution: ProviderResolution = {
      provider: {} as Provider,
      policy: 'FIRST_AVAILABLE',
      score: 1.0,
      candidates: ['null-reasoning'],
    }
    const resolved: ResolvedProviders = { reasoningEngine: resolution }
    expect(resolved['reasoningEngine']?.policy).toBe('FIRST_AVAILABLE')
  })
})
