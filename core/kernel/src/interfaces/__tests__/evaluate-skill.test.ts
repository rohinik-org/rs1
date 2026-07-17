import { describe, it, expect } from 'vitest'
import { evaluateSkill } from '../evaluate-skill.js'
import { IdentityRankingPolicy } from '../../matching/ranking.js'
import { KeywordMatcher } from '../../matching/keyword-matcher.js'
import type { Skill } from '../skill.js'
import type { ExecutionContext } from '../../domain/context.js'
import type { RoutingRequest } from '../../domain/request.js'
import { DEFAULT_BUDGET } from '../../domain/request.js'

function makeCtx(intentHint?: string): ExecutionContext {
  const request: RoutingRequest = {
    id: 't', content: 'x', contentType: 'TEXT',
    ...(intentHint !== undefined ? { intentHint } : {}),
    context: {}, metadata: {}, constraints: DEFAULT_BUDGET, timestamp: new Date(),
  }
  return { request } as unknown as ExecutionContext
}

const policy = new IdentityRankingPolicy()

const withMatcher: Skill = {
  metadata: {
    skillId: 'test.matcher-based',
    name: 'Matcher-based skill',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
    matching: { matcher: new KeywordMatcher(['sort']) },
  },
  estimatedCost: () => ({ estimated: { cpuMs: 1 } }),
  execute: async () => ({
    status: 'SUCCESS', result: undefined, skillId: 'test.matcher-based', stepId: 's0',
    diagnostics: [],
    metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
    cacheable: false, retryable: false,
  }),
}

const legacy: Skill = {
  metadata: {
    skillId: 'test.legacy',
    name: 'Legacy skill',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
  },
  estimatedCost: () => ({ estimated: { cpuMs: 1 } }),
  evaluate: (ctx) => {
    return ctx.request.intentHint === 'legacy'
      ? {
          matched: true,
          score: { skillId: 'test.legacy', components: [{ id: 'c', value: 1, weight: 1 }], finalScore: 1 },
        }
      : { matched: false, reason: 'legacy check failed' }
  },
  execute: async () => ({
    status: 'SUCCESS', result: undefined, skillId: 'test.legacy', stepId: 's0',
    diagnostics: [],
    metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
    cacheable: false, retryable: false,
  }),
}

const neither: Skill = {
  metadata: {
    skillId: 'test.neither',
    name: 'Neither',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
  },
  estimatedCost: () => ({ estimated: { cpuMs: 1 } }),
  execute: async () => ({
    status: 'SUCCESS', result: undefined, skillId: 'test.neither', stepId: 's0',
    diagnostics: [],
    metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
    cacheable: false, retryable: false,
  }),
}

describe('evaluateSkill', () => {
  it('uses the matcher when matching.matcher is present', () => {
    const r = evaluateSkill(withMatcher, makeCtx('sort me'), policy)
    expect(r.matched).toBe(true)
    if (r.matched) {
      expect(r.score.finalScore).toBe(1)
      expect(r.score.skillId).toBe('test.matcher-based')
    }
  })

  it('returns matched:false with matcher explanation on miss', () => {
    const r = evaluateSkill(withMatcher, makeCtx('add'), policy)
    expect(r.matched).toBe(false)
    expect(r.reason).toContain('sort')
  })

  it('falls back to legacy evaluate() when matcher absent', () => {
    const r = evaluateSkill(legacy, makeCtx('legacy'), policy)
    expect(r.matched).toBe(true)
  })

  it('legacy evaluate() miss surfaces its reason', () => {
    const r = evaluateSkill(legacy, makeCtx('other'), policy)
    expect(r.matched).toBe(false)
    expect(r.reason).toBe('legacy check failed')
  })

  it('returns matched:false with clear reason when skill has neither', () => {
    const r = evaluateSkill(neither, makeCtx('anything'), policy)
    expect(r.matched).toBe(false)
    expect(r.reason).toContain('neither matching.matcher nor evaluate()')
  })

  it('prefers matcher over legacy evaluate() when both are present', () => {
    const both: Skill = {
      ...legacy,
      metadata: {
        ...legacy.metadata,
        matching: { matcher: new KeywordMatcher(['matcher-wins']) },
      },
    }
    // matcher misses, so result should be matched:false (matcher decides,
    // not the legacy evaluate() that would have matched on 'legacy')
    const r = evaluateSkill(both, makeCtx('legacy'), policy)
    expect(r.matched).toBe(false)
  })
})
