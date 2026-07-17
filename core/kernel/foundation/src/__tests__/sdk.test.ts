import { describe, it, expect } from 'vitest'
import type { Runtime, AiosManifest } from '../index.js'

describe('@rohinik-org/foundation', () => {
  it('Runtime interface is exported', () => {
    const runtime: Runtime = {
      registerCapability: () => {},
      registerProvider: () => {},
      services: {} as any,
      version: '0.1.0',
      onShutdown: () => {},
    }
    expect(runtime.version).toBe('0.1.0')
  })

  it('AiosManifest type accepts valid manifest', () => {
    const manifest: AiosManifest = {
      schemaVersion: '1.0',
      runtimeVersion: '^1.0',
      type: 'capability',
      compatibility: 'stable',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      contractVersion: '1.0',
      entry: './dist/index.js',
    }
    expect(manifest.id).toBe('test')
  })
})
