import { describe, it, expect } from 'vitest'
import { AnthropicProvider } from '../anthropic.provider.js'

describe('AnthropicProvider', () => {
  it('has correct metadata', () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' })
    expect(p.metadata.providerId).toBe('anthropic')
    expect(p.metadata.capabilities).toContain('REASONING_ENGINE')
  })

  it('isAvailable returns true when apiKey provided', async () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' })
    expect(await p.isAvailable()).toBe(true)
  })

  it('isAvailable returns false when no apiKey', async () => {
    const p = new AnthropicProvider({ apiKey: '' })
    expect(await p.isAvailable()).toBe(false)
  })

  it('hasCapability returns true for reasoning', () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' })
    expect(p.hasCapability('reasoning')).toBe(true)
  })

  it('estimateCost returns non-zero cost', () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' })
    const cost = p.estimateCost({ prompt: 'hello', requiredCapabilities: {}, context: {} })
    expect((cost.estimated.usd ?? 0)).toBeGreaterThan(0)
  })
})
