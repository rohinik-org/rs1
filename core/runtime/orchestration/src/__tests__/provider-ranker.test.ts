import { describe, it, expect } from 'vitest'
import { ProviderRanker } from '../router/provider-ranker.js'
import { DEFAULT_ROUTING_POLICY } from '@rohinik-org/compiler'
import type { ProviderEntry } from '@rohinik-org/compiler'

function makeEntry(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    providerId: 'p1',
    displayName: 'P1',
    supportedSkillTags: ['llm'],
    maxContextWindow: 8192,
    estimatedCostTier: 'low',
    estimatedLatencyTier: 'low',
    available: true,
    ...overrides,
  }
}

describe('ProviderRanker', () => {
  const ranker = new ProviderRanker()

  it('returns non-empty scores for valid candidates', () => {
    const scores = ranker.rank([makeEntry()], ['llm'], DEFAULT_ROUTING_POLICY)
    expect(scores.length).toBe(1)
    expect(scores[0]!.finalScore).toBeGreaterThan(0)
  })

  it('selects highest score first', () => {
    const p1 = makeEntry({ providerId: 'p1', estimatedCostTier: 'free' })
    const p2 = makeEntry({ providerId: 'p2', estimatedCostTier: 'high' })
    const scores = ranker.rank([p2, p1], ['llm'], DEFAULT_ROUTING_POLICY)
    expect(scores[0]!.providerId).toBe('p1')
  })

  it('preferred provider gets bonus policyScore', () => {
    const preferred = makeEntry({ providerId: 'preferred' })
    const notPreferred = makeEntry({ providerId: 'other' })
    const policy = { ...DEFAULT_ROUTING_POLICY, preferredProviders: ['preferred'] }
    const scores = ranker.rank([notPreferred, preferred], ['llm'], policy)
    const pref = scores.find(s => s.providerId === 'preferred')!
    const other = scores.find(s => s.providerId === 'other')!
    expect(pref.policyScore).toBeGreaterThan(other.policyScore)
  })

  it('partial tag match lowers capabilityScore', () => {
    const p = makeEntry({ supportedSkillTags: ['llm'] })
    const scores = ranker.rank([p], ['llm', 'search'], DEFAULT_ROUTING_POLICY)
    expect(scores[0]!.capabilityScore).toBe(0.5)
  })

  it('returns empty array for empty candidates', () => {
    expect(ranker.rank([], ['llm'], DEFAULT_ROUTING_POLICY)).toHaveLength(0)
  })
})
