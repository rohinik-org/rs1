import type { Observation, ObservationCategory, ObservationQuery } from '@rohinik-org/compiler'

export interface ObservationSource {
  readonly sourceId: string
  readonly category: ObservationCategory
  observe(query: ObservationQuery): Promise<readonly Observation[]>
}

export class NullObservationSource implements ObservationSource {
  readonly sourceId = 'null'
  readonly category: ObservationCategory = 'SYSTEM'
  async observe(_query: ObservationQuery): Promise<readonly Observation[]> { return [] }
}
