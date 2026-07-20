import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnthropicProvider } from '../anthropic.provider.js'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const makeSuccessResponse = (text: string) => ({
  content: [{ type: 'text', text }],
  usage: { input_tokens: 10, output_tokens: 20 },
})

describe('AnthropicProvider', () => {
  beforeEach(() => { mockCreate.mockReset() })
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

  it('reason() passes system prompt when present in context', async () => {
    mockCreate.mockResolvedValue(makeSuccessResponse('response'))
    const p = new AnthropicProvider({ apiKey: 'test-key' })
    await p.reason({ prompt: 'hi', requiredCapabilities: {}, context: { systemPrompt: 'You are Rohinik.' } }, {} as never)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ system: 'You are Rohinik.' }))
  })

  it('reason() omits system param when no systemPrompt in context', async () => {
    mockCreate.mockResolvedValue(makeSuccessResponse('response'))
    const p = new AnthropicProvider({ apiKey: 'test-key' })
    await p.reason({ prompt: 'hi', requiredCapabilities: {}, context: {} }, {} as never)
    const call = mockCreate.mock.calls[0]?.[0]
    expect(call).not.toHaveProperty('system')
  })
})
