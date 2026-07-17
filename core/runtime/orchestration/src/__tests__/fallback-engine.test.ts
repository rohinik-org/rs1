import { describe, it, expect } from 'vitest'
import { FallbackEngine } from '../fallback/fallback-engine.js'
import type { Provider } from '../provider/providers.js'
import type { ProviderResult } from '@rohinik-org/compiler'

function makeProvider(id: string, result: ProviderResult | Error): Provider {
  return {
    providerId: id,
    available: true,
    invoke: async () => {
      if (result instanceof Error) throw result
      return result
    },
  }
}

describe('FallbackEngine', () => {
  const engine = new FallbackEngine()
  const req = { skillId: 'test', input: 'x' }

  it('returns result when first provider succeeds', async () => {
    const p = makeProvider('p1', { output: 'ok', providerUsed: 'p1', latencyMs: 0 })
    const r = await engine.invoke([p], req)
    expect(r.usedProviderId).toBe('p1')
    expect(r.fallbackHistory).toHaveLength(0)
  })

  it('falls back to second when first throws', async () => {
    const p1 = makeProvider('p1', new Error('fail'))
    const p2 = makeProvider('p2', { output: 'ok', providerUsed: 'p2', latencyMs: 0 })
    const r = await engine.invoke([p1, p2], req)
    expect(r.usedProviderId).toBe('p2')
    expect(r.fallbackHistory).toContain('p1')
  })

  it('records fallback history', async () => {
    const p1 = makeProvider('p1', new Error('fail'))
    const p2 = makeProvider('p2', new Error('fail'))
    const p3 = makeProvider('p3', { output: 'ok', providerUsed: 'p3', latencyMs: 0 })
    const r = await engine.invoke([p1, p2, p3], req)
    expect(r.fallbackHistory).toEqual(['p1', 'p2'])
  })

  it('throws when all providers fail', async () => {
    const p1 = makeProvider('p1', new Error('fail'))
    const p2 = makeProvider('p2', new Error('fail'))
    await expect(engine.invoke([p1, p2], req)).rejects.toThrow('All providers failed')
  })

  it('error message includes all failed provider IDs', async () => {
    const p1 = makeProvider('alpha', new Error('fail'))
    const p2 = makeProvider('beta', new Error('fail'))
    await expect(engine.invoke([p1, p2], req)).rejects.toThrow('alpha')
  })
})
