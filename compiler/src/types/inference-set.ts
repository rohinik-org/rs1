import type { CapabilityGraphRelationship } from './capability-graph.js'

// Raw execution evidence backing an inference candidate.
// Stored alongside confidence so future rules can recompute the score from evidence alone.
export interface InferenceEvidence {
  readonly executions: number     // total executions considered
  readonly successes: number      // executions with outcome SUCCESS
  readonly failures: number       // executions with outcome FAILED or NO_ROUTE
  readonly sources: number        // distinct project roots observed
}

// A single proposed INFERRED edge.
// Confidence is computed by the rule and stored for reference; promotion never modifies it.
export interface InferenceCandidate {
  readonly source: string                          // nodeId
  readonly target: string                          // nodeId
  readonly relationship: CapabilityGraphRelationship
  readonly confidence: number                      // 0–1; computed by rule; immutable after creation
  readonly inferenceRuleId: string                 // e.g. 'RepeatedDependencyRule'
  readonly evidence: InferenceEvidence
  readonly stableEdgeId: string                    // edge://inferred/<source>/<relationship>/<target>
}

// Immutable artifact produced by the Learning Engine.
// Written to .rohinik/inferences/<inferenceSetId>.json before any promotion occurs.
export interface InferenceSet {
  readonly kind: 'InferenceSet'
  readonly schemaVersion: '1.0'
  readonly inferenceSetId: string                  // UUID
  readonly producedAt: string                      // ISO-8601
  readonly corpusWindow: { readonly start: string; readonly end: string }
  readonly candidates: readonly InferenceCandidate[]
}
