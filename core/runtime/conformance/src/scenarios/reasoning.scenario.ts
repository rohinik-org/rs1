import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { ReasoningEngine } from '@rohinik-org/reasoning'
import { NullReasoningStore } from '@rohinik-org/reasoning'

export async function runReasoningBaselineScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new NullReasoningStore()
  const engine = new ReasoningEngine(store, { minimumConfidence: 0.1, maximumHypotheses: 10, minimumEvidenceCount: 1, allowContradictoryOutput: true })
  const report = await engine.reason({
    observations: [{ id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { latencyMs: 200 } }],
    executions: [{ id: 'e1', success: true, durationMs: 150 }],
    capabilities: [{ id: 'c1', successRate: 0.1 }],
  })
  const persisted = await store.get(report.reportId)
  return {
    reportProduced: report.kind === 'ReasoningReport',
    statusNotRejected: report.status !== 'REJECTED',
    reportPersisted: persisted !== undefined,
  }
}

export async function runHypothesisFromLatencyScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const engine = new ReasoningEngine(new NullReasoningStore())
  const report = await engine.reason({
    observations: [
      { id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { latencyMs: 5000 } },
      { id: 'o2', timestamp: '2026-01-01T00:00:00Z', signals: { networkLatencyMs: 900 } },
    ],
  })
  const hasProviderDegradation = report.hypothesisSet.some(h => h.category === 'PROVIDER_DEGRADATION')
  return { hasProviderDegradation, hypothesisCount: report.hypothesisSet.length }
}

export async function runCapabilityFailureDetectionScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const engine = new ReasoningEngine(new NullReasoningStore())
  const report = await engine.reason({ capabilities: [{ id: 'bad-cap', successRate: 0.1 }] })
  const hasCapFailure = report.hypothesisSet.some(h => h.category === 'CAPABILITY_FAILURE')
  return { hasCapFailure, hypothesisCount: report.hypothesisSet.length }
}

export async function runRecommendationFromHypothesisScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const engine = new ReasoningEngine(new NullReasoningStore(), { minimumConfidence: 0.1, maximumHypotheses: 10, minimumEvidenceCount: 1, allowContradictoryOutput: true })
  const report = await engine.reason({ capabilities: [{ id: 'cap-1', successRate: 0.1 }] })
  const rec = report.recommendationSet[0]
  return {
    recommendationPresent: rec !== undefined,
    action: rec?.action ?? null,
    tracesHypothesis: rec !== undefined && report.hypothesisSet.some(h => h.hypothesisId === rec.hypothesisId),
  }
}

export async function runPolicyMinimumConfidenceScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const engine = new ReasoningEngine(new NullReasoningStore(), { minimumConfidence: 0.99, maximumHypotheses: 10, minimumEvidenceCount: 1, allowContradictoryOutput: true })
  const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
  return { status: report.status, isDeferred: report.status === 'DEFERRED' || report.status === 'REJECTED' }
}

export async function runInferenceChainAuditScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const engine = new ReasoningEngine(new NullReasoningStore())
  const report = await engine.reason({ capabilities: [{ id: 'failing-cap', successRate: 0.2 }] })
  const chain = report.inferenceChains[0]
  return {
    chainPresent: chain !== undefined,
    chainIdNonEmpty: (chain?.chainId ?? '').length > 0,
    ruleIdPresent: (chain?.ruleId ?? '').length > 0,
    hypothesisIdPresent: (chain?.outputHypothesisId ?? '').length > 0,
  }
}
