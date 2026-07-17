import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'
import {
  runReasoningBaselineScenario,
  runHypothesisFromLatencyScenario,
  runCapabilityFailureDetectionScenario,
  runRecommendationFromHypothesisScenario,
  runPolicyMinimumConfidenceScenario,
  runInferenceChainAuditScenario,
} from '../scenarios/reasoning.scenario.js'

const emptyFixture = {
  graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [],
  observations: [], memory: [], corpus: [], providers: [],
}

function makeScenario(id: string, name: string): RuntimeScenario {
  return {
    kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: id, name,
    tags: ['REASONING'], scenarioType: 'STATIC', initialState: emptyFixture,
    expectedOutcome: {}, createdAt: new Date().toISOString(),
  }
}

describe('Reasoning baseline scenario', () => {
  it('EvidenceInput produces ReasoningReport, status not REJECTED', async () => {
    const validator = new RuntimeValidator()
    validator.register('reasoning-baseline', runReasoningBaselineScenario)
    const report = await validator.run(makeScenario('reasoning-baseline', 'Reasoning baseline'))
    expect(report.status).toBe('PASSED')
  })

  it('report is persisted in store', async () => {
    const result = await runReasoningBaselineScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.reportPersisted).toBe(true)
  })
})

describe('Hypothesis from latency scenario', () => {
  it('ProviderLatencyRule fires → PROVIDER_DEGRADATION hypothesis', async () => {
    const validator = new RuntimeValidator()
    validator.register('hypothesis-from-latency', runHypothesisFromLatencyScenario)
    const report = await validator.run(makeScenario('hypothesis-from-latency', 'Hypothesis from latency'))
    expect(report.status).toBe('PASSED')
  })

  it('hasProviderDegradation is true', async () => {
    const result = await runHypothesisFromLatencyScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.hasProviderDegradation).toBe(true)
  })
})

describe('Capability failure detection scenario', () => {
  it('failureRate 0.1 → CAPABILITY_FAILURE hypothesis', async () => {
    const validator = new RuntimeValidator()
    validator.register('capability-failure-detection', runCapabilityFailureDetectionScenario)
    const report = await validator.run(makeScenario('capability-failure-detection', 'Capability failure detection'))
    expect(report.status).toBe('PASSED')
  })

  it('hasCapFailure is true', async () => {
    const result = await runCapabilityFailureDetectionScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.hasCapFailure).toBe(true)
  })
})

describe('Recommendation from hypothesis scenario', () => {
  it('hypothesis category → recommendation in set', async () => {
    const validator = new RuntimeValidator()
    validator.register('recommendation-from-hypothesis', runRecommendationFromHypothesisScenario)
    const report = await validator.run(makeScenario('recommendation-from-hypothesis', 'Recommendation from hypothesis'))
    expect(report.status).toBe('PASSED')
  })

  it('recommendation traces back to hypothesis', async () => {
    const result = await runRecommendationFromHypothesisScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.tracesHypothesis).toBe(true)
  })
})

describe('Policy minimum confidence scenario', () => {
  it('high minimumConfidence → DEFERRED or REJECTED', async () => {
    const validator = new RuntimeValidator()
    validator.register('policy-minimum-confidence', runPolicyMinimumConfidenceScenario)
    const report = await validator.run(makeScenario('policy-minimum-confidence', 'Policy minimum confidence'))
    expect(report.status).toBe('PASSED')
  })

  it('status is DEFERRED or REJECTED', async () => {
    const result = await runPolicyMinimumConfidenceScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.isDeferred).toBe(true)
  })
})

describe('Inference chain audit scenario', () => {
  it('InferenceChain present in report with required fields', async () => {
    const validator = new RuntimeValidator()
    validator.register('inference-chain-audit', runInferenceChainAuditScenario)
    const report = await validator.run(makeScenario('inference-chain-audit', 'Inference chain audit'))
    expect(report.status).toBe('PASSED')
  })

  it('chainId, ruleId, and hypothesisId are non-empty', async () => {
    const result = await runInferenceChainAuditScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.chainIdNonEmpty).toBe(true)
    expect(result.ruleIdPresent).toBe(true)
    expect(result.hypothesisIdPresent).toBe(true)
  })
})
