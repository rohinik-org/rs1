import { describe, it, expect } from 'vitest'
import { HostProvider } from '../host-provider.js'
import type { HostResource } from '@rohinik-org/compiler'

function makeResource(healthStatus: 'AVAILABLE' | 'UNAVAILABLE' = 'AVAILABLE'): HostResource {
  return {
    kind: 'HostResource', schemaVersion: '1.0',
    id: 'rohinik://host/python', name: 'python', displayName: 'Python 3.12.4',
    resourceType: 'binary', detectedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(), platform: 'linux',
    healthStatus, confidence: 1.0, priority: 80,
    executablePath: '/usr/bin/python3', version: '3.12.4',
    installationSource: 'apt', metadata: {},
  }
}

describe('HostProvider', () => {
  it('implements Provider.metadata correctly', () => {
    const p = new HostProvider(makeResource())
    expect(p.metadata.providerId).toBe('rohinik://host/python')
    expect(p.metadata.name).toBe('Python 3.12.4')
    expect(p.metadata.version).toBe('3.12.4')
  })

  it('isAvailable returns true when AVAILABLE', async () => {
    const p = new HostProvider(makeResource('AVAILABLE'))
    expect(await p.isAvailable()).toBe(true)
  })

  it('isAvailable returns false when UNAVAILABLE', async () => {
    const p = new HostProvider(makeResource('UNAVAILABLE'))
    expect(await p.isAvailable()).toBe(false)
  })

  it('health returns HEALTHY for AVAILABLE resource', async () => {
    const p = new HostProvider(makeResource('AVAILABLE'))
    const h = await p.health()
    expect(h.status).toBe('HEALTHY')
  })
})
