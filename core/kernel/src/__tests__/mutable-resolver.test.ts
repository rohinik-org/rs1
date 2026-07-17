import { describe, it, expect } from 'vitest'
import { DefaultExecutionResolver } from '../resolver.js'
import type { MutableExecutionResolver } from '../interfaces/resolver.js'
import type { Provider } from '../interfaces/provider.js'

const makeProvider = (id: string): Provider => ({
  metadata: { providerId: id, name: id, environments: ['NETWORK'], capabilities: ['REASONING_ENGINE'], version: '1.0.0' },
  isAvailable: async () => true,
  health: async () => ({ status: 'HEALTHY' }),
})

describe('MutableExecutionResolver', () => {
  it('DefaultExecutionResolver satisfies MutableExecutionResolver', () => {
    const resolver: MutableExecutionResolver = new DefaultExecutionResolver({} as any)
    resolver.registerProvider(makeProvider('test'))
    expect(resolver.isResolvable({ providerCapabilities: { reasoningEngine: { reasoning: true } } }, {} as any)).toBe(true)
  })
})
