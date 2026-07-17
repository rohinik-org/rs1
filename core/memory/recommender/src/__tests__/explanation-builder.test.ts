import { describe, it, expect } from 'vitest'
import { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import { ExplanationBuilder } from '../ranking/explanation-builder.js'
import { SMALL_GRAPH, NODES } from './fixtures/small-graph.js'
import type { RecommendationCandidate } from '../strategies/recommendation-strategy.js'

const graphQuery = new CapabilityGraphQuery(SMALL_GRAPH)
const builder = new ExplanationBuilder()

const candidateWithSteps: RecommendationCandidate = {
  nodeId: NODES.matplotlib.nodeId,
  recommendationType: 'RELATED_CAPABILITY',
  rawScore: 0.7,
  evidenceSteps: [
    { fromNodeId: NODES.pandas.nodeId, relationship: 'PRODUCES', toNodeId: 'concept://dataframe', certainty: 'DECLARED', direction: 'OUTGOING' },
    { fromNodeId: NODES.matplotlib.nodeId, relationship: 'CONSUMES', toNodeId: 'concept://dataframe', certainty: 'DECLARED', direction: 'OUTGOING' },
  ],
  producedBy: ['GraphExpansionStrategy'],
}

describe('ExplanationBuilder', () => {
  it('builds ExplanationPath with correct step count', () => {
    const path = builder.build(candidateWithSteps, graphQuery)
    expect(path.steps).toHaveLength(2)
    expect(path.evidence.graphTraversal).toBe(true)
    expect(path.evidence.graphEdgeCount).toBe(2)
  })

  it('sets graphTraversal true when steps present', () => {
    const path = builder.build(candidateWithSteps, graphQuery)
    expect(path.evidence.graphTraversal).toBe(true)
  })

  it('does not populate corpus evidence by default', () => {
    const path = builder.build(candidateWithSteps, graphQuery)
    expect(path.evidence.corpus).toBeUndefined()
  })

  it('populates corpus evidence when provided', () => {
    const path = builder.build(candidateWithSteps, graphQuery, { executionCount: 327, coOccurrenceCount: 214 })
    expect(path.evidence.corpus?.executionCount).toBe(327)
    expect(path.evidence.corpus?.coOccurrenceCount).toBe(214)
  })

  it('direction preserved from evidenceSteps', () => {
    const path = builder.build(candidateWithSteps, graphQuery)
    expect(path.steps[0]!.direction).toBe('OUTGOING')
  })

  it('candidate with no steps produces empty path with graphTraversal false', () => {
    const noStepsCandidate: RecommendationCandidate = { ...candidateWithSteps, evidenceSteps: [] }
    const path = builder.build(noStepsCandidate, graphQuery)
    expect(path.steps).toHaveLength(0)
    expect(path.evidence.graphTraversal).toBe(false)
    expect(path.evidence.graphEdgeCount).toBe(0)
  })
})
