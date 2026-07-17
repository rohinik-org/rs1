import type { Observation, ObservationQuery, LearningTrigger, ObservationPolicy } from '@rohinik-org/compiler'
import { DEFAULT_OBSERVATION_POLICY } from '@rohinik-org/compiler'
import type { ObservationSource } from '../sources/observation-source.js'
import type { ObservationStore } from '../store/observation-store.js'
import { ObservationStateManager } from '../state/observation-state-manager.js'
import { ObservationPolicyEngine } from '../policy/observation-policy-engine.js'

export interface ObservationResult {
  readonly observations: readonly Observation[]
  readonly triggers: readonly LearningTrigger[]
}

export class ObservationEngine {
  private readonly stateMgr: ObservationStateManager
  private readonly policyEngine: ObservationPolicyEngine

  constructor(
    private readonly sources: readonly ObservationSource[],
    private readonly store: ObservationStore,
    policy: ObservationPolicy = DEFAULT_OBSERVATION_POLICY,
  ) {
    this.stateMgr = new ObservationStateManager(store)
    this.policyEngine = new ObservationPolicyEngine(policy)
  }

  async observe(query: ObservationQuery): Promise<ObservationResult> {
    const observations: Observation[] = []
    const triggers: LearningTrigger[] = []

    for (const source of this.sources) {
      const results = await source.observe(query)
      for (const obs of results) {
        await this.store.save(obs)
        const state = await this.stateMgr.activate(obs)
        const trigger = this.policyEngine.decide(obs, state)
        if (trigger) triggers.push(trigger)
        observations.push(obs)
      }
    }

    return { observations, triggers }
  }
}
