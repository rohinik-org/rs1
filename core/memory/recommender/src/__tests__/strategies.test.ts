import { describe, it, expect, vi } from 'vitest'
import { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import { GraphExpansionStrategy } from '../strategies/graph-expansion.js'
import { AlternativeStrategy } from '../strategies/alternatives.js'
import { CompanionToolStrategy } from '../strategies/companion-tools.js'
import { CorpusFrequencyStrategy } from '../strategies/corpus-frequency.js'
import { SMALL_GRAPH, NODES } from './fixtures/small-graph.js'

const graph = SMALL_GRAPH
const graphQuery = new CapabilityGraphQuery(graph)
const stubCorpus = { query: async () => [], stats: async () => ({ total: 0, successRate: 0, latencyPercentiles: {}, reasoningInvokedRate: 0, topSkills: [], topProviders: [] }) } as unknown as import('@rohinik-org/corpus').CorpusQueryEngine

describe('GraphExpansionStrategy', () => {
  const strategy = new GraphExpansionStrategy()

  it('has correct strategyId and recommendationTypes', () => {
    expect(strategy.strategyId).toBe('GraphExpansionStrategy')
    expect(strategy.recommendationTypes).toContain('RELATED_CAPABILITY')
  })

  it('finds matplotlib and numpy as RELATED_CAPABILITY from pandas (shared dataframe concept)', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    const ids = candidates.map(c => c.nodeId)
    expect(ids).toContain(NODES.matplotlib.nodeId)
    expect(ids).toContain(NODES.numpy.nodeId)
  })

  it('never returns anchor node itself', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(candidates.map(c => c.nodeId)).not.toContain(NODES.pandas.nodeId)
  })

  it('produces RELATED_CAPABILITY type', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    for (const c of candidates) expect(c.recommendationType).toBe('RELATED_CAPABILITY')
  })

  it('all evidenceSteps have direction field', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    for (const c of candidates) {
      for (const s of c.evidenceSteps) {
        expect(['OUTGOING', 'INCOMING']).toContain(s.direction)
      }
    }
  })

  it('returns empty array for node with no PRODUCES/CONSUMES edges', async () => {
    const candidates = await strategy.recommend([NODES.ghCli], graphQuery, stubCorpus)
    expect(candidates).toHaveLength(0)
  })

  it('never mutates graph (graph edges unchanged after call)', async () => {
    const edgeBefore = graph.edgeCount
    await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(graph.edgeCount).toBe(edgeBefore)
  })
})

describe('AlternativeStrategy', () => {
  const strategy = new AlternativeStrategy()

  it('has correct strategyId', () => {
    expect(strategy.strategyId).toBe('AlternativeStrategy')
  })

  it('finds numpy as ALTERNATIVE from pandas', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(candidates.map(c => c.nodeId)).toContain(NODES.numpy.nodeId)
  })

  it('produces ALTERNATIVE type', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    for (const c of candidates) expect(c.recommendationType).toBe('ALTERNATIVE')
  })

  it('returns empty for node with no ALTERNATIVE_TO edges', async () => {
    const candidates = await strategy.recommend([NODES.jupyter], graphQuery, stubCorpus)
    expect(candidates).toHaveLength(0)
  })
})

describe('CompanionToolStrategy', () => {
  const strategy = new CompanionToolStrategy()

  it('has correct strategyId', () => {
    expect(strategy.strategyId).toBe('CompanionToolStrategy')
  })

  it('finds jupyter as COMPANION_TOOL from python (RECOMMENDS edge)', async () => {
    const candidates = await strategy.recommend([NODES.python], graphQuery, stubCorpus)
    expect(candidates.map(c => c.nodeId)).toContain(NODES.jupyter.nodeId)
  })

  it('produces COMPANION_TOOL type', async () => {
    const candidates = await strategy.recommend([NODES.python], graphQuery, stubCorpus)
    for (const c of candidates) expect(c.recommendationType).toBe('COMPANION_TOOL')
  })

  it('returns empty for node with no RECOMMENDS edges', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(candidates).toHaveLength(0)
  })
})

describe('CorpusFrequencyStrategy', () => {
  const strategy = new CorpusFrequencyStrategy()

  it('has correct strategyId', () => {
    expect(strategy.strategyId).toBe('CorpusFrequencyStrategy')
  })

  it('returns RELATED_CAPABILITY from topSkills co-occurrence', async () => {
    const corpusWithStats = {
      stats: async () => ({
        total: 100, successRate: 0.9, latencyPercentiles: {},
        reasoningInvokedRate: 0.1,
        topSkills: [
          { skillId: NODES.pandas.nodeId, count: 50 },
          { skillId: NODES.matplotlib.nodeId, count: 40 },
          { skillId: NODES.numpy.nodeId, count: 30 },
        ],
        topProviders: [],
      }),
    } as unknown as import('@rohinik-org/corpus').CorpusQueryEngine

    const candidates = await strategy.recommend([NODES.pandas], graphQuery, corpusWithStats)
    const ids = candidates.map(c => c.nodeId)
    expect(ids).toContain(NODES.matplotlib.nodeId)
    expect(ids).toContain(NODES.numpy.nodeId)
    for (const c of candidates) expect(c.recommendationType).toBe('RELATED_CAPABILITY')
  })

  it('returns empty when corpus is empty', async () => {
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, stubCorpus)
    expect(candidates).toHaveLength(0)
  })

  it('never returns anchor in candidates', async () => {
    const corpusWithAnchor = {
      stats: async () => ({
        total: 10, successRate: 1, latencyPercentiles: {}, reasoningInvokedRate: 0,
        topSkills: [{ skillId: NODES.pandas.nodeId, count: 10 }],
        topProviders: [],
      }),
    } as unknown as import('@rohinik-org/corpus').CorpusQueryEngine
    const candidates = await strategy.recommend([NODES.pandas], graphQuery, corpusWithAnchor)
    expect(candidates.map(c => c.nodeId)).not.toContain(NODES.pandas.nodeId)
  })
})
