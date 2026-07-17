import type { HostObservation, HostResource } from '@rohinik-org/compiler'
import type { HostDetector } from '../detectors/host-detector.js'

export interface HostClassifier {
  classify(observation: HostObservation, detector: HostDetector): HostResource
}

function parseVersion(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const match = /\d+\.\d+(?:\.\d+)?/.exec(raw)
  return match?.[0]
}

export class DefaultHostClassifier implements HostClassifier {
  classify(obs: HostObservation, detector: HostDetector): HostResource {
    const now = new Date().toISOString()
    const version = parseVersion(obs.versionRaw)
    const capName = detector.name.charAt(0).toUpperCase() + detector.name.slice(1)
    const displayName = version ? `${capName} ${version}` : capName

    return {
      kind: 'HostResource',
      schemaVersion: '1.0',
      id: detector.id,
      name: detector.name,
      displayName,
      resourceType: detector.resourceType,
      detectedAt: obs.detectedAt,
      lastVerifiedAt: now,
      platform: process.platform,
      healthStatus: 'AVAILABLE',
      confidence: 1.0,
      priority: 80,
      ...(obs.executablePath !== undefined ? { executablePath: obs.executablePath } : {}),
      ...(version !== undefined ? { version } : {}),
      installationSource: 'unknown' as const,
      metadata: {},
    }
  }
}
