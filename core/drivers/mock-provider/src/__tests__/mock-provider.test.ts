import { describe, it, expect } from 'vitest'
import { MockReasoningProvider } from '../index.js'

describe('MockReasoningProvider', () => {
  const ctx = { currentStepId: 'step-1' } as never
  const request = { prompt: 'Hello', requiredCapabilities: {}, context: {} } as never

  it('echoes prompt in output', async () => {
    const provider = new MockReasoningProvider()
    const outcome = await provider.reason(request, ctx)
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toBe('[mock] echo: Hello')
  })

  it('tracks invocation count', async () => {
    const provider = new MockReasoningProvider()
    expect(provider.invocationCount).toBe(0)
    await provider.reason(request, ctx)
    await provider.reason(request, ctx)
    expect(provider.invocationCount).toBe(2)
  })

  it('throws when configured', async () => {
    const provider = new MockReasoningProvider({ shouldThrow: true, throwMessage: 'boom' })
    await expect(provider.reason(request, ctx)).rejects.toThrow('boom')
  })

  it('is always available and healthy', async () => {
    const provider = new MockReasoningProvider()
    expect(await provider.isAvailable()).toBe(true)
    const health = await provider.health()
    expect(health.status).toBe('HEALTHY')
  })

  it('reports REASONING_ENGINE capability', () => {
    const provider = new MockReasoningProvider()
    expect(provider.metadata.capabilities).toContain('REASONING_ENGINE')
    expect(provider.hasCapability('reasoning')).toBe(true)
  })

  it('streams echo', async () => {
    const provider = new MockReasoningProvider()
    const chunks: string[] = []
    for await (const chunk of provider.stream(request, ctx)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['[mock] echo: Hello'])
  })

  it('estimateCost returns zero', () => {
    const provider = new MockReasoningProvider()
    const cost = provider.estimateCost(request)
    expect(cost.estimated.cpuMs).toBe(0)
  })
})
