import type { ObservationQuery } from '@rohinik-org/compiler'
import type { ObservationFacade } from './facade-types.js'
import type { ObservationResult } from '@rohinik-org/observer'
import type { ObservationStore } from '@rohinik-org/observer'
import { ObservationEngine, NullObservationStore, NullObservationSource } from '@rohinik-org/observer'

export class DefaultObservationFacade implements ObservationFacade {
  private readonly engine: ObservationEngine

  constructor(store: ObservationStore = new NullObservationStore()) {
    this.engine = new ObservationEngine([new NullObservationSource()], store)
  }

  observe(query: ObservationQuery): Promise<ObservationResult> {
    return this.engine.observe(query)
  }
}

export class NoopObservationFacade implements ObservationFacade {
  observe(_query: ObservationQuery): Promise<ObservationResult> {
    return Promise.resolve({ observations: [], triggers: [] })
  }
}
