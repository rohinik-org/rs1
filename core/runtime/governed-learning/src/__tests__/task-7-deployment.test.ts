import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildAdaptationDeploymentPlan,
  buildAdaptationDeploymentRecord,
  transitionDeploymentStatus,
  type AdaptationDeploymentPlanInput,
  type AdaptationDeploymentRecordInput,
  type AdaptationDeploymentStatus,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash

function makePlanInput(overrides?: Partial<AdaptationDeploymentPlanInput>): AdaptationDeploymentPlanInput {
  return {
    planId: 'dp-plan-1' as any,
    admissionId: 'adm-1' as any,
    admissionHash: HASH,
    proposalId: 'prop-1' as any,
    candidateVersionId: 'ver-1' as any,
    adaptationId: 'adapt-1' as any,
    rolloutMode: 'CANARY',
    rolloutPercent: 5,
    cohortKey: 'user_segment_a',
    rollbackProjection: { targetVersionId: 'ver-0' as any },
    maxScopeClaims: ['corpus-1'],
    environment: 'staging',
    createdAt: NOW,
    createdBy: 'deployment-planner',
    ...overrides,
  }
}

function makeRecordInput(overrides?: Partial<AdaptationDeploymentRecordInput>): AdaptationDeploymentRecordInput {
  return {
    deploymentId: 'dep-1' as any,
    planId: 'dp-plan-1' as any,
    planHash: HASH,
    admissionId: 'adm-1' as any,
    admissionHash: HASH,
    proposalId: 'prop-1' as any,
    candidateVersionId: 'ver-1' as any,
    adaptationId: 'adapt-1' as any,
    rolloutMode: 'CANARY',
    rolloutPercent: 5,
    environment: 'staging',
    startedAt: NOW,
    startedBy: 'deployment-controller',
    ...overrides,
  }
}

// ── buildAdaptationDeploymentPlan ─────────────────────────────────────────────

