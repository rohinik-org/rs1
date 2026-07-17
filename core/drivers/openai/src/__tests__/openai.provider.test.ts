import { describe, it, expect } from 'vitest'
import { OpenAIProvider } from '../openai.provider.js'

describe('OpenAIProvider', () => {
  it('has correct metadata', () => {
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    expect(p.metadata.providerId).toBe('openai')
    expect(p.metadata.capabilities).toContain('REASONING_ENGINE')
  })

  it('isAvailable true when key set', async () => {
    expect(await new OpenAIProvider({ apiKey: 'sk-test' }).isAvailable()).toBe(true)
  })

  it('isAvailable false when key empty', async () => {
    expect(await new OpenAIProvider({ apiKey: '' }).isAvailable()).toBe(false)
  })

  it('estimateCost is non-zero', () => {
    const p = new OpenAIProvider({ apiKey: 'test' })
    const cost = p.estimateCost({ prompt: 'hello', requiredCapabilities: {}, context: {} })
    expect((cost.estimated.usd ?? 0)).toBeGreaterThan(0)
  })
})
