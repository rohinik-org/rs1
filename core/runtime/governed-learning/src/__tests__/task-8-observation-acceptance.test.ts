import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildAdaptationObservation,
  buildAcceptanceDecision,
  buildAdaptationRollback,
  buildAdaptationSupersession,
  type AdaptationObservationInput,
  type AcceptanceDecisionInput,
  type AdaptationRollbackInput,
  type AdaptationSupersessionInput,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash

function makeObsInput(overrides?: Partial<AdaptationObservationInput>): AdaptationObservationInput {
  return {
    observationId: 'obs-1' as any,
    deploymentId: 'dep-1' as any,
    deploymentHash: HASH,
    adaptationId: 'adapt-1' as any,
    candidateVersionId: 'ver-1' as any,
    windowStartAt: NOW,
    windowEndAt: NOW,
    sampleCount: 1000,
    minSampleCount: 500,
    minDurationMs: 3600000,
    actualDurationMs: 7200000,
    primaryMetricsDelta: { p50_latency: -0.1 },
    guardrailMetricsDelta: { error_rate: 0.001 },
    policyViolationDetected: false,
    safetyViolationDetected: false,
    privacyViolationDetected: false,
    regressionDetected: false,
    observedAt: NOW,
    observedBy: 'observation-engine',
    ...overrides,
  }
}

function makeAcceptInput(overrides?: Partial<AcceptanceDecisionInput>): AcceptanceDecisionInput {
  return {
    acceptanceId: 'acc-1' as any,
    deploymentId: 'dep-1' as any,
    observationId: 'obs-1' as any,
    observationHash: HASH,
    adaptationId: 'adapt-1' as any,
    candidateVersionId: 'ver-1' as any,
    decidedAt: NOW,
    decidedBy: 'acceptance-gate',
    ...overrides,
  }
}

function makeRollbackInput(overrides?: Partial<AdaptationRollbackInput>): AdaptationRollbackInput {
  return {
    rollbackId: 'rb-1' as any,
    deploymentId: 'dep-1' as any,
    deploymentHash: HASH,
    adaptationId: 'adapt-1' as any,
    candidateVersionId: 'ver-1' as any,
    targetVersionId: 'ver-0' as any,
    reason: 'regression detected',
    requestedAt: NOW,
    requestedBy: 'rollback-controller',
    ...overrides,
  }
}

function makeSupersessionInput(overrides?: Partial<AdaptationSupersessionInput>): AdaptationSupersessionInput {
  return {
    supersessionId: 'sup-1' as any,
    adaptationId: 'adapt-1' as any,
    priorVersionId: 'ver-1' as any,
    newVersionId: 'ver-2' as any,
    acceptanceId: 'acc-1' as any,
    acceptanceHash: HASH,
    reason: 'improved version available',
    supersededAt: NOW,
    supersededBy: 'version-registry',
    ...overrides,
  }
}

// ── buildAdaptationObservation ────────────────────────────────────────────────

