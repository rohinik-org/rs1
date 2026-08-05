import { describe, it, expect, vi, afterEach } from 'vitest'
import { HostDiscoveryEngine } from '../discovery-engine.js'
import { DefaultHostClassifier } from '../classifier/host-classifier.js'
import type { HostDetector } from '../detectors/host-detector.js'
import type { HostObservation } from '@rohinik-org/compiler'

function makeDetector(name: string, obs: HostObservation | null): HostDetector {
  return {
    name,
    id: `rohinik://host/${name}`,
    resourceType: 'binary' as const,
    detect: vi.fn().mockResolvedValue(obs),
  }
}

describe('HostDiscoveryEngine', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('produces HostInventory with detected resources', async () => {
    const obs: HostObservation = {
      name: 'python', executablePath: '/usr/bin/python3',
      versionRaw: 'Python 3.12.4', exitCode: 0, detectedAt: new Date().toISOString(),
    }
    const engine = new HostDiscoveryEngine(
      [makeDetector('python', obs)],
      new DefaultHostClassifier(),
    )
    const inventory = await engine.discover()
    expect(inventory.kind).toBe('HostInventory')
    expect(inventory.resources).toHaveLength(1)
    expect(inventory.resources[0]?.name).toBe('python')
    expect(inventory.availableCount).toBe(1)
  })

  it('excludes null detections from inventory', async () => {
    const obs: HostObservation = { name: 'python', exitCode: 0, detectedAt: new Date().toISOString() }
    const engine = new HostDiscoveryEngine(
      [makeDetector('java', null), makeDetector('python', obs)],
      new DefaultHostClassifier(),
    )
    const inventory = await engine.discover()
    expect(inventory.resources).toHaveLength(1)
  })

  it('detectOne returns null for unknown name', async () => {
    const engine = new HostDiscoveryEngine([], new DefaultHostClassifier())
    const result = await engine.detectOne('nonexistent')
    expect(result).toBeNull()
  })

  it('detectOne re-runs detector for known name', async () => {
    const obs: HostObservation = { name: 'git', exitCode: 0, detectedAt: new Date().toISOString() }
    const det = makeDetector('git', obs)
    const engine = new HostDiscoveryEngine([det], new DefaultHostClassifier())
    const result = await engine.detectOne('git')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('git')
  })
})
