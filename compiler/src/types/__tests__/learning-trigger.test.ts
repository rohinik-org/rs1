import { describe, it, expect } from 'vitest'
import type {
  LearningTrigger, LearningTriggerKind, TriggerEvidence, ConfidenceMethod,
} from '../learning-trigger.js'

describe('LearningTrigger', () => {
  it('accepts a VOLUME_THRESHOLD trigger', () => {
    const trigger: LearningTrigger = {
      kind: 'LearningTrigger',
      schemaVersion: '1.0',
      triggerId: 'uuid-001',
      detectedAt: '2026-07-08T12:00:00Z',
      triggerKind: 'VOLUME_THRESHOLD',
      affectedSkillId: 'weather.fetch',
      evidence: {
        metric: 'execution_count',
        observedValue: 1247,
        confidence: 0.99,
        confidenceMethod: 'WELFORD',
        sampleSize: 1247,
      },
      suggestedCommand: 'rhk learn weather.fetch',
      corpusWindowStart: '2026-06-08T00:00:00Z',
      corpusWindowEnd: '2026-07-08T00:00:00Z',
      recordCount: 1247,
    }
    expect(trigger.kind).toBe('LearningTrigger')
    expect(trigger.triggerKind).toBe('VOLUME_THRESHOLD')
    expect(trigger.evidence.confidenceMethod).toBe('WELFORD')
  })

  it('accepts a LATENCY_REGRESSION trigger with baseline', () => {
    const trigger: LearningTrigger = {
      kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: 'uuid-002',
      detectedAt: '2026-07-08T12:00:00Z', triggerKind: 'LATENCY_REGRESSION',
      affectedSkillId: 'weather.fetch', affectedProviderId: 'provider-a',
      evidence: {
        metric: 'p95_latency_ms', observedValue: 890, baselineValue: 450,
        deviationPercent: 97.8, confidence: 0.95, confidenceMethod: 'EWMA', sampleSize: 500,
      },
      suggestedCommand: 'rhk learn weather.fetch',
      corpusWindowStart: '2026-07-01T00:00:00Z',
      corpusWindowEnd: '2026-07-08T00:00:00Z',
      recordCount: 500,
    }
    expect(trigger.evidence.deviationPercent).toBe(97.8)
    expect(trigger.evidence.baselineValue).toBe(450)
  })

  it('accepts all six trigger kinds', () => {
    const kinds: LearningTriggerKind[] = [
      'VOLUME_THRESHOLD', 'LATENCY_REGRESSION', 'FAILURE_SPIKE',
      'COST_ANOMALY', 'PROVIDER_DRIFT', 'ROUTING_ANOMALY',
    ]
    for (const triggerKind of kinds) {
      const t: LearningTrigger = {
        kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: 'x',
        detectedAt: '2026-07-08T00:00:00Z', triggerKind,
        evidence: { metric: 'm', observedValue: 1, confidence: 0.9, confidenceMethod: 'STANDARD_DEVIATION', sampleSize: 10 },
        suggestedCommand: 'rhk learn', corpusWindowStart: '2026-07-01T00:00:00Z',
        corpusWindowEnd: '2026-07-08T00:00:00Z', recordCount: 10,
      }
      expect(t.triggerKind).toBe(triggerKind)
    }
  })

  it('accepts all five confidence methods', () => {
    const methods: ConfidenceMethod[] = [
      'STANDARD_DEVIATION', 'BAYESIAN', 'EWMA', 'MOVING_AVERAGE', 'WELFORD',
    ]
    for (const confidenceMethod of methods) {
      const ev: TriggerEvidence = {
        metric: 'm', observedValue: 1, confidence: 0.9, confidenceMethod, sampleSize: 10,
      }
      expect(ev.confidenceMethod).toBe(confidenceMethod)
    }
  })

  it('accepts reserved Stage 5 stub types', () => {
    type _LearningReport = { kind: 'LearningReport'; schemaVersion: '1.0' }
    type _AdaptationProposal = { kind: 'AdaptationProposal'; schemaVersion: '1.0' }
    type _AppliedAdaptation = { kind: 'AppliedAdaptation'; schemaVersion: '1.0' }
    const _lr: _LearningReport = { kind: 'LearningReport', schemaVersion: '1.0' }
    expect(_lr.kind).toBe('LearningReport')
  })
})
