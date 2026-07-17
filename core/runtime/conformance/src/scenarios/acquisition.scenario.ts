import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation, LearningTrigger } from '@rohinik-org/compiler'
import { CapabilityAcquisitionEngine, NullCapabilitySource, NullAcquisitionStore } from '@rohinik-org/acquisition'
import { randomUUID } from 'crypto'

const mockTrigger: LearningTrigger = {
  kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: randomUUID(),
  detectedAt: new Date().toISOString(), triggerKind: 'FAILURE_SPIKE',
  evidence: { metric: 'errorRate', observedValue: 0.9, confidence: 0.9, confidenceMethod: 'MOVING_AVERAGE', sampleSize: 10 },
  suggestedCommand: 'rhk acquire test.capability', corpusWindowStart: '', corpusWindowEnd: '',
  recordCount: 10,
}

export async function runAcquisitionScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const engine = new CapabilityAcquisitionEngine(
    [new NullCapabilitySource()],
    new NullAcquisitionStore(),
  )
  const result = await engine.acquire(mockTrigger)
  return {
    acquisitionRan: result.triggerId === mockTrigger.triggerId,
    approvalCount: result.approvals.length,
  }
}
