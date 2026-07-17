import { describe, it, expect } from 'vitest'
import { PromptBuilder } from '../prompt/prompt-builder.js'

describe('PromptBuilder', () => {
  const builder = new PromptBuilder()

  it('preserves skillId', () => {
    const req = builder.build('my-skill', 'input')
    expect(req.skillId).toBe('my-skill')
  })

  it('JSON-encodes object input into userMessage', () => {
    const req = builder.build('sk', { query: 'hello' })
    expect(req.userMessage).toBe('{"query":"hello"}')
  })

  it('sets kind to PromptRequest', () => {
    expect(builder.build('sk', 'x').kind).toBe('PromptRequest')
  })

  it('handles null input gracefully', () => {
    const req = builder.build('sk', null)
    expect(req.userMessage).toBe('')
  })

  it('passes maxTokens when provided', () => {
    const req = builder.build('sk', 'x', { maxTokens: 512 })
    expect(req.maxTokens).toBe(512)
  })
})
