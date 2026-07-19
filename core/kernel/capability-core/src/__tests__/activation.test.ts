import { describe, it, expect } from 'vitest'
import { activate } from '../index.js'
import type { Runtime } from '@rohinik-org/foundation'

describe('capability-core activate()', () => {
  it('registers CoreCapability and ReasoningCapability', () => {
    const registered: unknown[] = []
    const runtime: Runtime = {
      registerCapability: (c) => registered.push(c),
      registerProvider: () => {},
      services: { logger: { info: () => {}, error: () => {} } },
      version: '0.1.0',
      onShutdown: () => {},
    }
    activate(runtime)
    expect(registered).toHaveLength(2)
    const ids = (registered as Array<{ metadata: { capabilityId: string } }>)
      .map(c => c.metadata.capabilityId)
    expect(ids).toContain('capability-core')
    expect(ids).toContain('builtin:reasoning')
  })

  it('core capability has 8 deterministic skills', () => {
    const registered: unknown[] = []
    const runtime: Runtime = {
      registerCapability: (c) => registered.push(c),
      registerProvider: () => {},
      services: { logger: { info: () => {}, error: () => {} } },
      version: '0.1.0',
      onShutdown: () => {},
    }
    activate(runtime)
    const core = (registered as Array<{ metadata: { capabilityId: string }; skills: unknown[] }>)
      .find(c => c.metadata.capabilityId === 'capability-core')
    expect(core?.skills).toHaveLength(8)
  })
})
