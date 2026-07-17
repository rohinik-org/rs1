import { describe, it, expect } from 'vitest'
import { NullObservationSource } from '../sources/observation-source.js'
import { NullObservationStore, InMemoryObservationStore } from '../store/observation-store.js'
import type { Observation } from '@rohinik-org/compiler'

const obs: Observation = {
  observationId: 'o1', sourceId: 's1', observedAt: new Date().toISOString(),
  category: 'PACKAGE', confidence: 0.9, evidence: [], tags: [], summary: 'test',
}

const query = { categories: ['PACKAGE' as const], terms: [] }

describe('NullObservationSource', () => {
  it('returns empty array', async () => {
    expect(await new NullObservationSource().observe(query)).toHaveLength(0)
  })
})

describe('ObservationStore', () => {
  it('save + load round-trip', async () => {
    const store = new InMemoryObservationStore()
    await store.save(obs)
    expect(await store.load('o1')).toBe(obs)
  })

  it('list returns all', async () => {
    const store = new InMemoryObservationStore()
    await store.save(obs)
    expect(await store.list()).toHaveLength(1)
  })

  it('load undefined on miss', async () => {
    expect(await new NullObservationStore().load('nope')).toBeUndefined()
  })
})
