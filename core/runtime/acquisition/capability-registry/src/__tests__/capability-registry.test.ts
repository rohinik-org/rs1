import { describe, it, expect, beforeEach } from 'vitest'
import type { CapabilityManifestIR } from '@rohinik-org/capability-manifest'
import {
  CapabilityRegistry,
  CapabilityReferenceCounter,
  InMemoryCapabilityLock,
  type InstalledCapability,
} from '../index.js'

function makeManifest(id: string): CapabilityManifestIR {
  return {
    manifestVersion: 1,
    id,
    name: id,
    description: '',
    version: '0.1.0',
    inputs: [],
    outputs: [],
    tier: 'standard',
    tags: [],
    driverRef: 'test-driver',
  }
}

function makeCapability(id: string, state: InstalledCapability['state'] = 'REGISTERED'): InstalledCapability {
  return {
    capabilityId: id,
    version: '0.1.0',
    manifest: makeManifest(id),
    installedAt: new Date(0),
    source: { type: 'local', id: 'src' },
    acquisitionId: 'acq-1',
    dependencies: [],
    state,
  }
}

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry

  beforeEach(() => { registry = new CapabilityRegistry() })

  it('registers and retrieves a capability', () => {
    registry.register(makeCapability('cap-a'))
    expect(registry.get('cap-a')?.capabilityId).toBe('cap-a')
  })

  it('unregisters a capability', () => {
    registry.register(makeCapability('cap-a'))
    registry.unregister('cap-a')
    expect(registry.get('cap-a')).toBeUndefined()
  })

  it('lists all registered capabilities', () => {
    registry.register(makeCapability('cap-a'))
    registry.register(makeCapability('cap-b'))
    expect(registry.list()).toHaveLength(2)
  })

  it('isInstalled returns true only for REGISTERED state', () => {
    registry.register(makeCapability('cap-a', 'REGISTERED'))
    registry.register(makeCapability('cap-b', 'INSTALLED'))
    expect(registry.isInstalled('cap-a')).toBe(true)
    expect(registry.isInstalled('cap-b')).toBe(false)
  })

  it('updateState transitions capability state', () => {
    registry.register(makeCapability('cap-a', 'INSTALLED'))
    registry.updateState('cap-a', 'REGISTERED')
    expect(registry.get('cap-a')?.state).toBe('REGISTERED')
  })

  it('getDependents returns capabilities that depend on given id', () => {
    const cap = { ...makeCapability('cap-b'), dependencies: ['cap-a'] }
    registry.register(makeCapability('cap-a'))
    registry.register(cap)
    const deps = registry.getDependents('cap-a')
    expect(deps).toHaveLength(1)
    expect(deps[0].capabilityId).toBe('cap-b')
  })
})

describe('CapabilityReferenceCounter', () => {
  it('tracks refs and allows uninstall when none remain', () => {
    const counter = new CapabilityReferenceCounter()
    counter.addRef('cap-a', 'consumer-1')
    expect(counter.canUninstall('cap-a')).toBe(false)
    counter.removeRef('cap-a', 'consumer-1')
    expect(counter.canUninstall('cap-a')).toBe(true)
  })

  it('refCount returns correct count', () => {
    const counter = new CapabilityReferenceCounter()
    counter.addRef('cap-a', 'c1')
    counter.addRef('cap-a', 'c2')
    expect(counter.refCount('cap-a')).toBe(2)
  })
})

describe('InMemoryCapabilityLock', () => {
  it('acquire and release work sequentially', async () => {
    const lock = new InMemoryCapabilityLock()
    await lock.acquire('cap-a')
    expect(lock.isLocked('cap-a')).toBe(true)
    lock.release('cap-a')
    expect(lock.isLocked('cap-a')).toBe(false)
  })

  it('second acquire waits for release', async () => {
    const lock = new InMemoryCapabilityLock()
    const order: number[] = []
    await lock.acquire('cap-a')
    const second = lock.acquire('cap-a').then(() => { order.push(2) })
    order.push(1)
    lock.release('cap-a')
    await second
    expect(order).toEqual([1, 2])
  })
})
