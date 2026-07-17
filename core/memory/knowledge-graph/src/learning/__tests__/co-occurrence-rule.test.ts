import { describe, it, expect } from 'vitest'
import { CoOccurrenceRule } from '../rules/co-occurrence-rule.js'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { ExecutionRecord } from '@rohinik-org/compiler'

function makeRecord(skillA: string, skillB: string, id: string): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: id, runtimeId: 'rt1', timestamp: '2026-01-01T00:00:00Z',
    requestId: `req-${id}`, requestHash: 'abc', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerTierId: 'tier1', winnerSkillId: skillA,
    allCandidates: [
      { skillId: skillA, tierId: 'tier1', score: 0.9, selected: true },
      { skillId: skillB, tierId: 'tier1', score: 0.8, selected: false },
    ],
    reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: 'trace1', runtimeVersion: '1.0.0',
  }
}

function makeEngine(records: ExecutionRecord[]): CorpusQueryEngine {
  return { query: async () => records } as unknown as CorpusQueryEngine
}

describe('CoOccurrenceRule', () => {
  it('returns no candidates when corpus is empty', async () => {
    const rule = new CoOccurrenceRule()
    expect(await rule.infer(makeEngine([]))).toHaveLength(0)
  })

  it('infers ALTERNATIVE_TO when two skills frequently co-appear as candidates', async () => {
    const records = Array.from({ length: 15 }, (_, i) => makeRecord('skill-csv', 'skill-json', `r${i}`))
    const rule = new CoOccurrenceRule({ minCoOccurrences: 10, minConfidence: 0.6 })
    const candidates = await rule.infer(makeEngine(records))
    expect(candidates.length).toBeGreaterThan(0)
    const c = candidates[0]!
    expect(c.relationship).toBe('ALTERNATIVE_TO')
    expect(c.inferenceRuleId).toBe('CoOccurrenceRule')
    expect(c.stableEdgeId).toMatch(/^edge:\/\/inferred\//)
  })
})