describe('buildAdaptationObservation', () => {
  it('valid observation has observationHash', () => {
    const o = buildAdaptationObservation(makeObsInput())
    expect(o.observationId).toBe('obs-1')
    expect(o.observationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('observationHash is deterministic', () => {
    const input = makeObsInput()
    expect(buildAdaptationObservation(input).observationHash)
      .toBe(buildAdaptationObservation(input).observationHash)
  })

  it('missing deployment hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationObservation(makeObsInput({ deploymentHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('insufficient sample count → GOVERNED_LEARNING_INCOMPLETE_CORPUS', () => {
    expect(() => buildAdaptationObservation(makeObsInput({ sampleCount: 100, minSampleCount: 500 })))
      .toThrow('GOVERNED_LEARNING_INCOMPLETE_CORPUS')
  })

  it('insufficient duration → GOVERNED_LEARNING_INCOMPLETE_CORPUS', () => {
    expect(() => buildAdaptationObservation(makeObsInput({ actualDurationMs: 100, minDurationMs: 3600000 })))
      .toThrow('GOVERNED_LEARNING_INCOMPLETE_CORPUS')
  })

  it('policy violation detected → records on observation', () => {
    const o = buildAdaptationObservation(makeObsInput({ policyViolationDetected: true }))
    expect(o.policyViolationDetected).toBe(true)
  })

  it('safety violation detected → records on observation', () => {
    const o = buildAdaptationObservation(makeObsInput({ safetyViolationDetected: true }))
    expect(o.safetyViolationDetected).toBe(true)
  })

  it('idempotent: same observationId same input', () => {
    const store = new Map()
    const input = makeObsInput()
    const o1 = buildAdaptationObservation(input, store)
    const o2 = buildAdaptationObservation(input, store)
    expect(o1.observationHash).toBe(o2.observationHash)
    expect(store.size).toBe(1)
  })
})

// ── buildAcceptanceDecision ───────────────────────────────────────────────────

describe('buildAcceptanceDecision', () => {
  it('valid acceptance has acceptanceHash', () => {
    const a = buildAcceptanceDecision(makeAcceptInput())
    expect(a.acceptanceId).toBe('acc-1')
    expect(a.acceptanceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('acceptanceHash is deterministic', () => {
    const input = makeAcceptInput()
    expect(buildAcceptanceDecision(input).acceptanceHash)
      .toBe(buildAcceptanceDecision(input).acceptanceHash)
  })

  it('missing observation hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAcceptanceDecision(makeAcceptInput({ observationHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('acceptance has no direct owner write fields', () => {
    const a = buildAcceptanceDecision(makeAcceptInput()) as any
    expect('ownerRepository' in a).toBe(false)
    expect('writeToOwner' in a).toBe(false)
  })

  it('idempotent: same acceptanceId same input', () => {
    const store = new Map()
    const input = makeAcceptInput()
    const a1 = buildAcceptanceDecision(input, store)
    const a2 = buildAcceptanceDecision(input, store)
    expect(a1.acceptanceHash).toBe(a2.acceptanceHash)
    expect(store.size).toBe(1)
  })
})

// ── buildAdaptationRollback ───────────────────────────────────────────────────

describe('buildAdaptationRollback', () => {
  it('valid rollback has rollbackHash', () => {
    const r = buildAdaptationRollback(makeRollbackInput())
    expect(r.rollbackId).toBe('rb-1')
    expect(r.rollbackHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('rollbackHash is deterministic', () => {
    const input = makeRollbackInput()
    expect(buildAdaptationRollback(input).rollbackHash)
      .toBe(buildAdaptationRollback(input).rollbackHash)
  })

  it('missing deployment hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationRollback(makeRollbackInput({ deploymentHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('missing target version → GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE', () => {
    expect(() => buildAdaptationRollback(makeRollbackInput({ targetVersionId: undefined as any })))
      .toThrow('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE')
  })

  it('rollback to same version → GOVERNED_LEARNING_SELF_EVIDENCE', () => {
    expect(() => buildAdaptationRollback(makeRollbackInput({
      candidateVersionId: 'ver-1' as any,
      targetVersionId: 'ver-1' as any,
    }))).toThrow('GOVERNED_LEARNING_SELF_EVIDENCE')
  })

  it('idempotent: same rollbackId same input', () => {
    const store = new Map()
    const input = makeRollbackInput()
    const r1 = buildAdaptationRollback(input, store)
    const r2 = buildAdaptationRollback(input, store)
    expect(r1.rollbackHash).toBe(r2.rollbackHash)
    expect(store.size).toBe(1)
  })
})

// ── buildAdaptationSupersession ───────────────────────────────────────────────

describe('buildAdaptationSupersession', () => {
  it('valid supersession has supersessionHash', () => {
    const s = buildAdaptationSupersession(makeSupersessionInput())
    expect(s.supersessionId).toBe('sup-1')
    expect(s.supersessionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('supersessionHash is deterministic', () => {
    const input = makeSupersessionInput()
    expect(buildAdaptationSupersession(input).supersessionHash)
      .toBe(buildAdaptationSupersession(input).supersessionHash)
  })

  it('missing acceptance hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationSupersession(makeSupersessionInput({ acceptanceHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('superseding same version → GOVERNED_LEARNING_SELF_EVIDENCE', () => {
    expect(() => buildAdaptationSupersession(makeSupersessionInput({
      priorVersionId: 'ver-1' as any,
      newVersionId: 'ver-1' as any,
    }))).toThrow('GOVERNED_LEARNING_SELF_EVIDENCE')
  })

  it('supersession is immutable — no mutation fields', () => {
    const s = buildAdaptationSupersession(makeSupersessionInput()) as any
    expect('updateVersion' in s).toBe(false)
    expect('modify' in s).toBe(false)
  })

  it('idempotent: same supersessionId same input', () => {
    const store = new Map()
    const input = makeSupersessionInput()
    const s1 = buildAdaptationSupersession(input, store)
    const s2 = buildAdaptationSupersession(input, store)
    expect(s1.supersessionHash).toBe(s2.supersessionHash)
    expect(store.size).toBe(1)
  })
})
