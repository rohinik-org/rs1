import { describe, it, expect } from 'vitest'
import { NullProvider, EchoProvider } from '../provider/providers.js'

describe('NullProvider', () => {
  it('returns null output shape', async () => {
    const p = new NullProvider()
    const result = await p.invoke({ skillId: 'test-skill', input: 'hello' })
    expect(result.output).toBe('[null output of test-skill]')
  })

  it('sets providerId to null', () => {
    expect(new NullProvider().providerId).toBe('null')
  })

  it('is available', () => {
    expect(new NullProvider().available).toBe(true)
  })
})

describe('EchoProvider', () => {
  it('returns input as output (string)', async () => {
    const p = new EchoProvider()
    const result = await p.invoke({ skillId: 'test', input: 'my input' })
    expect(result.output).toBe('my input')
  })

  it('JSON-encodes non-string input', async () => {
    const p = new EchoProvider()
    const result = await p.invoke({ skillId: 'test', input: { key: 'val' } })
    expect(result.output).toBe('{"key":"val"}')
  })

  it('sets providerUsed to echo', async () => {
    const p = new EchoProvider()
    const result = await p.invoke({ skillId: 'test', input: 'x' })
    expect(result.providerUsed).toBe('echo')
  })
})
