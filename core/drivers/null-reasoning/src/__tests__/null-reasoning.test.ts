import { describe, it, expect } from 'vitest'
import { NullReasoningProvider } from '../null-reasoning.provider.js'

describe('NullReasoningProvider', () => {
  const provider = new NullReasoningProvider()

  it('has correct metadata', () => {
    expect(provider.metadata.providerId).toBe('null-reasoning')
    expect(provider.metadata.capabilities).toContain('REASONING_ENGINE')
  })

  it('isAvailable returns true', async () => {
    expect(await provider.isAvailable()).toBe(true)
  })

  it('health returns HEALTHY', async () => {
    const h = await provider.health()
    expect(h.status).toBe('HEALTHY')
  })

  it('hasCapability returns true for reasoning', () => {
    expect(provider.hasCapability('reasoning')).toBe(true)
  })

  it('reason returns disabled message', async () => {
    const outcome = await provider.reason(
      { prompt: 'hello', requiredCapabilities: {}, context: {} },
      {} as any,
    )
    expect(outcome.status).toBe('SUCCESS')
    expect(typeof outcome.result).toBe('string')
    expect(outcome.result).toContain('disabled')
  })
})
