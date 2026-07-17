import { describe, it, expect } from 'vitest'
import { RecommendationMerger } from '../merger/recommendation-merger.js'
import { NODES } from './fixtures/small-graph.js'
import type { RecommendationCandidate } from '../strategies/recommendation-strategy.js'

const anchorIds = new Set([NODES.pandas.nodeId])
const merger = new RecommendationMerger()

const makeCandidate = (nodeId: string, strategyId: string, rawScore: number): RecommendationCandidate => ({
  nodeId,
  recommendationType: 'RELATED_CAPABILITY',
  rawScore,
  evidenceSteps: [],
  producedBy: [strategyId],
})

describe('RecommendationMerger', () => {
  it('deduplicates by nodeId, merges producedBy, keeps highest rawScore', () => {
    const a = makeCandidate(NODES.matplotlib.nodeId, 'GraphExpansionStrategy', 0.7)
    const b = makeCandidate(NODES.matplotlib.nodeId, 'CorpusFrequencyStrategy', 0.9)
    const merged = merger.merge([a, b], anchorIds)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.rawScore).toBe(0.9)
    expect(merged[0]!.producedBy).toContain('GraphExpansionStrategy')
    expect(merged[0]!.producedBy).toContain('CorpusFrequencyStrategy')
  })

  it('excludes anchor nodes from output', () => {
    const anchor = makeCandidate(NODES.pandas.nodeId, 'GraphExpansionStrategy', 0.9)
    const other = makeCandidate(NODES.matplotlib.nodeId, 'GraphExpansionStrategy', 0.7)
    const merged = merger.merge([anchor, other], anchorIds)
    expect(merged.map(m => m.nodeId)).not.toContain(NODES.pandas.nodeId)
    expect(merged.map(m => m.nodeId)).toContain(NODES.matplotlib.nodeId)
  })

  it('returns empty for empty input', () => {
    expect(merger.merge([], anchorIds)).toHaveLength(0)
  })

  it('unions evidenceSteps from duplicates', () => {
    const step1 = { fromNodeId: 'a', relationship: 'PRODUCES' as const, toNodeId: 'c', certainty: 'DECLARED' as const, direction: 'OUTGOING' as const }
    const step2 = { fromNodeId: 'b', relationship: 'CONSUMES' as const, toNodeId: 'c', certainty: 'DECLARED' as const, direction: 'OUTGOING' as const }
    const a: RecommendationCandidate = { nodeId: NODES.matplotlib.nodeId, recommendationType: 'RELATED_CAPABILITY', rawScore: 0.7, evidenceSteps: [step1], producedBy: ['A'] }
    const b: RecommendationCandidate = { nodeId: NODES.matplotlib.nodeId, recommendationType: 'RELATED_CAPABILITY', rawScore: 0.6, evidenceSteps: [step2], producedBy: ['B'] }
    const merged = merger.merge([a, b], anchorIds)
    expect(merged[0]!.evidenceSteps).toHaveLength(2)
  })

  it('handles duplicate strategyId in producedBy gracefully', () => {
    const a = makeCandidate(NODES.matplotlib.nodeId, 'GraphExpansionStrategy', 0.7)
    const b = makeCandidate(NODES.matplotlib.nodeId, 'GraphExpansionStrategy', 0.8)
    const merged = merger.merge([a, b], anchorIds)
    // Duplicate strategyId is allowed — producedBy tracks all contributing calls
    expect(merged[0]!.producedBy.length).toBeGreaterThanOrEqual(1)
  })
})
