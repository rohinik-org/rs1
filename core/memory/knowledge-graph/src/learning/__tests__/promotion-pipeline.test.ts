import { describe, it, expect } from 'vitest'
import { PromotionPipeline } from '../promotion-pipeline.js'
import { AutoApprovalPolicy } from '../review-policy.js'
import type { InferenceSet } from '@rohinik-org/compiler'

const makeSet = (confidence: number): InferenceSet => ({
  kind: 'InferenceSet', schemaVersion: '1.0',
  inferenceSetId: 'set-1', producedAt: '2026-07-11T00:00:00Z',
  corpusWindow: { start: '2026-01-01', end: '2026-07-11' },
  candidates: [{
    source: 'rohinik://graph/capability/skill-a',
    target: 'rohinik://graph/provider/anthropic',
    relationship: 'USES_PROVIDER', confidence,
    inferenceRuleId: 'TestRule',
    evidence: { executions: 20, successes: 17, failures: 3, sources: 1 },
    stableEdgeId: 'edge://inferred/rohinik://graph/capability/skill-a/USES_PROVIDER/rohinik://graph/provider/anthropic',
  }],
})

describe('PromotionPipeline', () => {
  it('promotes candidates above threshold', async () => {
    const policy = new AutoApprovalPolicy(0.7)
    const pipeline = new PromotionPipeline(policy)
    const set = makeSet(0.85)
    const promotion = await pipeline.promote(set, 0, 1)
    expect(promotion.kind).toBe('InferencePromotion')
    expect(promotion.promotedEdges).toHaveLength(1)
    expect(promotion.rejectedCandidates).toHaveLength(0)
    expect(promotion.thresholdUsed).toBe(0.7)
  })

  it('rejects candidates below threshold', async () => {
    const policy = new AutoApprovalPolicy(0.7)
    const pipeline = new PromotionPipeline(policy)
    const set = makeSet(0.5)
    const promotion = await pipeline.promote(set, 0, 1)
    expect(promotion.promotedEdges).toHaveLength(0)
    expect(promotion.rejectedCandidates).toHaveLength(1)
  })

  it('is deterministic — same inputs produce same edges', async () => {
    const policy = new AutoApprovalPolicy(0.7)
    const pipeline = new PromotionPipeline(policy)
    const set = makeSet(0.85)
    const p1 = await pipeline.promote(set, 0, 1)
    const p2 = await pipeline.promote(set, 0, 1)
    expect(p1.promotedEdges[0]!.edgeId).toBe(p2.promotedEdges[0]!.edgeId)
  })

  it('never increases confidence during promotion', async () => {
    const policy = new AutoApprovalPolicy(0.7)
    const pipeline = new PromotionPipeline(policy)
    const set = makeSet(0.72)
    const promotion = await pipeline.promote(set, 0, 1)
    expect(promotion.promotedEdges[0]!.confidence).toBe(0.72)
  })

  it('populates inference provenance fields on promoted edges', async () => {
    const policy = new AutoApprovalPolicy(0.7)
    const pipeline = new PromotionPipeline(policy)
    const set = makeSet(0.85)
    const promotion = await pipeline.promote(set, 0, 1)
    const edge = promotion.promotedEdges[0]!
    expect(edge.originInferenceId).toBe('set-1')
    expect(edge.originRule).toBe('TestRule')
    expect(edge.evidenceSampleSize).toBe(20)
    expect(edge.evidenceCount).toBe(17)
  })
})
