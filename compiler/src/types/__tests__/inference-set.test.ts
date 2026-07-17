import { describe, it, expectTypeOf } from 'vitest'
import type { InferenceSet, InferenceCandidate, InferenceEvidence } from '../inference-set.js'
import type { InferencePromotion } from '../inference-promotion.js'

describe('InferenceSet IR types', () => {
  it('InferenceEvidence has raw evidence fields', () => {
    expectTypeOf<InferenceEvidence>().toHaveProperty('executions')
    expectTypeOf<InferenceEvidence>().toHaveProperty('successes')
    expectTypeOf<InferenceEvidence>().toHaveProperty('failures')
    expectTypeOf<InferenceEvidence>().toHaveProperty('sources')
  })

  it('InferenceCandidate has all required fields', () => {
    expectTypeOf<InferenceCandidate>().toHaveProperty('source')
    expectTypeOf<InferenceCandidate>().toHaveProperty('target')
    expectTypeOf<InferenceCandidate>().toHaveProperty('relationship')
    expectTypeOf<InferenceCandidate>().toHaveProperty('confidence')
    expectTypeOf<InferenceCandidate>().toHaveProperty('inferenceRuleId')
    expectTypeOf<InferenceCandidate>().toHaveProperty('evidence')
    expectTypeOf<InferenceCandidate>().toHaveProperty('stableEdgeId')
  })

  it('InferenceSet is immutable artifact', () => {
    expectTypeOf<InferenceSet>().toHaveProperty('kind')
    expectTypeOf<InferenceSet>().toHaveProperty('schemaVersion')
    expectTypeOf<InferenceSet>().toHaveProperty('inferenceSetId')
    expectTypeOf<InferenceSet>().toHaveProperty('corpusWindow')
    expectTypeOf<InferenceSet>().toHaveProperty('candidates')
  })

  it('InferencePromotion records promotion decision', () => {
    expectTypeOf<InferencePromotion>().toHaveProperty('kind')
    expectTypeOf<InferencePromotion>().toHaveProperty('inferenceSetId')
    expectTypeOf<InferencePromotion>().toHaveProperty('promotedEdges')
    expectTypeOf<InferencePromotion>().toHaveProperty('rejectedCandidates')
    expectTypeOf<InferencePromotion>().toHaveProperty('thresholdUsed')
    expectTypeOf<InferencePromotion>().toHaveProperty('graphRevisionBefore')
    expectTypeOf<InferencePromotion>().toHaveProperty('graphRevisionAfter')
  })
})
