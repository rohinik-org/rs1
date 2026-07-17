import { describe, it, expect } from 'vitest'
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

const graphQuery = new CapabilityGraphQuery(SMALL_GRAPH)
const stubCorpus = {
  query: async () => [],
  stats: async () => ({ total: 0, successRate: 0, latencyPercentiles: {}, reasoningInvokedRate: 0, topSkills: [], topProviders: [] }),
} as unknown as import('@rohinik-org/corpus').CorpusQueryEngine

function makeEngine() {
  return new RecommendationEngine({
    strategies: [new GraphExpansionStrategy(), new AlternativeStrategy(), new CompanionToolStrategy(), new CorpusFrequencyStrategy()],
    merger: new RecommendationMerger(),
    ranker: new RecommendationRanker(),
    explanationBuilder: new ExplanationBuilder(),
    store: new NullRecommendationStore(),
    policy: new DefaultRecommendationPolicy({ maxResults: 10 }),
  })
}

describe('Multi-anchor recommendations', () => {
  it('csv + python anchors produce union without duplicates', async () => {
    const engine = makeEngine()
    // Use concept node (dataframe consumer) + python (has RECOMMENDS edge)
    const result = await engine.recommend([NODES.dfConcept, NODES.python], graphQuery, stubCorpus)
    const ids = result.recommendations.map(r => r.nodeId)
    // No duplicates
    expect(new Set(ids).size).toBe(ids.length)
    // Anchors not in output
    expect(ids).not.toContain(NODES.dfConcept.nodeId)
    expect(ids).not.toContain(NODES.python.nodeId)
  })
})

describe('Golden test — pandas ecosystem', () => {
  it('matplotlib is recommended from pandas (shared dataframe concept)', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    const ids = result.recommendations.map(r => r.nodeId)
    expect(ids).toContain(NODES.matplotlib.nodeId)
  })

  it('numpy is recommended from pandas (shared dataframe concept)', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    const ids = result.recommendations.map(r => r.nodeId)
    expect(ids).toContain(NODES.numpy.nodeId)
  })

  it('every recommendation has non-empty explanation or empty steps (corpus-only)', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    for (const rec of result.recommendations) {
      // Completeness invariant: explanation must be present
      expect(rec.explanation).toBeDefined()
      expect(rec.explanation.evidence).toBeDefined()
    }
  })

  it('RecommendationResult includes graphRevision', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(result.graphRevision).toBe(SMALL_GRAPH.revision)
  })
})

describe('Explanation completeness invariant', () => {
  it('all evidenceSteps reference valid relationships', async () => {
    const engine = makeEngine()
    const result = await engine.recommend([NODES.pandas], graphQuery, stubCorpus)
    const validRelationships = new Set(SMALL_GRAPH.edges.map(e => e.relationship))
    for (const rec of result.recommendations) {
      for (const step of rec.explanation.steps) {
        expect(validRelationships.has(step.relationship)).toBe(true)
      }
    }
  })
})
