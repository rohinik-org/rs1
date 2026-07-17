import { describe, it, expect } from 'vitest'
import { ObservationStateManager } from '../state/observation-state-manager.js'
import { ObservationPolicyEngine } from '../policy/observation-policy-engine.js'
import { InMemoryObservationStore } from '../store/observation-store.js'
import { DEFAULT_OBSERVATION_POLICY } from '@rohinik-org/compiler'
import type { Observation, ObservationState, ProviderMetricsEvidence, RegistryEvidence } from '@rohinik-org/compiler'

const makeObs = (overrides: Partial<Observation> = {}): Observation => ({
  observationId: 'o1', sourceId: 's1', observedAt: new Date().toISOString(),
  category: 'SYSTEM', confidence: 0.9, evidence: [], tags: [], summary: 'test',
  ...overrides,
})

const activeState = (id = 'o1'): ObservationState => ({ observationId: id, status: 'ACTIVE', updatedAt: new Date().toISOString() })

describe('ObservationStateManager', () => {
  it('new observation is ACTIVE', async () => {
    const store = new InMemoryObservationStore()
    const mgr = new ObservationStateManager(store)
    const state = await mgr.activate(makeObs())
    expect(state.status).toBe('ACTIVE')
  })

  it('expired after ttl', async () => {
    const obs = makeObs({ observedAt: new Date(Date.now() - 10_000).toISOString(), ttlSeconds: 1 })
    const mgr = new ObservationStateManager(new InMemoryObservationStore())
    expect(await mgr.isExpired(obs)).toBe(true)
  })

  it('not expired before ttl', async () => {
    const obs = makeObs({ ttlSeconds: 3600 })
    const mgr = new ObservationStateManager(new InMemoryObservationStore())
    expect(await mgr.isExpired(obs)).toBe(false)
  })
})

describe('ObservationPolicyEngine', () => {
  const engine = new ObservationPolicyEngine(DEFAULT_OBSERVATION_POLICY)

  it('security always triggers', () => {
    const obs = makeObs({ category: 'SECURITY' })
    expect(engine.decide(obs, activeState())).not.toBeUndefined()
  })

  it('deprecated package triggers', () => {
    const reg: RegistryEvidence = { evidenceId: 'e1', kind: 'REGISTRY', capturedAt: '', confidence: 0.9, packageName: 'foo', version: '1.0.0', deprecated: true, publishedAt: '' }
    const obs = makeObs({ category: 'PACKAGE', evidence: [reg] })
    expect(engine.decide(obs, activeState())).not.toBeUndefined()
  })

  it('low confidence returns no trigger', () => {
    const obs = makeObs({ confidence: 0.1 })
    expect(engine.decide(obs, activeState())).toBeUndefined()
  })

  it('expired state returns no trigger', () => {
    const obs = makeObs({ category: 'SECURITY' })
    const expired: ObservationState = { observationId: 'o1', status: 'EXPIRED', updatedAt: '' }
    expect(engine.decide(obs, expired)).toBeUndefined()
  })

  it('provider with low success rate triggers', () => {
    const metrics: ProviderMetricsEvidence = { evidenceId: 'e1', kind: 'PROVIDER_METRICS', capturedAt: '', confidence: 0.9, latencyMs: 100, errorRate: 0.6, successRate: 0.4, sampleSize: 10 }
    const obs = makeObs({ category: 'PROVIDER', evidence: [metrics] })
    expect(engine.decide(obs, activeState())).not.toBeUndefined()
  })

  it('healthy provider returns no trigger', () => {
    const metrics: ProviderMetricsEvidence = { evidenceId: 'e1', kind: 'PROVIDER_METRICS', capturedAt: '', confidence: 0.9, latencyMs: 100, errorRate: 0.05, successRate: 0.95, sampleSize: 10 }
    const obs = makeObs({ category: 'PROVIDER', evidence: [metrics] })
    expect(engine.decide(obs, activeState())).toBeUndefined()
  })
})
