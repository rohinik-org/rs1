import { describe, it, expect } from 'vitest'
import { ToolSequenceRule } from '../rules/tool-sequence-rule.js'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { ExecutionRecord } from '@rohinik-org/compiler'

function makeSeqRecord(skillId: string, requestPrefix: string, seq: number, id: string): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: id, runtimeId: 'rt1',
    timestamp: new Date(Date.now() + seq * 1000).toISOString(),
    requestId: `${requestPrefix}-step${seq}`,
    requestHash: 'abc', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerTierId: 'tier1', winnerSkillId: skillId,
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: `${requestPrefix}-step${seq}`, runtimeVersion: '1.0.0',
  }
}

function makeEngine(records: ExecutionRecord[]): CorpusQueryEngine {
  return { query: async () => records } as unknown as CorpusQueryEngine
}

describe('ToolSequenceRule', () => {
  it('returns no candidates when corpus is empty', async () => {
    const rule = new ToolSequenceRule()
    expect(await rule.infer(makeEngine([]))).toHaveLength(0)
  })

  it('infers DEPENDS_ON when skill B frequently follows skill A', async () => {
    // 15 sessions where skill-read always precedes skill-transform
    const records = Array.from({ length: 15 }, (_, i) => [
      makeSeqRecord('skill-read', `sess-${i}`, 0, `r${i}a`),
      makeSeqRecord('skill-transform', `sess-${i}`, 1, `r${i}b`),
    ]).flat()
    const rule = new ToolSequenceRule({ minSequences: 10, minConfidence: 0.7 })
    const candidates = await rule.infer(makeEngine(records))
    expect(candidates.length).toBeGreaterThan(0)
    const c = candidates.find(c => c.relationship === 'DEPENDS_ON')!
    expect(c).toBeDefined()
    expect(c.inferenceRuleId).toBe('ToolSequenceRule')
  })
})
