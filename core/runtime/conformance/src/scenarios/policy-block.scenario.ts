import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation, CapabilityCandidate, CapabilityQuery } from '@rohinik-org/compiler'
import { randomUUID } from 'crypto'
import { CapabilityAcquisitionEngine, NullAcquisitionStore } from '@rohinik-org/acquisition'
import type { CapabilitySource } from '@rohinik-org/acquisition'

class NetworkCapabilitySource implements CapabilitySource {
  readonly sourceId = 'npm-registry'

  async discover(query: CapabilityQuery): Promise<CapabilityCandidate[]> {
    return [{
      kind: 'CapabilityCandidate', candidateId: randomUUID(),
      queryId: query.queryId, sourceId: this.sourceId,
      name: 'some-network-package', description: 'fetched from npm',
      tags: ['network'], confidence: 0.95,
      installSource: { scheme: 'npm', location: 'some-network-package' },
      producedAt: new Date().toISOString(),
    }]
  }
}

export async function runPolicyBlockScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  // DEFAULT_ACQUISITION_POLICY has requireHumanApprovalForNetwork: true
  // npm-registry source is non-local → candidate deferred, not installed
  const engine = new CapabilityAcquisitionEngine(
    [new NetworkCapabilitySource()],
    new NullAcquisitionStore(),
  )

  const trigger = {
    kind: 'LearningTrigger' as const, schemaVersion: '1.0' as const,
    triggerId: randomUUID(), detectedAt: new Date().toISOString(),
    triggerKind: 'DEPRECATION_SIGNAL' as const,
    evidence: { metric: 'deprecated', observedValue: 1, confidence: 1, confidenceMethod: 'DIRECT_OBSERVATION' as const, sampleSize: 1 },
    suggestedCommand: 'rhk acquire some-network-package',
    corpusWindowStart: '', corpusWindowEnd: '', recordCount: 1,
  }

  const result = await engine.acquire(trigger)
  const deferred = result.approvals.filter(a => a.decision === 'DEFERRED')
  const approved = result.approvals.filter(a => a.decision === 'APPROVED')

  return {
    policyApplied: deferred.length > 0,
    deferredCount: deferred.length,
    approvedCount: approved.length,
  }
}
