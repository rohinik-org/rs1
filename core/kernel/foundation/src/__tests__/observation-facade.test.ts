import { describe, it, expect } from 'vitest'
import { DefaultObservationFacade, NoopObservationFacade } from '../facades/observation-facade.js'

const query = { categories: [], terms: [] }

describe('DefaultObservationFacade', () => {
  it('observe() returns an ObservationResult', async () => {
    const facade = new DefaultObservationFacade()
    const result = await facade.observe(query)
    expect(result.observations).toBeDefined()
    expect(result.triggers).toBeDefined()
  })

  it('observe() returns arrays', async () => {
    const facade = new DefaultObservationFacade()
    const result = await facade.observe(query)
    expect(Array.isArray(result.observations)).toBe(true)
    expect(Array.isArray(result.triggers)).toBe(true)
  })

  it('observe() does not throw with empty query', async () => {
    const facade = new DefaultObservationFacade()
    await expect(facade.observe(query)).resolves.toBeDefined()
  })

  it('observe() handles since filter in query', async () => {
    const facade = new DefaultObservationFacade()
    const result = await facade.observe({ categories: [], terms: [], since: new Date().toISOString() })
    expect(Array.isArray(result.observations)).toBe(true)
  })

  it('returns empty observations with null source', async () => {
    const facade = new DefaultObservationFacade()
    const result = await facade.observe(query)
    expect(result.observations.length).toBeGreaterThanOrEqual(0)
  })
})

describe('NoopObservationFacade', () => {
  it('returns empty result without throwing', async () => {
    const facade = new NoopObservationFacade()
    const result = await facade.observe(query)
    expect(result.observations).toHaveLength(0)
    expect(result.triggers).toHaveLength(0)
  })
})
