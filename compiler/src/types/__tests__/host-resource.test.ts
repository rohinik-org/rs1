import { describe, it, expect } from 'vitest'
import type {
  HostResourceType, HostObservation, HostResource, HostInventory, HostResourceRelationship,
} from '../host-resource.js'

describe('HostResource types', () => {
  it('accepts a minimal HostObservation', () => {
    const obs: HostObservation = {
      name: 'python',
      executablePath: '/usr/bin/python3',
      versionRaw: 'Python 3.12.4',
      exitCode: 0,
      detectedAt: '2026-07-08T12:00:00Z',
    }
    expect(obs.exitCode).toBe(0)
  })

  it('accepts a full HostResource', () => {
    const resource: HostResource = {
      kind: 'HostResource',
      schemaVersion: '1.0',
      id: 'rohinik://host/python',
      name: 'python',
      displayName: 'Python 3.12.4',
      resourceType: 'binary',
      detectedAt: '2026-07-08T12:00:00Z',
      lastVerifiedAt: '2026-07-08T12:00:00Z',
      platform: 'linux',
      healthStatus: 'AVAILABLE',
      confidence: 1.0,
      priority: 80,
      executablePath: '/usr/bin/python3',
      version: '3.12.4',
      installationSource: 'apt',
      metadata: {},
    }
    expect(resource.kind).toBe('HostResource')
    expect(resource.resourceType).toBe('binary')
    expect(resource.installationSource).toBe('apt')
  })

  it('accepts all HostResourceType values', () => {
    const types: HostResourceType[] = [
      'binary', 'runtime', 'gpu', 'database', 'container',
      'ide', 'shell', 'browser', 'device', 'service', 'network',
    ]
    for (const resourceType of types) {
      const r: HostResource = {
        kind: 'HostResource', schemaVersion: '1.0',
        id: `rohinik://host/test`, name: 'test', displayName: 'Test',
        resourceType, detectedAt: '2026-07-08T00:00:00Z', lastVerifiedAt: '2026-07-08T00:00:00Z',
        platform: 'linux', healthStatus: 'AVAILABLE', confidence: 1, priority: 80,
        installationSource: 'unknown', metadata: {},
      }
      expect(r.resourceType).toBe(resourceType)
    }
  })

  it('accepts HostResourceRelationship', () => {
    const rel: HostResourceRelationship = {
      type: 'requires', targetId: 'rohinik://host/nvidia-driver', required: true,
    }
    expect(rel.type).toBe('requires')
  })

  it('accepts HostInventory', () => {
    const inv: HostInventory = {
      kind: 'HostInventory', schemaVersion: '1.0',
      inventoryId: 'sha256-abc',
      capturedAt: '2026-07-08T12:00:00Z',
      lastUpdatedAt: '2026-07-08T12:00:00Z',
      platform: 'linux', arch: 'x64', nodeVersion: '22.14.0',
      resources: [],
      resourceCount: 0, availableCount: 0, unavailableCount: 0,
    }
    expect(inv.kind).toBe('HostInventory')
  })
})
