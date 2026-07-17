import { describe, it, expect } from 'vitest'
import { activate } from '../index.js'
import type { Runtime } from '@rohinik-org/foundation'

describe('capability-core activate()', () => {
  it('registers CoreCapability with the runtime', () => {
    const registered: unknown[] = []
    const runtime: Runtime = {
      registerCapability: (c) => registered.push(c),
      registerProvider: () => {},
      services: { logger: { info: () => {}, error: () => {} } },
      version: '0.1.0',
      onShutdown: () => {},
    }
    activate(runtime)
    expect(registered).toHaveLength(1)
    const cap = registered[0] as { metadata: { capabilityId: string }; skills: unknown[] }
    expect(cap.metadata.capabilityId).toBe('capability-core')
    expect(cap.skills.length).toBeGreaterThan(0)
  })
})
