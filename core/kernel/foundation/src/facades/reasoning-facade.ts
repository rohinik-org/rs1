import type { ReasoningReport } from '@rohinik-org/compiler'
import type { ReasoningFacade } from './facade-types.js'
import type { EvidenceInput } from '@rohinik-org/reasoning'
import type { ReasoningStore } from '@rohinik-org/reasoning'
import { ReasoningEngine, NullReasoningStore } from '@rohinik-org/reasoning'

export class DefaultReasoningFacade implements ReasoningFacade {
  private readonly engine: ReasoningEngine

  constructor(store: ReasoningStore = new NullReasoningStore()) {
    this.engine = new ReasoningEngine(store)
  }

  reason(input: EvidenceInput): Promise<ReasoningReport> {
    return this.engine.reason(input)
  }
}

export class NoopReasoningFacade implements ReasoningFacade {
  reason(_input: EvidenceInput): Promise<ReasoningReport> {
    return Promise.resolve({
      kind: 'ReasoningReport', schemaVersion: '1.0',
      reportId: '', generatedAt: new Date().toISOString(),
      hypothesisSet: [], selectedHypothesis: '',
      recommendationSet: [], evidenceGraph: [], inferenceChains: [],
      status: 'REJECTED',
    })
  }
}
