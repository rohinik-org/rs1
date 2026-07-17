import { describe, it, expect } from 'vitest'
import { ProviderHealthSource } from '../sources/provider-health-source.js'
import { NpmObservationSource } from '../sources/npm-observation-source.js'
import { DocumentationObservationSource } from '../sources/documentation-observation-source.js'
import { NullNetworkClient } from '@rohinik-org/network'

const query = { categories: ['PACKAGE' as const], terms: ['express'] }
const docQuery = { categories: ['DOCUMENTATION' as const], terms: ['https://example.com'] }

describe('ProviderHealthSource', () => {
  it('returns empty when no providers', async () => {
    const metrics = { list: () => [], stats: () => ({ callCount: 0, successRate: 0, avgLatencyMs: 0 }) }
    expect(await new ProviderHealthSource(metrics).observe(query)).toHaveLength(0)
  })

  it('returns empty when callCount is 0', async () => {
    const metrics = { list: () => [{ providerId: 'p1' }], stats: () => ({ callCount: 0, successRate: 0, avgLatencyMs: 0 }) }
    expect(await new ProviderHealthSource(metrics).observe(query)).toHaveLength(0)
  })

  it('emits PROVIDER observation for active provider', async () => {
    const metrics = { list: () => [{ providerId: 'p1' }], stats: () => ({ callCount: 10, successRate: 0.9, avgLatencyMs: 50 }) }
    const obs = await new ProviderHealthSource(metrics).observe(query)
    expect(obs[0]?.category).toBe('PROVIDER')
  })
})

describe('NpmObservationSource', () => {
  it('emits PACKAGE observation', async () => {
    const client = new NullNetworkClient({ status: 200, body: JSON.stringify({ name: 'express', time: { modified: new Date().toISOString() } }) })
    const obs = await new NpmObservationSource(client).observe(query)
    expect(obs[0]?.category).toBe('PACKAGE')
  })

  it('deprecated flag propagates', async () => {
    const client = new NullNetworkClient({ status: 200, body: JSON.stringify({ name: 'left-pad', deprecated: 'use pad-left instead' }) })
    const obs = await new NpmObservationSource(client).observe({ categories: ['PACKAGE'], terms: ['left-pad'] })
    const evidence = obs[0]?.evidence[0] as { deprecated?: boolean }
    expect(evidence?.deprecated).toBe(true)
  })

  it('null network returns empty on non-200', async () => {
    const client = new NullNetworkClient({ status: 404 })
    expect(await new NpmObservationSource(client).observe(query)).toHaveLength(0)
  })
})

describe('DocumentationObservationSource', () => {
  it('emits DOCUMENTATION observation', async () => {
    const client = new NullNetworkClient({ status: 200, body: '<html>docs</html>' })
    const obs = await new DocumentationObservationSource(client).observe(docQuery)
    expect(obs[0]?.category).toBe('DOCUMENTATION')
  })

  it('skips non-URL terms', async () => {
    const client = new NullNetworkClient({ status: 200 })
    const obs = await new DocumentationObservationSource(client).observe({ categories: ['DOCUMENTATION'], terms: ['not-a-url'] })
    expect(obs).toHaveLength(0)
  })

  it('empty on network error', async () => {
    const badClient = { request: async () => { throw new Error('network error') } }
    const obs = await new DocumentationObservationSource(badClient).observe(docQuery)
    expect(obs).toHaveLength(0)
  })
})
