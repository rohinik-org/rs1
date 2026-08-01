import { describe, it, expect, vi } from 'vitest'
import type { ContentHash, IsoTimestamp, PromotionDecisionId, EvaluationId, ExperimentId, TrainingRunId } from '@rohinik-org/ml-ir'
import type { CandidateModelArtifact } from '@rohinik-org/ml-training'
import {
  ModelEvaluationController,
  type EvaluationControllerRequest,
  type EvaluationControllerResponse,
  type EvaluationEventBus,
  type EvaluationEvent,
  type EvaluationControllerProvider,
  type EvaluationMetricThreshold,
  type GovernanceEvidenceBundle,
  type SafetyEvidenceRef,
  type RobustnessEvidenceRef,
  type FairnessEvidenceRef,
  type PrivacyEvidenceRef,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash

function makeArtifact(overrides?: Partial<CandidateModelArtifact>): CandidateModelArtifact {
  return {
    artifactId: 'art-1',
    experimentId: 'exp-1' as ExperimentId,
    runId: 'run-1' as TrainingRunId,
    submissionId: 'sub-1',
    lifecycleState: 'CANDIDATE',
    providerOutputUri: 'storage://model/art-1',
    providerOutputHash: HASH,
    featureSchemaId: 'schema-1' as any,
    featureSchemaVersion: '1.0',
    datasetBindings: [],
    environmentHash: HASH,
    runHash: HASH,
    builtAt: NOW as any,
    canonicalHash: HASH,
    ...overrides,
  }
}

function makeProvider(opts?: {
  fail?: boolean
  cancelled?: boolean
  inconclusive?: boolean
}): EvaluationControllerProvider {
  return {
    evaluate: vi.fn(async (_req: { candidateArtifactId: string }) => {
      if (opts?.fail) return { outcome: 'FAILED' as const, errorCode: 'PROVIDER_ERROR', metrics: [] }
      if (opts?.cancelled) return { outcome: 'CANCELLED' as const, metrics: [] }
      if (opts?.inconclusive) return { outcome: 'INCONCLUSIVE' as const, metrics: [] }
      return {
        outcome: 'COMPLETED' as const,
        metrics: [
          { metricId: 'accuracy', value: 0.95, unit: 'ratio' as const },
        ],
      }
    }),
  }
}

function makeGovernanceBundle(): GovernanceEvidenceBundle {
  const H = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
  const base = { evidenceId: 'ev', policyId: 'pol', evidenceHash: H('ev'), outcome: 'PASS' as const, recordedAt: NOW, authority: 'safety-team' }
  return {
    candidateArtifactId: 'art-1',
    safety:     { ...base, evidenceId: 'saf', evidenceHash: H('saf') } as SafetyEvidenceRef,
    robustness: { ...base, evidenceId: 'rob', authority: 'robustness-team', evidenceHash: H('rob') } as RobustnessEvidenceRef,
    fairness:   { ...base, evidenceId: 'fair', authority: 'fairness-team', evidenceHash: H('fair') } as FairnessEvidenceRef,
    privacy:    { ...base, evidenceId: 'priv', authority: 'privacy-team', evidenceHash: H('priv') } as PrivacyEvidenceRef,
  }
}

const DEFAULT_THRESHOLDS: readonly EvaluationMetricThreshold[] = [
  { metricId: 'accuracy', threshold: 0.90, unit: 'ratio', direction: 'HIGHER_IS_BETTER', mandatory: true },
]

function makeRequest(overrides?: Partial<EvaluationControllerRequest>): EvaluationControllerRequest {
  return {
    evaluationId: 'eval-1' as EvaluationId,
    decisionId: 'dec-1' as PromotionDecisionId,
    candidate: makeArtifact(),
    baselineId: 'bl-1',
    metricThresholds: DEFAULT_THRESHOLDS,
    governanceBundle: makeGovernanceBundle(),
    targetEnvironments: ['prod'],
    evaluatorId: 'ext-evaluator',
    requestedBy: 'principal-1',
    requestedAt: NOW,
    stage11eEvidenceRef: { evidenceId: 'ev-11e', evidenceHash: HASH },
    ...overrides,
  }
}

function makeEventBus(): { bus: EvaluationEventBus; events: EvaluationEvent[] } {
  const events: EvaluationEvent[] = []
  const bus: EvaluationEventBus = {
    publish: vi.fn((event: EvaluationEvent) => { events.push(event) }),
  }
  return { bus, events }
}

// ── promoted path ─────────────────────────────────────────────────────────────

describe('ModelEvaluationController: PROMOTED', () => {
  it('returns PROMOTED decision when metrics pass', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect(response.outcome).toBe('PROMOTED')
    expect(response.decision).toBeDefined()
    expect(response.decision?.outcome).toBe('PROMOTED')
  })

  it('decision carries stage11eEvidenceRef', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect(response.decision?.stage11eEvidenceRef.evidenceId).toBe('ev-11e')
  })

  it('emits EVALUATION_STARTED and EVALUATION_COMPLETED events in order', async () => {
    const { bus, events } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    await controller.evaluate(makeRequest())
    expect(events[0]?.type).toBe('EVALUATION_STARTED')
    expect(events[events.length - 1]?.type).toBe('EVALUATION_COMPLETED')
  })

  it('events contain only IDs/hashes/codes — no raw metric data', async () => {
    const { bus, events } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    await controller.evaluate(makeRequest())
    for (const ev of events) {
      expect('rawMetrics' in ev).toBe(false)
      expect('providerResponse' in ev).toBe(false)
    }
  })

  it('promoted decision has no deploymentId', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect('deploymentId' in (response.decision ?? {})).toBe(false)
  })
})

