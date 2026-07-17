import type { Observation, ObservationPolicy, LearningTrigger, ObservationState, ProviderMetricsEvidence, RegistryEvidence } from '@rohinik-org/compiler'
import { randomUUID } from 'crypto'

export class ObservationPolicyEngine {
  constructor(private readonly policy: ObservationPolicy) {}

  decide(observation: Observation, state: ObservationState): LearningTrigger | undefined {
    // low confidence → skip
    if (observation.confidence < this.policy.minimumConfidence) return undefined
    // expired → skip
    if (state.status === 'EXPIRED') return undefined

    const now = new Date().toISOString()
    const base: Omit<LearningTrigger, 'triggerKind' | 'affectedSkillId' | 'affectedProviderId'> = {
      kind: 'LearningTrigger',
      schemaVersion: '1.0',
      triggerId: randomUUID(),
      detectedAt: now,
      evidence: { metric: 'observation', observedValue: observation.confidence, confidence: observation.confidence, confidenceMethod: 'MOVING_AVERAGE', sampleSize: 1 },
      suggestedCommand: 'rhk observe --list',
      corpusWindowStart: observation.observedAt,
      corpusWindowEnd: now,
      recordCount: 1,
    }

    // security → always trigger
    if (observation.category === 'SECURITY') {
      return { ...base, triggerKind: 'FAILURE_SPIKE' }
    }

    // provider with success rate drop
    if (observation.category === 'PROVIDER') {
      const metrics = observation.evidence.find((e): e is ProviderMetricsEvidence => e.kind === 'PROVIDER_METRICS')
      if (metrics && metrics.successRate < 0.5) {
        return { ...base, triggerKind: 'FAILURE_SPIKE', affectedProviderId: observation.sourceId }
      }
    }

    // package deprecated
    if (observation.category === 'PACKAGE') {
      const registry = observation.evidence.find((e): e is RegistryEvidence => e.kind === 'REGISTRY')
      if (registry?.deprecated) {
        return { ...base, triggerKind: 'PROVIDER_DRIFT' }
      }
    }

    return undefined
  }
}
