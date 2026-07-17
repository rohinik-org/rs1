import type { Observation, ObservationCategory, ObservationState } from '@rohinik-org/compiler'

export interface ObservationStore {
  save(observation: Observation): Promise<void>
  load(observationId: string): Promise<Observation | undefined>
  list(category?: ObservationCategory): Promise<Observation[]>
  saveState(state: ObservationState): Promise<void>
  loadState(observationId: string): Promise<ObservationState | undefined>
}

export class NullObservationStore implements ObservationStore {
  async save(_o: Observation): Promise<void> {}
  async load(_id: string): Promise<Observation | undefined> { return undefined }
  async list(_category?: ObservationCategory): Promise<Observation[]> { return [] }
  async saveState(_s: ObservationState): Promise<void> {}
  async loadState(_id: string): Promise<ObservationState | undefined> { return undefined }
}

export class InMemoryObservationStore implements ObservationStore {
  private readonly obs = new Map<string, Observation>()
  private readonly states = new Map<string, ObservationState>()

  async save(o: Observation): Promise<void> { this.obs.set(o.observationId, o) }
  async load(id: string): Promise<Observation | undefined> { return this.obs.get(id) }
  async list(category?: ObservationCategory): Promise<Observation[]> {
    const all = [...this.obs.values()]
    return category ? all.filter(o => o.category === category) : all
  }
  async saveState(s: ObservationState): Promise<void> { this.states.set(s.observationId, s) }
  async loadState(id: string): Promise<ObservationState | undefined> { return this.states.get(id) }
}
