import { describe, it, expect } from 'vitest'
import { ObservationEngine } from '../engine/observation-engine.js'
import { InMemoryObservationStore, NullObservationStore } from '../store/observation-store.js'
import { NullObservationSource } from '../sources/observation-source.js'
import { NpmObservationSource } from '../sources/npm-observation-source.js'
import { NullNetworkClient } from '@rohinik-org/network'
import type { Observation } from '@rohinik-org/compiler'

const query = { categories: ['PACKAGE' as const], terms: ['express'] }

describe('ObservationEngine', () => {
  it('stores observations', async () => {
    const store = new InMemoryObservationStore()
    const client = new NullNetworkClient({ status: 200, body: JSON.stringify({ name: 'express' }) })
    const engine = new ObservationEngine([new NpmObservationSource(client)], store)
    const result = await engine.observe(query)
    expect(result.observations).toHaveLength(1)
    const stored = await store.list()
    expect(stored).toHaveLength(1)
  })

  it('returns empty when null source', async () => {
    const engine = new ObservationEngine([new NullObservationSource()], new NullObservationStore())
    const result = await engine.observe(query)
    expect(result.observations).toHaveLength(0)
    expect(result.triggers).toHaveLength(0)
  })

  it('emits trigger for security observation', async () => {
    const secObs: Observation = {
      observationId: 'sec1', sourceId: 's1', observedAt: new Date().toISOString(),
      category: 'SECURITY', confidence: 0.95, evidence: [], tags: [], summary: 'security issue',
    }
    const secSource = { sourceId: 'sec', category: 'SECURITY' as const, observe: async () => [secObs] }
    const engine = new ObservationEngine([secSource], new InMemoryObservationStore())
    const result = await engine.observe(query)
    expect(result.triggers.length).toBeGreaterThan(0)
  })

  it('returns result summary', async () => {
    const engine = new ObservationEngine([], new NullObservationStore())
    const result = await engine.observe(query)
    expect(result).toHaveProperty('observations')
    expect(result).toHaveProperty('triggers')
  })
})
