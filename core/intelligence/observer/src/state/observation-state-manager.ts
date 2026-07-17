import type { Observation, ObservationState } from '@rohinik-org/compiler'
import type { ObservationStore } from '../store/observation-store.js'

export class ObservationStateManager {
  constructor(private readonly store: ObservationStore) {}

  async activate(observation: Observation): Promise<ObservationState> {
    const state: ObservationState = {
      observationId: observation.observationId,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    }
    await this.store.saveState(state)
    return state
  }

  async expire(observationId: string): Promise<void> {
    await this.store.saveState({ observationId, status: 'EXPIRED', updatedAt: new Date().toISOString() })
  }

  async supersede(observationId: string): Promise<void> {
    await this.store.saveState({ observationId, status: 'SUPERSEDED', updatedAt: new Date().toISOString() })
  }

  async isExpired(observation: Observation): Promise<boolean> {
    if (!observation.ttlSeconds) return false
    const age = (Date.now() - new Date(observation.observedAt).getTime()) / 1000
    return age > observation.ttlSeconds
  }
}
