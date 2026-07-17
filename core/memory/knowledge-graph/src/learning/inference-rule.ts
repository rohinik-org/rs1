import type { InferenceCandidate } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'

// Same plug-in pattern as GraphContributor.
// Each rule is independently testable: it receives only the CorpusQueryEngine and
// an optional corpus window, and returns zero or more InferenceCandidates.
export interface InferenceRule {
  readonly ruleId: string
  infer(
    corpus: CorpusQueryEngine,
    window?: { start: string; end: string },
  ): Promise<readonly InferenceCandidate[]>
}
