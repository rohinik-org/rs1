import { describe, it, expect } from 'vitest'
import { SlidingWindowExtractor } from '../discovery/sliding-window-extractor.js'
import type { ExecutionChain, ExecutionRecord } from '@rohinik-org/compiler'

function chainFromSkills(skillIds: string[]): ExecutionChain {
  const records: ExecutionRecord[] = skillIds.map((skillId, i) => ({
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: `r${i}`, runtimeId: 'rt', timestamp: `2026-01-01T00:00:0${i}Z`,
    requestId: `sess-step${i}`, requestHash: 'h', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerSkillId: skillId, winnerTierId: 'tier1',
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: `sess-step${i}`, runtimeVersion: '1.0.0',
  }))
  return { chainId: 'sess', records, corpusRevision: 0, startedAt: records[0]!.timestamp, completedAt: records[records.length - 1]!.timestamp }
}

describe('SlidingWindowExtractor', () => {
  it('returns empty for single-record chain', () => {
    const extractor = new SlidingWindowExtractor()
    expect(extractor.extract(chainFromSkills(['a']), 4)).toHaveLength(0)
  })

  it('extracts length-2 subsequence from 2-record chain', () => {
    const extractor = new SlidingWindowExtractor()
    const result = extractor.extract(chainFromSkills(['a', 'b']), 4)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(2)
    expect(result[0]![0]!.skillId).toBe('a')
    expect(result[0]![1]!.skillId).toBe('b')
  })

  it('extracts all subsequences of length 2 to maxLength from 4-record chain', () => {
    // chain: a, b, c, d
    // length-2: [a,b],[b,c],[c,d] = 3
    // length-3: [a,b,c],[b,c,d]   = 2
    // length-4: [a,b,c,d]         = 1
    // total = 6
    const extractor = new SlidingWindowExtractor()
    const result = extractor.extract(chainFromSkills(['a', 'b', 'c', 'd']), 4)
    expect(result).toHaveLength(6)
  })

  it('respects maxLength cap', () => {
    // chain: a, b, c, d; maxLength=2
    // only length-2: [a,b],[b,c],[c,d] = 3
    const extractor = new SlidingWindowExtractor()
    const result = extractor.extract(chainFromSkills(['a', 'b', 'c', 'd']), 2)
    expect(result).toHaveLength(3)
    for (const seq of result) expect(seq).toHaveLength(2)
  })

  it('assigns correct position values starting from 0', () => {
    const extractor = new SlidingWindowExtractor()
    const result = extractor.extract(chainFromSkills(['x', 'y']), 4)
    expect(result[0]![0]!.position).toBe(0)
    expect(result[0]![1]!.position).toBe(1)
  })

  it('populates statistics.executionCount = 1 per step in extracted sequence', () => {
    const extractor = new SlidingWindowExtractor()
    const result = extractor.extract(chainFromSkills(['a', 'b']), 4)
    expect(result[0]![0]!.statistics.executionCount).toBe(1)
  })
})