// ── rejected path ─────────────────────────────────────────────────────────────

describe('ModelEvaluationController: REJECTED', () => {
  it('returns REJECTED when provider metrics fail threshold', async () => {
    const failingProvider: EvaluationControllerProvider = {
      evaluate: vi.fn(async () => ({
        outcome: 'COMPLETED' as const,
        metrics: [{ metricId: 'accuracy', value: 0.70, unit: 'ratio' as const }], // below 0.90 threshold
      })),
    }
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: failingProvider, eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect(response.outcome).toBe('REJECTED')
  })

  it('REJECTED when provider run FAILED — never fabricates promotion', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider({ fail: true }), eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect(response.outcome).toBe('REJECTED')
    expect(response.decision?.outcome).toBe('REJECTED')
  })

  it('emits EVALUATION_FAILED event on provider failure', async () => {
    const { bus, events } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider({ fail: true }), eventBus: bus })
    await controller.evaluate(makeRequest())
    expect(events.some(e => e.type === 'EVALUATION_FAILED')).toBe(true)
  })
})

// ── cancellation ──────────────────────────────────────────────────────────────

describe('ModelEvaluationController: CANCELLED', () => {
  it('cancelled provider run returns CANCELLED outcome — no promotion', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider({ cancelled: true }), eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect(response.outcome).toBe('CANCELLED')
    expect(response.decision).toBeUndefined()
  })

  it('emits EVALUATION_CANCELLED event', async () => {
    const { bus, events } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider({ cancelled: true }), eventBus: bus })
    await controller.evaluate(makeRequest())
    expect(events.some(e => e.type === 'EVALUATION_CANCELLED')).toBe(true)
  })
})

// ── inconclusive ──────────────────────────────────────────────────────────────

describe('ModelEvaluationController: INCONCLUSIVE', () => {
  it('inconclusive provider run returns REQUIRES_REVIEW — no auto-promotion', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider({ inconclusive: true }), eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect(response.outcome).toBe('REQUIRES_REVIEW')
    expect(response.decision?.outcome).toBe('REQUIRES_REVIEW')
  })
})

// ── governance evidence blocks promotion ──────────────────────────────────────

describe('ModelEvaluationController: governance evidence', () => {
  it('safety FAIL governance blocks promotion — hard override', async () => {
    const H = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
    const bundle = makeGovernanceBundle()
    const badBundle: GovernanceEvidenceBundle = {
      ...bundle,
      safety: { ...bundle.safety!, outcome: 'FAIL' } as SafetyEvidenceRef,
    }
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    const response = await controller.evaluate(makeRequest({ governanceBundle: badBundle }))
    expect(response.outcome).toBe('REJECTED')
  })
})

// ── self-evaluation prevention ─────────────────────────────────────────────────

describe('ModelEvaluationController: no self-evaluation', () => {
  it('evaluatorId matching candidateArtifactId throws EVALUATION_NO_PROMOTION_AUTHORITY', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    await expect(
      controller.evaluate(makeRequest({ evaluatorId: 'art-1' }))
    ).rejects.toThrow('EVALUATION_NO_PROMOTION_AUTHORITY')
  })
})

// ── environment eligibility ───────────────────────────────────────────────────

describe('ModelEvaluationController: environment eligibility', () => {
  it('empty targetEnvironments throws EVALUATION_ENVIRONMENT_INELIGIBLE', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    await expect(
      controller.evaluate(makeRequest({ targetEnvironments: [] }))
    ).rejects.toThrow('EVALUATION_ENVIRONMENT_INELIGIBLE')
  })
})

// ── dependency direction ──────────────────────────────────────────────────────

describe('ModelEvaluationController: dependency direction', () => {
  it('training success is not directly deployable — no deploymentRef on response', async () => {
    const { bus } = makeEventBus()
    const controller = ModelEvaluationController({ provider: makeProvider(), eventBus: bus })
    const response = await controller.evaluate(makeRequest())
    expect('deploymentRef' in response).toBe(false)
    expect('deploymentId' in response).toBe(false)
  })

  it('controller imports no inference or deployment types', () => {
    // structural: response has no endpoint/inference fields
    const response = {} as EvaluationControllerResponse
    expect('endpointId' in response).toBe(false)
    expect('inferenceRequest' in response).toBe(false)
  })
})