describe('buildAdaptationDeploymentPlan', () => {
  it('valid plan has planHash', () => {
    const p = buildAdaptationDeploymentPlan(makePlanInput())
    expect(p.planId).toBe('dp-plan-1')
    expect(p.planHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('planHash is deterministic', () => {
    const input = makePlanInput()
    expect(buildAdaptationDeploymentPlan(input).planHash)
      .toBe(buildAdaptationDeploymentPlan(input).planHash)
  })

  it('missing admission hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationDeploymentPlan(makePlanInput({ admissionHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('missing rollback projection → GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE', () => {
    expect(() => buildAdaptationDeploymentPlan(makePlanInput({ rollbackProjection: undefined as any })))
      .toThrow('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE')
  })

  it('rolloutPercent > 100 → GOVERNED_LEARNING_SCOPE_EXPANSION', () => {
    expect(() => buildAdaptationDeploymentPlan(makePlanInput({ rolloutPercent: 101 })))
      .toThrow('GOVERNED_LEARNING_SCOPE_EXPANSION')
  })

  it('rolloutPercent <= 0 → GOVERNED_LEARNING_SCOPE_EXPANSION', () => {
    expect(() => buildAdaptationDeploymentPlan(makePlanInput({ rolloutPercent: 0 })))
      .toThrow('GOVERNED_LEARNING_SCOPE_EXPANSION')
  })

  it('all rollout modes accepted', () => {
    const modes = ['SHADOW', 'CANARY', 'PERCENTAGE', 'ENVIRONMENT', 'FULL'] as const
    for (const rolloutMode of modes) {
      const p = buildAdaptationDeploymentPlan(makePlanInput({ rolloutMode, planId: `plan-${rolloutMode}` as any }))
      expect(p.rolloutMode).toBe(rolloutMode)
    }
  })

  it('plan has no acceptance fields', () => {
    const p = buildAdaptationDeploymentPlan(makePlanInput()) as any
    expect('acceptanceId' in p).toBe(false)
    expect('accepted' in p).toBe(false)
  })

  it('idempotent: same planId same input', () => {
    const store = new Map()
    const input = makePlanInput()
    const p1 = buildAdaptationDeploymentPlan(input, store)
    const p2 = buildAdaptationDeploymentPlan(input, store)
    expect(p1.planHash).toBe(p2.planHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same planId different admission → throws', () => {
    const store = new Map()
    buildAdaptationDeploymentPlan(makePlanInput({ admissionId: 'adm-1' as any }), store)
    expect(() => buildAdaptationDeploymentPlan(makePlanInput({ admissionId: 'adm-2' as any }), store))
      .toThrow()
  })
})

// ── buildAdaptationDeploymentRecord ──────────────────────────────────────────

describe('buildAdaptationDeploymentRecord', () => {
  it('valid record has deploymentHash and DEPLOYING status', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    expect(r.deploymentId).toBe('dep-1')
    expect(r.status).toBe('DEPLOYING')
    expect(r.deploymentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('deploymentHash is deterministic', () => {
    const input = makeRecordInput()
    expect(buildAdaptationDeploymentRecord(input).deploymentHash)
      .toBe(buildAdaptationDeploymentRecord(input).deploymentHash)
  })

  it('missing plan hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationDeploymentRecord(makeRecordInput({ planHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('missing admission hash → GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationDeploymentRecord(makeRecordInput({ admissionHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('no acceptance field on deployment record', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput()) as any
    expect('acceptanceId' in r).toBe(false)
    expect('accepted' in r).toBe(false)
  })

  it('idempotent: same deploymentId same input', () => {
    const store = new Map()
    const input = makeRecordInput()
    const r1 = buildAdaptationDeploymentRecord(input, store)
    const r2 = buildAdaptationDeploymentRecord(input, store)
    expect(r1.deploymentHash).toBe(r2.deploymentHash)
    expect(store.size).toBe(1)
  })
})

// ── transitionDeploymentStatus ────────────────────────────────────────────────

describe('transitionDeploymentStatus', () => {
  it('DEPLOYING → CANARY is valid', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    const next = transitionDeploymentStatus(r, 'CANARY', NOW)
    expect(next.status).toBe('CANARY')
  })

  it('CANARY → OBSERVING is valid', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    const canary = transitionDeploymentStatus(r, 'CANARY', NOW)
    const observing = transitionDeploymentStatus(canary, 'OBSERVING', NOW)
    expect(observing.status).toBe('OBSERVING')
  })

  it('OBSERVING → ACTIVE is valid', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    let d = transitionDeploymentStatus(r, 'CANARY', NOW)
    d = transitionDeploymentStatus(d, 'OBSERVING', NOW)
    const active = transitionDeploymentStatus(d, 'ACTIVE', NOW)
    expect(active.status).toBe('ACTIVE')
  })

  it('ACTIVE → ROLLBACK_PENDING is valid', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    let d = transitionDeploymentStatus(r, 'CANARY', NOW)
    d = transitionDeploymentStatus(d, 'OBSERVING', NOW)
    d = transitionDeploymentStatus(d, 'ACTIVE', NOW)
    const rbp = transitionDeploymentStatus(d, 'ROLLBACK_PENDING', NOW)
    expect(rbp.status).toBe('ROLLBACK_PENDING')
  })

  it('ROLLBACK_PENDING → ROLLING_BACK → ROLLED_BACK terminal', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    let d = transitionDeploymentStatus(r, 'CANARY', NOW)
    d = transitionDeploymentStatus(d, 'OBSERVING', NOW)
    d = transitionDeploymentStatus(d, 'ACTIVE', NOW)
    d = transitionDeploymentStatus(d, 'ROLLBACK_PENDING', NOW)
    d = transitionDeploymentStatus(d, 'ROLLING_BACK', NOW)
    const rb = transitionDeploymentStatus(d, 'ROLLED_BACK', NOW)
    expect(rb.status).toBe('ROLLED_BACK')
  })

  it('ROLLED_BACK terminal cannot be mutated', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    let d = transitionDeploymentStatus(r, 'CANARY', NOW)
    d = transitionDeploymentStatus(d, 'OBSERVING', NOW)
    d = transitionDeploymentStatus(d, 'ACTIVE', NOW)
    d = transitionDeploymentStatus(d, 'ROLLBACK_PENDING', NOW)
    d = transitionDeploymentStatus(d, 'ROLLING_BACK', NOW)
    d = transitionDeploymentStatus(d, 'ROLLED_BACK', NOW)
    expect(() => transitionDeploymentStatus(d, 'ACTIVE', NOW))
      .toThrow('GOVERNED_LEARNING_TERMINAL_RECORD')
  })

  it('FAILED terminal cannot be mutated', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    const failed = transitionDeploymentStatus(r, 'FAILED', NOW)
    expect(() => transitionDeploymentStatus(failed, 'CANARY', NOW))
      .toThrow('GOVERNED_LEARNING_TERMINAL_RECORD')
  })

  it('DEPLOYING → SHADOW is valid', () => {
    const r = buildAdaptationDeploymentRecord(makeRecordInput())
    expect(transitionDeploymentStatus(r, 'SHADOW', NOW).status).toBe('SHADOW')
  })
})
