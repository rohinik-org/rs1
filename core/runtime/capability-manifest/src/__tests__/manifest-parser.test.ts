import { describe, it, expect } from 'vitest'
import {
  parseDriverDescriptor,
  parseCapabilityManifest,
  RUNTIME_API_VERSION,
  RUNTIME_MANIFEST_VERSION,
} from '../manifest-parser.js'

describe('manifest-parser', () => {
  const validDriver = {
    id: 'my-driver',
    version: '0.1.0',
    apiVersion: RUNTIME_API_VERSION,
    priority: 10,
    tags: [],
    capabilities: {
      supportsStreaming: false,
      supportsCancellation: false,
      supportsProgress: false,
      supportsHealth: true,
      offline: true,
      sandboxed: false,
      trusted: true,
    },
  }

  const validCapability = {
    manifestVersion: 1,
    id: 'my-driver:do-thing',
    name: 'Do Thing',
    description: 'does a thing',
    version: '0.1.0',
    inputs: [],
    outputs: [],
    tier: 'LOCAL',
    tags: [],
    driverRef: 'my-driver',
  }

  it('valid driver manifest → DriverDescriptor', () => {
    const d = parseDriverDescriptor(validDriver)
    expect(d.id).toBe('my-driver')
    expect(d.apiVersion).toBe(1)
    expect(d.priority).toBe(10)
  })

  it('valid capability manifest → CapabilityManifestIR with manifestVersion: 1', () => {
    const c = parseCapabilityManifest(validCapability)
    expect(c.id).toBe('my-driver:do-thing')
    expect(c.manifestVersion).toBe(1)
    expect(c.driverRef).toBe('my-driver')
  })

  it('invalid driver ID grammar throws — PascalCase', () => {
    expect(() => parseDriverDescriptor({ ...validDriver, id: 'FileSystem' })).toThrow(/Invalid driver ID/)
  })

  it('invalid driver ID grammar throws — underscore', () => {
    expect(() => parseDriverDescriptor({ ...validDriver, id: 'local_shell' })).toThrow(/Invalid driver ID/)
  })

  it('invalid capability ID grammar throws — dot separator', () => {
    expect(() => parseCapabilityManifest({ ...validCapability, id: 'filesystem.read' })).toThrow(/Invalid capability ID/)
  })

  it('invalid capability ID grammar throws — camelCase action', () => {
    expect(() => parseCapabilityManifest({ ...validCapability, id: 'shell:executeStream' })).toThrow(/Invalid capability ID/)
  })

  it('apiVersion mismatch throws', () => {
    expect(() => parseDriverDescriptor({ ...validDriver, apiVersion: 999 })).toThrow(/apiVersion mismatch/)
  })

  it('manifestVersion > RUNTIME_MANIFEST_VERSION throws', () => {
    expect(() => parseCapabilityManifest({ ...validCapability, manifestVersion: RUNTIME_MANIFEST_VERSION + 1 })).toThrow(/manifestVersion/)
  })

  it('priority out of range throws', () => {
    expect(() => parseDriverDescriptor({ ...validDriver, priority: 0 })).toThrow(/priority/)
    expect(() => parseDriverDescriptor({ ...validDriver, priority: 101 })).toThrow(/priority/)
  })
})
