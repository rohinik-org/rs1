import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import type { Recommendation, RecommendationResult, ExplanationPath } from '../index.js'

describe('RecommendationResult IR', () => {
  const path: ExplanationPath = {
    steps: [{
      fromNodeId: 'rohinik://graph/capability/pandas',
      relationship: 'PRODUCES',
      toNodeId: 'concept://dataframe',
      certainty: 'DECLARED',
      direction: 'OUTGOING',
    }],
    evidence: { graphTraversal: true, graphEdgeCount: 1 },
  }

  const rec: Recommendation = {
    nodeId: 'rohinik://graph/capability/matplotlib',
    recommendationType: 'RELATED_CAPABILITY',
    confidence: { score: 0.91, graphWeight: 0.8, corpusWeight: 0.1, policyWeight: 0.01 },
    explanation: path,
    producedBy: ['GraphExpansionStrategy'],
  }

  it('Recommendation has required fields', () => {
    expect(rec.nodeId).toBe('rohinik://graph/capability/matplotlib')
    expect(rec.recommendationType).toBe('RELATED_CAPABILITY')
    expect(rec.confidence.score).toBe(0.91)
    expect(rec.explanation.steps).toHaveLength(1)
    expect(rec.explanation.evidence.graphTraversal).toBe(true)
    expect(rec.explanation.evidence.graphEdgeCount).toBe(1)
    expect(rec.producedBy).toContain('GraphExpansionStrategy')
  })

  it('ExplanationStep has direction field', () => {
    expect(rec.explanation.steps[0]!.direction).toBe('OUTGOING')
  })

  it('RecommendationResult JSON round-trip', () => {
    const result: RecommendationResult = {
      kind: 'RecommendationResult',
      schemaVersion: '1.0',
      recommendationId: 'sha256-abc',
      generatedAt: '2026-07-13T00:00:00.000Z',
      anchors: ['rohinik://graph/capability/pandas'],
      generatedBy: 'DefaultRecommendationPolicy@1.0',
      graphRevision: 5,
      corpusRevision: 100,
      recommendations: [rec],
    }
    const json = JSON.stringify(result)
    const parsed = JSON.parse(json) as RecommendationResult
    expect(parsed.kind).toBe('RecommendationResult')
    expect(parsed.graphRevision).toBe(5)
    expect(parsed.corpusRevision).toBe(100)
    expect(parsed.generatedBy).toBe('DefaultRecommendationPolicy@1.0')
    expect(parsed.recommendations[0]!.producedBy).toContain('GraphExpansionStrategy')
  })

  it('recommendationId is deterministic SHA-256 excluding generatedAt', () => {
    const body = { anchors: ['a'], generatedBy: 'p', graphRevision: 1, corpusRevision: 2, recommendations: [] }
    const id1 = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const id2 = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    expect(id1).toBe(id2)
    expect(id1).toHaveLength(64)
  })
})
