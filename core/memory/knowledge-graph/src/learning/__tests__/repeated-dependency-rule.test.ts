import { describe, it, expect } from 'vitest'
import { RepeatedDependencyRule } from '../rules/repeated-dependency-rule.js'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { ExecutionRecord } from '@rohinik-org/compiler'

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: 'r1', runtimeId: 'rt1', timestamp: '2026-01-01T00:00:00Z',
    requestId: 'req1', requestHash: 'abc', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerTierId: 'tier1', winnerSkillId: 'skill-a',
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: 'trace1', runtimeVersion: '1.0.0',
    ...overrides,
  }
}

function makeEngine(records: ExecutionRecord[]): CorpusQueryEngine {
  return {
    query: async () => records,
    count: async () => records.length,
    stats: async () => ({ total: records.length, successRate: 1, latencyPercentiles: {}, reasoningInvokedRate: 0, topSkills: [], topProviders: [] }),
  } as unknown as CorpusQueryEngine
}

describe('RepeatedDependencyRule', () => {
  it('returns no candidates when corpus is empty', async () => {
    const rule = new RepeatedDependencyRule()
    const candidates = await rule.infer(makeEngine([]))
    expect(candidates).toHaveLength(0)
  })

  it('infers USES_PROVIDER when skill consistently uses a provider', async () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord({
        recordId: `r${i}`, winnerSkillId: 'skill-a', outcome: 'SUCCESS',
        providerResolutions: [{ requirementKey: 'reasoning', providerId: 'anthropic', providerKind: 'llm', resolved: true }],
      })
    )
    const rule = new RepeatedDependencyRule({ minExecutions: 10, minConfidence: 0.7 })
    const candidates = await rule.infer(makeEngine(records))
    expect(candidates.length).toBeGreaterThan(0)
    const c = candidates[0]!
    expect(c.relationship).toBe('USES_PROVIDER')
    expect(c.inferenceRuleId).toBe('RepeatedDependencyRule')
    expect(c.confidence).toBeGreaterThanOrEqual(0.7)
    expect(c.evidence.executions).toBe(20)
    expect(c.stableEdgeId).toMatch(/^edge:\/\/inferred\//)
  })

  it('does not infer when sample size is below minimum', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        recordId: `r${i}`, winnerSkillId: 'skill-b',
        providerResolutions: [{ requirementKey: 'r', providerId: 'openai', providerKind: 'llm', resolved: true }],
      })
    )
    const rule = new RepeatedDependencyRule({ minExecutions: 10, minConfidence: 0.7 })
    const candidates = await rule.infer(makeEngine(records))
    expect(candidates).toHaveLength(0)
  })
})
