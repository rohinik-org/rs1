import { describe, it, expect } from 'vitest'
import { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import type { MutableCapabilityCatalog, CapabilityCatalog } from '../interfaces/catalog.js'
import type { Capability } from '../interfaces/capability.js'

const makeCapability = (id: string): Capability => ({
  metadata: { capabilityId: id, name: id, tierId: 'DETERMINISTIC', version: '1.0.0', contractVersion: '1.0' },
  skills: [],
})

describe('CapabilityCatalog interfaces', () => {
  it('InMemoryCapabilityCatalog satisfies MutableCapabilityCatalog', () => {
    const catalog: MutableCapabilityCatalog = new InMemoryCapabilityCatalog()
    catalog.register(makeCapability('test'))
    expect(catalog.getForTier('DETERMINISTIC')).toHaveLength(1)
  })

  it('InMemoryCapabilityCatalog satisfies read-only CapabilityCatalog', () => {
    const catalog: CapabilityCatalog = new InMemoryCapabilityCatalog()
    expect(catalog.getForTier('DETERMINISTIC')).toHaveLength(0)
  })
})
