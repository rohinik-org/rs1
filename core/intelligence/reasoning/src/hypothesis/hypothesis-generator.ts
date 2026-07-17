import type { InferenceChain, Hypothesis, HypothesisCategory, EvidenceReference } from '@rohinik-org/compiler'

const RULE_CATEGORY_MAP: Record<string, HypothesisCategory> = {
  ProviderLatencyRule: 'PROVIDER_DEGRADATION',
  CapabilityFailureRule: 'CAPABILITY_FAILURE',
  NetworkCorrelationRule: 'NETWORK_ISSUE',
  PlanningDeficiencyRule: 'PLANNING_DEFICIENCY',
}

export class HypothesisGenerator {
  generate(chains: readonly InferenceChain[]): readonly Hypothesis[] {
    return chains.map(chain => ({
      hypothesisId: chain.outputHypothesisId,
      statement: chain.intermediateConclusions[chain.intermediateConclusions.length - 1] ?? chain.ruleId,
      category: RULE_CATEGORY_MAP[chain.ruleId] ?? 'UNKNOWN',
      confidence: this._baseConfidence(chain),
      supportingEvidence: chain.inputEvidence as readonly EvidenceReference[],
      contradictingEvidence: [],
    }))
  }

  private _baseConfidence(chain: InferenceChain): number {
    const evidenceConf = chain.inputEvidence.length > 0
      ? chain.inputEvidence.reduce((sum, e) => sum + e.confidence, 0) / chain.inputEvidence.length
      : 0.5
    return Math.min(evidenceConf + 0.1, 1.0)
  }
}

export class HypothesisRanker {
  rank(hypotheses: readonly Hypothesis[]): readonly Hypothesis[] {
    return [...hypotheses].sort((a, b) => this._score(b) - this._score(a))
  }

  score(h: Hypothesis): number { return this._score(h) }

  private _score(h: Hypothesis): number {
    const evidenceQuality = h.supportingEvidence.length > 0
      ? h.supportingEvidence.reduce((sum, e) => sum + e.confidence, 0) / h.supportingEvidence.length
      : 1.0
    const artifactCountNorm = Math.min(h.supportingEvidence.length / 3, 1.0)
    const contradictionPenalty = 0.15 * h.contradictingEvidence.length
    return h.confidence * evidenceQuality * artifactCountNorm - contradictionPenalty
  }
}
