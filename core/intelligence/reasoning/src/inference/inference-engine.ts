import type { EvidenceSet, InferenceChain } from '@rohinik-org/compiler'
import type { InferenceRule } from './inference-rule.js'
import { ProviderLatencyRule, CapabilityFailureRule, NetworkCorrelationRule, PlanningDeficiencyRule } from './inference-rules.js'

const DEFAULT_RULES: readonly InferenceRule[] = [
  new ProviderLatencyRule(),
  new CapabilityFailureRule(),
  new NetworkCorrelationRule(),
  new PlanningDeficiencyRule(),
]

export class InferenceEngine {
  constructor(private readonly rules: readonly InferenceRule[] = DEFAULT_RULES) {}

  run(set: EvidenceSet): readonly InferenceChain[] {
    const chains: InferenceChain[] = []
    const seen = new Set<string>()
    for (const rule of this.rules) {
      for (const chain of rule.apply(set)) {
        if (!seen.has(chain.outputHypothesisId)) {
          seen.add(chain.outputHypothesisId)
          chains.push(chain)
        }
      }
    }
    return chains
  }
}
