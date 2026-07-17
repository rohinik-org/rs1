import { createHash } from 'node:crypto'
import type { HostResource, HostInventory } from '@rohinik-org/compiler'
import type { HostDetector } from './detectors/host-detector.js'
import type { HostClassifier } from './classifier/host-classifier.js'

export class HostDiscoveryEngine {
  constructor(
    private readonly detectors: readonly HostDetector[],
    private readonly classifier: HostClassifier,
  ) {}

  async discover(): Promise<HostInventory> {
    const results = await Promise.allSettled(
      this.detectors.map(d =>
        d.detect().then(obs => (obs !== null ? { obs, detector: d } : null))
      )
    )

    const resources: HostResource[] = []
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        resources.push(this.classifier.classify(result.value.obs, result.value.detector))
      }
    }

    const now = new Date().toISOString()
    const available = resources.filter(r => r.healthStatus === 'AVAILABLE').length
    const inventoryId = createHash('sha256')
      .update(JSON.stringify({ resources, platform: process.platform }))
      .digest('hex')

    return {
      kind: 'HostInventory',
      schemaVersion: '1.0',
      inventoryId,
      capturedAt: now,
      lastUpdatedAt: now,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version.replace('v', ''),
      resources,
      resourceCount: resources.length,
      availableCount: available,
      unavailableCount: resources.length - available,
    }
  }

  async detectOne(name: string): Promise<HostResource | null> {
    const detector = this.detectors.find(d => d.name === name)
    if (!detector) return null
    const obs = await detector.detect()
    if (!obs) return null
    return this.classifier.classify(obs, detector)
  }
}
