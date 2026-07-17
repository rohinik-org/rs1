import type { AgentResult, ConsensusDecision, CompositeInference } from '@rohinik-org/compiler'

let _counter = 0
function nextId(): string { return `ci-${++_counter}` }

export class ResultMerger {
  merge(results: readonly AgentResult[], decision: ConsensusDecision): CompositeInference {
    return {
      compositeId: nextId(),
      sessionId: decision.decisionId,
      mergedInferenceChainIds: results.map(r => r.inferenceChainId),
      mergedAt: new Date().toISOString(),
    }
  }
}
