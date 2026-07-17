import type { EvidenceSet, InferenceChain } from '@rohinik-org/compiler'

export interface InferenceRule {
  readonly ruleId: string
  apply(set: EvidenceSet): readonly InferenceChain[]
}
