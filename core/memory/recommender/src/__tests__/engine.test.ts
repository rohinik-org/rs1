import { describe, it, expect, vi } from 'vitest'
import { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import { RecommendationEngine } from '../engine/recommendation-engine.js'
import { GraphExpansionStrategy } from '../strategies/graph-expansion.js'
import { AlternativeStrategy } from '../strategies/alternatives.js'
import { CompanionToolStrategy } from '../strategies/companion-tools.js'
import { CorpusFrequencyStrategy } from '../strategies/corpus-frequency.js'
import { RecommendationMerger } from '../merger/recommendation-merger.js'
import { RecommendationRanker } from '../ranking/recommendation-ranker.js'
import { ExplanationBuilder } from '../ranking/explanation-builder.js'
import { NullRecommendationStore } from '../store/null-store.js'
import { DefaultRecommendationPolicy } from '../policy/recommendation-policy.js'
import { SMALL_GRAPH, NODES } from './fixtures/small-graph.js'
import { LARGE_GRAPH } from './fixtures/large-graph.js'

const graphQuery = new CapabilityGraphQuery(SMALL_GRAPH)
const largeQuery = new CapabilityGraphQuery(LARGE_GRAPH)
const stubCorpus = { query: async () => [], stats: async () => ({ total: 0, successRate: 0, latencyPercentiles: {}, reasoningInvokedRate: 0, topSkills: [], topProviders: [] }) } as unknown as import('@rohinik-org/corpus').CorpusQueryEngine

function makeEngine(store = new NullRecommendationStore()) {
  return new RecommendationEngine({
    strategies: [new GraphExpansionStrategy(), new AlternativeStrategy(), new CompanionToolStrategy(), new CorpusFrequencyStrategy()],
    merger: new RecommendationMerger(),
    ranker: new RecommendationRanker(),
    explanationBuilder: new ExplanationBuilder(),
    store,
    policy: new DefaultRecommendationPolicy(),
  })
}

describe('RecommendationEngine', () => {
  it('returns RecommendationResult with correct shape', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(result.kind).toBe('RecommendationResult')
    expect(result.schemaVersion).toBe('1.0')
    expect(result.recommendationId).toHaveLength(64)
    expect(result.anchors).toContain(NODES.pandas.nodeId)
    expect(result.graphRevision).toBe(SMALL_GRAPH.revision)
  })

  it('recommendations do not contain anchor nodes', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    for (const rec of result.recommendations) {
      expect(rec.nodeId).not.toBe(NODES.pandas.nodeId)
    }
  })

  it('determinism: two calls with same inputs produce identical recommendationId', async () => {
    const engine = makeEngine()
    const r1 = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    const r2 = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(r1.recommendationId).toBe(r2.recommendationId)
    expect(r1.recommendations.map(r => r.nodeId)).toEqual(r2.recommendations.map(r => r.nodeId))
  })

  it('idempotence: three calls produce same result, no state mutation', async () => {
    const engine = makeEngine()
    const r1 = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    const r3 = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(r1.recommendationId).toBe(r3.recommendationId)
  })

  it('NullRecommendationStore.save() called once per recommend()', async () => {
    const store = new NullRecommendationStore()
    const saveSpy = vi.spyOn(store, 'save')
    const engine = makeEngine(store)
    await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('anchor with no outgoing edges returns valid empty result', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.ghCli], graphQuery, stubCorpus)
    expect(result.kind).toBe('RecommendationResult')
    expect(result.recommendations).toHaveLength(0)
  })

  it('empty corpus: graph-only strategies still return valid result', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(result.kind).toBe('RecommendationResult')
    expect(result.recommendations.length).toBeGreaterThan(0)
  })

  it('failing strategy is isolated: engine still returns from other strategies', async () => {
    const failingStrategy = {
      strategyId: 'FailingStrategy',
      recommendationTypes: ['RELATED_CAPABILITY' as const],
      recommend: async () => { throw new Error('deliberate failure') },
    }
    const engine = new RecommendationEngine({
      strategies: [failingStrategy, new AlternativeStrategy()],
      merger: new RecommendationMerger(),
      ranker: new RecommendationRanker(),
      explanationBuilder: new ExplanationBuilder(),
      store: new NullRecommendationStore(),
      policy: new DefaultRecommendationPolicy(),
    })
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(result.kind).toBe('RecommendationResult')
    // AlternativeStrategy still runs; numpy is an ALTERNATIVE for pandas
    expect(result.recommendations.some(r => r.nodeId === NODES.numpy.nodeId)).toBe(true)
  })

  it('performance: large graph completes in under 150ms', async () => {
    const engine = makeEngine()
    const start = performance.now()
    await engine.recommend([{ nodeId: 'rohinik://graph/capability/skill-0', nodeKind: 'CAPABILITY', name: 'skill-0', displayName: 'skill-0', tags: [], metadata: {}, addedAt: '' }], largeQuery, stubCorpus)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(150)
  }, 5000)
})
