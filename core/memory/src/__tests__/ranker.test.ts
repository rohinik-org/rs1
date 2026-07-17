import { describe, it, expect } from 'vitest'
import { MemoryRanker } from '../ranking/memory-ranker.js'
import type { MemoryArtifact, MemoryQuery } from '@rohinik-org/compiler'

function makeArtifact(overrides: Partial<MemoryArtifact> & { recordedAt?: string; outcome?: string; concepts?: string[] } = {}): MemoryArtifact {
  const { recordedAt, outcome, concepts, ...rest } = overrides
  return {
    kind: 'MemoryArtifact',
    artifactId: `art-${Math.random()}`,
    artifactKind: 'EPISODE',
    candidateId: 'c1',
    content: {
      outcome: outcome ?? 'SUCCESS',
      concepts: concepts ?? [],
      recordedAt: recordedAt ?? new Date().toISOString(),
    },
    importanceScore: 1.0,
    consolidatedAt: recordedAt ?? new Date().toISOString(),
    ...rest,
  }
}

describe('MemoryRanker', () => {
  it('SUCCESS artifact ranks higher than FAILED', () => {
    const ranker = new MemoryRanker()
    const query: MemoryQuery = {}
    const success = makeArtifact({ outcome: 'SUCCESS' })
    const failed = makeArtifact({ outcome: 'FAILED' })
    const results = ranker.rank([success, failed], query)
    const successIdx = results.findIndex(r => r.artifact === success)
    const failedIdx = results.findIndex(r => r.artifact === failed)
    expect(successIdx).toBeLessThan(failedIdx)
  })

  it('recent artifact ranks higher than old', () => {
    const ranker = new MemoryRanker()
    const query: MemoryQuery = {}
    const recent = makeArtifact({ recordedAt: new Date().toISOString() })
    const old = makeArtifact({ recordedAt: '2020-01-01T00:00:00.000Z' })
    const results = ranker.rank([old, recent], query)
    const recentIdx = results.findIndex(r => r.artifact === recent)
    const oldIdx = results.findIndex(r => r.artifact === old)
    expect(recentIdx).toBeLessThan(oldIdx)
  })

  it('relevanceScore is in [0, 1]', () => {
    const ranker = new MemoryRanker()
    const results = ranker.rank([makeArtifact(), makeArtifact()], {})
    for (const r of results) {
      expect(r.relevanceScore).toBeGreaterThanOrEqual(0)
      expect(r.relevanceScore).toBeLessThanOrEqual(1)
    }
  })

  it('explanation is non-empty string', () => {
    const ranker = new MemoryRanker()
    const results = ranker.rank([makeArtifact()], {})
    expect(results[0]!.explanation.length).toBeGreaterThan(0)
  })

  it('concept overlap boosts rank', () => {
    const ranker = new MemoryRanker()
    const query: MemoryQuery = { concepts: ['csv'] }
    const matching = makeArtifact({ concepts: ['csv', 'reader'] })
    const noMatch = makeArtifact({ concepts: ['python', 'docker'] })
    const results = ranker.rank([noMatch, matching], query)
    const matchIdx = results.findIndex(r => r.artifact === matching)
    const noIdx = results.findIndex(r => r.artifact === noMatch)
    expect(matchIdx).toBeLessThanOrEqual(noIdx)
  })
})
