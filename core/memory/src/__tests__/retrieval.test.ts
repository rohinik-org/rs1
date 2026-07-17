import { describe, it, expect, beforeEach } from 'vitest'
import { RetrievalEngine } from '../retrieval/retrieval-engine.js'
import { NullMemoryStore } from '../store/null-memory-store.js'
import { MemoryRanker } from '../ranking/memory-ranker.js'
import type { MemoryArtifact } from '@rohinik-org/compiler'

function makeArtifact(id: string, concepts: string[], outcome: string): MemoryArtifact {
  return {
    kind: 'MemoryArtifact',
    artifactId: id,
    artifactKind: 'EPISODE',
    candidateId: id,
    content: { concepts, outcome, recordedAt: new Date().toISOString() },
    importanceScore: 1.0,
    consolidatedAt: new Date().toISOString(),
  }
}

describe('RetrievalEngine', () => {
  let store: NullMemoryStore
  let engine: RetrievalEngine

  beforeEach(() => {
    store = new NullMemoryStore()
    engine = new RetrievalEngine(store, new MemoryRanker())
  })

  it('empty store returns empty array', async () => {
    const results = await engine.recall({ concepts: ['csv'] })
    expect(results).toHaveLength(0)
  })

  it('recall by concept finds matching artifact', async () => {
    await store.saveArtifact(makeArtifact('a1', ['csv', 'reader'], 'SUCCESS'))
    await store.saveArtifact(makeArtifact('a2', ['python', 'docker'], 'SUCCESS'))
    const results = await engine.recall({ concepts: ['csv'] })
    expect(results.some(r => r.artifact.artifactId === 'a1')).toBe(true)
  })

  it('outcomeFilter SUCCESS filters out FAILED artifacts', async () => {
    await store.saveArtifact(makeArtifact('ok', ['csv'], 'SUCCESS'))
    await store.saveArtifact(makeArtifact('fail', ['csv'], 'FAILED'))
    const results = await engine.recall({ concepts: ['csv'], outcomeFilter: 'SUCCESS' })
    expect(results.every(r => (r.artifact.content as Record<string, unknown>).outcome === 'SUCCESS')).toBe(true)
  })

  it('limit is respected', async () => {
    for (let i = 0; i < 5; i++) {
      await store.saveArtifact(makeArtifact(`a${i}`, ['csv'], 'SUCCESS'))
    }
    const results = await engine.recall({ limit: 2 })
    expect(results).toHaveLength(2)
  })

  it('results are in ranked order (first has highest relevanceScore)', async () => {
    await store.saveArtifact(makeArtifact('old', ['csv'], 'FAILED'))
    await store.saveArtifact(makeArtifact('new-success', ['csv'], 'SUCCESS'))
    const results = await engine.recall({ concepts: ['csv'] })
    expect(results.length).toBeGreaterThan(1)
    expect(results[0]!.relevanceScore).toBeGreaterThanOrEqual(results[results.length - 1]!.relevanceScore)
  })
})
