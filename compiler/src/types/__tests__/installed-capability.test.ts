import { describe, it, expect } from 'vitest'
import type { InstalledCapabilityEntry, CapabilityCatalogSnapshot } from '../installed-capability.js'

describe('InstalledCapabilityEntry', () => {
  it('records a fully installed adapter entry', () => {
    const entry: InstalledCapabilityEntry = {
      id: '@rohinik-org/mcp', version: '1.0.0', protocol: 'mcp',
      source: { scheme: 'file', location: './adapters/filesystem' },
      installedAt: '2026-07-07T00:00:00Z', status: 'enabled',
      registeredCapabilityIds: ['filesystem.read', 'filesystem.write'],
      descriptorIrId: 'cdir-abc123', registrationRecordId: 'rr-xyz456', complianceLevel: 1,
    }
    expect(entry.id).toBe('@rohinik-org/mcp')
    expect(entry.status).toBe('enabled')
    expect(entry.registeredCapabilityIds).toHaveLength(2)
  })
})

describe('CapabilityCatalogSnapshot', () => {
  it('holds a collection of installed entries with a version', () => {
    const snapshot: CapabilityCatalogSnapshot = {
      catalogVersion: '1.0', updatedAt: '2026-07-07T00:00:00Z', entries: [],
    }
    expect(snapshot.catalogVersion).toBe('1.0')
    expect(snapshot.entries).toHaveLength(0)
  })
})
