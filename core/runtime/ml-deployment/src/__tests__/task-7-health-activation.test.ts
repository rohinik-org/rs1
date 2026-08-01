import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, DeploymentId, EndpointId } from '@rohinik-org/ml-ir'
import {
  buildHealthObservation,
  assessReadiness,
  buildCanaryGateResult,
  buildActivationDecision,
  type HealthObservation,
  type ReadinessAssessment,
  type CanaryGateResult,
  type ActivationDecision,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const EP   = 'ep-1' as EndpointId

// ── health observation ────────────────────────────────────────────────────────

describe('buildHealthObservation', () => {
  it('HEALTHY observation carries summary hash', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'HEALTHY', observedAt: NOW, observedBy: 'monitor-1' })
    expect(obs.status).toBe('HEALTHY')
    expect(obs.summaryHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('UNHEALTHY observation with reason', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'UNHEALTHY', observedAt: NOW, observedBy: 'monitor-1', reason: 'latency spike' })
    expect(obs.status).toBe('UNHEALTHY')
    expect(obs.reason).toBe('latency spike')
  })

  it('DEGRADED observation', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'DEGRADED', observedAt: NOW, observedBy: 'monitor-1' })
    expect(obs.status).toBe('DEGRADED')
  })

  it('summaryHash is deterministic', () => {
    const input = { deploymentId: DEP, endpointId: EP, status: 'HEALTHY' as const, observedAt: NOW, observedBy: 'monitor-1' }
    expect(buildHealthObservation(input).summaryHash).toBe(buildHealthObservation(input).summaryHash)
  })

  it('observation does not mutate deployment state', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'UNHEALTHY', observedAt: NOW, observedBy: 'm' })
    expect('newState' in obs).toBe(false)
    expect('stateTransition' in obs).toBe(false)
  })

  it('observation contains no raw payloads or secrets', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'HEALTHY', observedAt: NOW, observedBy: 'm' })
    expect('payload' in obs).toBe(false)
    expect('secret' in obs).toBe(false)
  })
})

// ── readiness assessment ──────────────────────────────────────────────────────

describe('assessReadiness', () => {
  it('HEALTHY observation → READY', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'HEALTHY', observedAt: NOW, observedBy: 'm' })
    const result = assessReadiness({ observations: [obs], requiredCount: 1 })
    expect(result.ready).toBe(true)
  })

  it('UNHEALTHY observation → not READY', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'UNHEALTHY', observedAt: NOW, observedBy: 'm' })
    const result = assessReadiness({ observations: [obs], requiredCount: 1 })
    expect(result.ready).toBe(false)
  })

  it('insufficient observations → not READY', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'HEALTHY', observedAt: NOW, observedBy: 'm' })
    const result = assessReadiness({ observations: [obs], requiredCount: 3 })
    expect(result.ready).toBe(false)
  })

  it('empty observations → not READY', () => {
    const result = assessReadiness({ observations: [], requiredCount: 1 })
    expect(result.ready).toBe(false)
  })
})

// ── canary gate ───────────────────────────────────────────────────────────────

describe('buildCanaryGateResult', () => {
  it('all HEALTHY → PASS', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'HEALTHY', observedAt: NOW, observedBy: 'm' })
    const r = buildCanaryGateResult({ deploymentId: DEP, observations: [obs, obs], evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, evaluatedAt: NOW })
    expect(r.verdict).toBe('PASS')
  })

  it('any UNHEALTHY → FAIL', () => {
    const healthy   = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'HEALTHY',   observedAt: NOW, observedBy: 'm' })
    const unhealthy = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'UNHEALTHY', observedAt: NOW, observedBy: 'm' })
    const r = buildCanaryGateResult({ deploymentId: DEP, observations: [healthy, unhealthy], evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, evaluatedAt: NOW })
    expect(r.verdict).toBe('FAIL')
  })

  it('all DEGRADED → INCONCLUSIVE', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'DEGRADED', observedAt: NOW, observedBy: 'm' })
    const r = buildCanaryGateResult({ deploymentId: DEP, observations: [obs], evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, evaluatedAt: NOW })
    expect(r.verdict).toBe('INCONCLUSIVE')
  })

  it('missing evidenceRef throws DEPLOYMENT_INFERENCE_MISSING_EVIDENCE', () => {
    const obs = buildHealthObservation({ deploymentId: DEP, endpointId: EP, status: 'HEALTHY', observedAt: NOW, observedBy: 'm' })
    expect(() => buildCanaryGateResult({ deploymentId: DEP, observations: [obs], evidenceRef: undefined as any, evaluatedAt: NOW }))
      .toThrow('DEPLOYMENT_INFERENCE_MISSING_EVIDENCE')
  })

  it('empty observations → INCONCLUSIVE', () => {
    const r = buildCanaryGateResult({ deploymentId: DEP, observations: [], evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, evaluatedAt: NOW })
    expect(r.verdict).toBe('INCONCLUSIVE')
  })
})

// ── activation decision ───────────────────────────────────────────────────────

describe('buildActivationDecision', () => {
  it('canary PASS + mandatory evidence → ACTIVATE', () => {
    const r = buildActivationDecision({
      deploymentId: DEP,
      canaryVerdict: 'PASS',
      mandatoryEvidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      decidedAt: NOW,
      decidedBy: 'principal-1',
    })
    expect(r.decision).toBe('ACTIVATE')
  })

  it('canary FAIL → DENY', () => {
    const r = buildActivationDecision({
      deploymentId: DEP,
      canaryVerdict: 'FAIL',
      mandatoryEvidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      decidedAt: NOW,
      decidedBy: 'principal-1',
    })
    expect(r.decision).toBe('DENY')
  })

  it('canary INCONCLUSIVE → DEFER', () => {
    const r = buildActivationDecision({
      deploymentId: DEP,
      canaryVerdict: 'INCONCLUSIVE',
      mandatoryEvidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      decidedAt: NOW,
      decidedBy: 'principal-1',
    })
    expect(r.decision).toBe('DEFER')
  })

  it('missing mandatoryEvidenceRef throws DEPLOYMENT_INFERENCE_MISSING_EVIDENCE', () => {
    expect(() => buildActivationDecision({
      deploymentId: DEP,
      canaryVerdict: 'PASS',
      mandatoryEvidenceRef: undefined as any,
      decidedAt: NOW,
      decidedBy: 'principal-1',
    })).toThrow('DEPLOYMENT_INFERENCE_MISSING_EVIDENCE')
  })

  it('activation has no drift or retraining fields', () => {
    const r = buildActivationDecision({
      deploymentId: DEP,
      canaryVerdict: 'PASS',
      mandatoryEvidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      decidedAt: NOW,
      decidedBy: 'principal-1',
    })
    expect('driftSignal' in r).toBe(false)
    expect('retrainingRequest' in r).toBe(false)
  })
})
