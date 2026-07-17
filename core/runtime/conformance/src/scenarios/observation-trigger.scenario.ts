import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { DEFAULT_OBSERVATION_POLICY } from '@rohinik-org/compiler'
import { NullNetworkClient } from '@rohinik-org/network'
import { NpmObservationSource, ObservationPolicyEngine, InMemoryObservationStore, ObservationStateManager } from '@rohinik-org/observer'

export async function runObservationTriggerScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const client = new NullNetworkClient({ status: 200, body: JSON.stringify({ name: 'left-pad', deprecated: 'use pad-left instead' }) })
  const source = new NpmObservationSource(client)
  const observations = await source.observe({ categories: ['PACKAGE'], terms: ['left-pad'] })

  const store = new InMemoryObservationStore()
  const stateMgr = new ObservationStateManager(store)
  const engine = new ObservationPolicyEngine(DEFAULT_OBSERVATION_POLICY)

  let triggerEmitted = false
  for (const obs of observations) {
    await store.save(obs)
    const state = await stateMgr.activate(obs)
    const trigger = engine.decide(obs, state)
    if (trigger) { triggerEmitted = true }
  }

  return { triggerEmitted }
}
