import { randomUUID } from 'node:crypto'
import type { EvidenceSet, InferenceChain, EvidenceReference } from '@rohinik-org/compiler'
import type { InferenceRule } from './inference-rule.js'

const LATENCY_THRESHOLD = 3_000

export class ProviderLatencyRule implements InferenceRule {
  readonly ruleId = 'ProviderLatencyRule'

  apply(set: EvidenceSet): readonly InferenceChain[] {
    const obs = set.items.filter(i => i.artifactType === 'OBSERVATION')
    const highLatency = obs.filter(i => (i.signals['latencyMs'] ?? 0) > LATENCY_THRESHOLD)
    const networkItems = obs.filter(i => 'networkLatencyMs' in i.signals || 'rtt' in i.signals)
    if (highLatency.length === 0 || networkItems.length === 0) return []

    const hypothesisId = randomUUID()
    const input: EvidenceReference[] = [
      ...highLatency.map(i => ({ artifactType: i.artifactType, artifactId: i.artifactId, confidence: i.confidence } as EvidenceReference)),
      ...networkItems.map(i => ({ artifactType: i.artifactType, artifactId: i.artifactId, confidence: i.confidence } as EvidenceReference)),
    ]
    return [{
      chainId: randomUUID(),
      ruleId: this.ruleId,
      inputEvidence: input,
      intermediateConclusions: [`Provider latency > ${LATENCY_THRESHOLD}ms detected`, 'Network latency signal present', 'Correlated: network bottleneck hypothesis'],
      outputHypothesisId: hypothesisId,
    }]
  }
}

export class CapabilityFailureRule implements InferenceRule {
  readonly ruleId = 'CapabilityFailureRule'

  apply(set: EvidenceSet): readonly InferenceChain[] {
    const caps = set.items.filter(i => i.artifactType === 'CAPABILITY' && (i.signals['successRate'] ?? 1) < 0.5)
    if (caps.length === 0) return []

    return caps.map(cap => {
      const hypothesisId = randomUUID()
      const ref: EvidenceReference = { artifactType: cap.artifactType, artifactId: cap.artifactId, confidence: cap.confidence }
      return {
        chainId: randomUUID(),
        ruleId: this.ruleId,
        inputEvidence: [ref],
        intermediateConclusions: [`Capability ${cap.artifactId} successRate < 0.5`, 'Capability is failing consistently'],
        outputHypothesisId: hypothesisId,
      } satisfies InferenceChain
    })
  }
}

export class NetworkCorrelationRule implements InferenceRule {
  readonly ruleId = 'NetworkCorrelationRule'

  apply(set: EvidenceSet): readonly InferenceChain[] {
    const failedExecs = set.items.filter(i => i.artifactType === 'EXECUTION' && (i.signals['success'] ?? 1) === 0)
    const networkObs = set.items.filter(i => i.artifactType === 'OBSERVATION' && ('networkLatencyMs' in i.signals || 'rtt' in i.signals))
    if (failedExecs.length < 2 || networkObs.length === 0) return []

    const hypothesisId = randomUUID()
    const input: EvidenceReference[] = [
      ...failedExecs.map(i => ({ artifactType: i.artifactType, artifactId: i.artifactId, confidence: i.confidence } as EvidenceReference)),
      ...networkObs.map(i => ({ artifactType: i.artifactType, artifactId: i.artifactId, confidence: i.confidence } as EvidenceReference)),
    ]
    return [{
      chainId: randomUUID(),
      ruleId: this.ruleId,
      inputEvidence: input,
      intermediateConclusions: [`${failedExecs.length} failed executions detected`, 'Network signals present', 'Correlated: network issue hypothesis'],
      outputHypothesisId: hypothesisId,
    }]
  }
}

export class PlanningDeficiencyRule implements InferenceRule {
  readonly ruleId = 'PlanningDeficiencyRule'

  apply(set: EvidenceSet): readonly InferenceChain[] {
    // detects capabilities consistently skipped: successRate=0 and durationMs=0
    const skipped = set.items.filter(
      i => i.artifactType === 'CAPABILITY' &&
        (i.signals['successRate'] ?? 1) === 0 &&
        (i.signals['durationMs'] ?? 1) === 0
    )
    if (skipped.length < 2) return []

    const hypothesisId = randomUUID()
    const input: EvidenceReference[] = skipped.map(i => ({ artifactType: i.artifactType, artifactId: i.artifactId, confidence: i.confidence } as EvidenceReference))
    return [{
      chainId: randomUUID(),
      ruleId: this.ruleId,
      inputEvidence: input,
      intermediateConclusions: [`${skipped.length} capabilities consistently skipped`, 'Planning repeatedly avoids these capabilities'],
      outputHypothesisId: hypothesisId,
    }]
  }
}
