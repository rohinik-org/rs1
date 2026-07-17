import { describe, it, expect } from 'vitest'
import { RecommendationRanker } from '../ranking/recommendation-ranker.js'
import { DefaultRecommendationPolicy } from '../policy/recommendation-policy.js'
import { NODES } from './fixtures/small-graph.js'
import type { RecommendationCandidate } from '../strategies/recommendation-strategy.js'

const policy = new DefaultRecommendationPolicy()
const ranker = new RecommendationRanker()

function makeCandidate(nodeId: string, rawScore: number, type: import('@rohinik-org/compiler').RecommendationType = 'RELATED_CAPABILITY'): RecommendationCandidate {
  return { nodeId, recommendationType: type, rawScore, evidenceSteps: [], producedBy: ['TestStrategy'] }
}

describe('RecommendationRanker', () => {
  it('sorts higher rawScore first', () => {
    const input = [
      makeCandidate(NODES.matplotlib.nodeId, 0.5),
      makeCandidate(NODES.numpy.nodeId, 0.9),
      makeCandidate(NODES.jupyter.nodeId, 0.7),
    ]
    const ranked = ranker.rank(input, policy)
    expect(ranked[0]!.nodeId).toBe(NODES.numpy.nodeId)
    expect(ranked[1]!.nodeId).toBe(NODES.jupyter.nodeId)
  })

  it('stable tie-break: equal scores sorted by nodeId lexicographically', () => {
    const a = makeCandidate('rohinik://graph/capability/zzz', 0.8)
    const b = makeCandidate('rohinik://graph/capability/aaa', 0.8)
    const ranked = ranker.rank([a, b], policy)
    expect(ranked[0]!.nodeId).toBe('rohinik://graph/capability/aaa')
  })

  it('filters out candidates below minScore', () => {
    const strictPolicy = new DefaultRecommendationPolicy({ minScore: 0.8 })
    const input = [makeCandidate(NODES.matplotlib.nodeId, 0.5), makeCandidate(NODES.numpy.nodeId, 0.9)]
    const ranked = ranker.rank(input, strictPolicy)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.nodeId).toBe(NODES.numpy.nodeId)
  })

  it('caps output at maxResults', () => {
    const smallPolicy = new DefaultRecommendationPolicy({ maxResults: 2 })
    const input = [
      makeCandidate(NODES.matplotlib.nodeId, 0.9),
      makeCandidate(NODES.numpy.nodeId, 0.8),
      makeCandidate(NODES.jupyter.nodeId, 0.7),
    ]
    const ranked = ranker.rank(input, smallPolicy)
    expect(ranked).toHaveLength(2)
  })

  it('output count never exceeds input count', () => {
    const input = [makeCandidate(NODES.matplotlib.nodeId, 0.9)]
    const ranked = ranker.rank(input, policy)
    expect(ranked.length).toBeLessThanOrEqual(input.length)
  })

  it('never produces new candidates (output count <= input count)', () => {
    const input = [makeCandidate(NODES.matplotlib.nodeId, 0.9), makeCandidate(NODES.numpy.nodeId, 0.7)]
    const ranked = ranker.rank(input, policy)
    expect(ranked.length).toBeLessThanOrEqual(2)
  })

  it('allowedTypes filters wrong types', () => {
    const altOnlyPolicy = new DefaultRecommendationPolicy({ allowedTypes: ['ALTERNATIVE'] })
    const input = [
      makeCandidate(NODES.matplotlib.nodeId, 0.9, 'RELATED_CAPABILITY'),
      makeCandidate(NODES.numpy.nodeId, 0.8, 'ALTERNATIVE'),
    ]
    const ranked = ranker.rank(input, altOnlyPolicy)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.recommendationType).toBe('ALTERNATIVE')
  })
})
