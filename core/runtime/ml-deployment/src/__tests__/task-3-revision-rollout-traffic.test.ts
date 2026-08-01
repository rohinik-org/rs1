import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, DeploymentId } from '@rohinik-org/ml-ir'
import {
  buildDeploymentRevision,
  validateRolloutPlan,
  validateTrafficAllocation,
  type DeploymentRevisionInput,
  type DeploymentRevision,
  type RolloutPlanInput,
  type ValidatedRolloutPlan,
  type TrafficAllocationStep,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId

function makeRevisionInput(overrides?: Partial<DeploymentRevisionInput>): DeploymentRevisionInput {
  return {
    revisionId: 'rev-1',
    deploymentId: DEP,
    candidateArtifactId: 'art-1',
    candidateCanonicalHash: HASH,
    modelVersionId: 'model-v1',
    rolloutStrategy: 'direct',
    rollbackTargetRevisionId: 'rev-0',
    createdAt: NOW,
    createdBy: 'principal-1',
    ...overrides,
  }
}

function makeTrafficSteps(percents: number[]): TrafficAllocationStep[] {
  return percents.map((p, i) => ({ revisionId: `rev-${i}`, trafficPercent: p }))
}

// ── revision building ─────────────────────────────────────────────────────────

describe('buildDeploymentRevision', () => {
  it('valid input returns revision with revisionHash', () => {
    const rev = buildDeploymentRevision(makeRevisionInput())
    expect(rev.revisionId).toBe('rev-1')
    expect(rev.revisionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('revisionHash is deterministic', () => {
    const input = makeRevisionInput()
    const r1 = buildDeploymentRevision(input)
    const r2 = buildDeploymentRevision(input)
    expect(r1.revisionHash).toBe(r2.revisionHash)
  })

  it('different candidateCanonicalHash produces different revisionHash', () => {
    const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
    const r1 = buildDeploymentRevision(makeRevisionInput())
    const r2 = buildDeploymentRevision(makeRevisionInput({ candidateCanonicalHash: HASH2 }))
    expect(r1.revisionHash).not.toBe(r2.revisionHash)
  })

  it('revision is immutable — modelVersionId/candidateCanonicalHash locked at build time', () => {
    const rev = buildDeploymentRevision(makeRevisionInput())
    expect(rev.modelVersionId).toBe('model-v1')
    expect(rev.candidateCanonicalHash).toBe(HASH)
  })

  it('empty revisionId throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => buildDeploymentRevision(makeRevisionInput({ revisionId: '' }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('invalid candidateCanonicalHash format throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => buildDeploymentRevision(makeRevisionInput({ candidateCanonicalHash: 'bad' as ContentHash }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('empty rollbackTargetRevisionId throws DEPLOYMENT_MISSING_ROLLBACK_PLAN', () => {
    expect(() => buildDeploymentRevision(makeRevisionInput({ rollbackTargetRevisionId: '' }))).toThrow('DEPLOYMENT_MISSING_ROLLBACK_PLAN')
  })

  it('idempotent — same revisionId with same content', () => {
    const store = new Map<string, DeploymentRevision>()
    const input = makeRevisionInput()
    const r1 = buildDeploymentRevision(input, store)
    const r2 = buildDeploymentRevision(input, store)
    expect(r1.revisionHash).toBe(r2.revisionHash)
    expect(store.size).toBe(1)
  })

  it('conflict — same revisionId different content throws DEPLOYMENT_REVISION_CONFLICT', () => {
    const store = new Map<string, DeploymentRevision>()
    buildDeploymentRevision(makeRevisionInput(), store)
    expect(() => buildDeploymentRevision(makeRevisionInput({ modelVersionId: 'model-v2' }), store)).toThrow('DEPLOYMENT_REVISION_CONFLICT')
  })
})

// ── rollout strategies ────────────────────────────────────────────────────────

describe('validateRolloutPlan: strategies', () => {
  it('accepts direct strategy', () => {
    const plan = validateRolloutPlan({ deploymentId: DEP, strategy: 'direct', steps: [{ revisionId: 'rev-1', trafficPercent: 100 }], createdAt: NOW })
    expect(plan.strategy).toBe('direct')
  })

  it('accepts rolling strategy', () => {
    const plan = validateRolloutPlan({ deploymentId: DEP, strategy: 'rolling', steps: [{ revisionId: 'rev-1', trafficPercent: 100 }], createdAt: NOW })
    expect(plan.strategy).toBe('rolling')
  })

  it('accepts canary strategy', () => {
    const plan = validateRolloutPlan({
      deploymentId: DEP,
      strategy: 'canary',
      steps: [
        { revisionId: 'rev-1', trafficPercent: 10 },
        { revisionId: 'rev-1', trafficPercent: 50 },
        { revisionId: 'rev-1', trafficPercent: 100 },
      ],
      healthGateRef: 'hg-1',
      createdAt: NOW,
    })
    expect(plan.strategy).toBe('canary')
  })

  it('accepts blue-green strategy', () => {
    const plan = validateRolloutPlan({ deploymentId: DEP, strategy: 'blue-green', steps: [{ revisionId: 'rev-1', trafficPercent: 0 }, { revisionId: 'rev-1', trafficPercent: 100 }], createdAt: NOW })
    expect(plan.strategy).toBe('blue-green')
  })

  it('accepts shadow strategy', () => {
    const plan = validateRolloutPlan({ deploymentId: DEP, strategy: 'shadow', steps: [{ revisionId: 'rev-1', trafficPercent: 0 }], createdAt: NOW })
    expect(plan.strategy).toBe('shadow')
  })

  it('accepts batch strategy', () => {
    const plan = validateRolloutPlan({ deploymentId: DEP, strategy: 'batch', steps: [{ revisionId: 'rev-1', trafficPercent: 100 }], createdAt: NOW })
    expect(plan.strategy).toBe('batch')
  })
})

// ── canary monotonicity ───────────────────────────────────────────────────────

describe('validateRolloutPlan: canary monotonicity', () => {
  it('non-monotonic canary steps throw DEPLOYMENT_CANARY_NON_MONOTONIC', () => {
    expect(() => validateRolloutPlan({
      deploymentId: DEP,
      strategy: 'canary',
      steps: [
        { revisionId: 'rev-1', trafficPercent: 50 },
        { revisionId: 'rev-1', trafficPercent: 30 }, // decrease
        { revisionId: 'rev-1', trafficPercent: 100 },
      ],
      healthGateRef: 'hg-1',
      createdAt: NOW,
    })).toThrow('DEPLOYMENT_CANARY_NON_MONOTONIC')
  })

  it('canary without healthGateRef throws DEPLOYMENT_MISSING_ROLLBACK_PLAN', () => {
    expect(() => validateRolloutPlan({
      deploymentId: DEP,
      strategy: 'canary',
      steps: [{ revisionId: 'rev-1', trafficPercent: 100 }],
      createdAt: NOW,
    })).toThrow('DEPLOYMENT_MISSING_ROLLBACK_PLAN')
  })
})

// ── traffic allocation ────────────────────────────────────────────────────────

describe('validateTrafficAllocation', () => {
  it('total 100 passes', () => {
    expect(() => validateTrafficAllocation([{ revisionId: 'rev-1', trafficPercent: 60 }, { revisionId: 'rev-2', trafficPercent: 40 }])).not.toThrow()
  })

  it('total not 100 (except 0) throws DEPLOYMENT_TRAFFIC_INVALID', () => {
    expect(() => validateTrafficAllocation([{ revisionId: 'rev-1', trafficPercent: 60 }, { revisionId: 'rev-2', trafficPercent: 30 }])).toThrow('DEPLOYMENT_TRAFFIC_INVALID')
  })

  it('negative allocation throws DEPLOYMENT_TRAFFIC_INVALID', () => {
    expect(() => validateTrafficAllocation([{ revisionId: 'rev-1', trafficPercent: -10 }, { revisionId: 'rev-2', trafficPercent: 110 }])).toThrow('DEPLOYMENT_TRAFFIC_INVALID')
  })

  it('NaN allocation throws DEPLOYMENT_TRAFFIC_NON_FINITE', () => {
    expect(() => validateTrafficAllocation([{ revisionId: 'rev-1', trafficPercent: NaN }])).toThrow('DEPLOYMENT_TRAFFIC_NON_FINITE')
  })

  it('Infinity allocation throws DEPLOYMENT_TRAFFIC_NON_FINITE', () => {
    expect(() => validateTrafficAllocation([{ revisionId: 'rev-1', trafficPercent: Infinity }])).toThrow('DEPLOYMENT_TRAFFIC_NON_FINITE')
  })

  it('total 0 (shadow/pre-deploy) passes', () => {
    expect(() => validateTrafficAllocation([{ revisionId: 'rev-1', trafficPercent: 0 }])).not.toThrow()
  })

  it('floating-point 100 within epsilon passes', () => {
    // 33.33 + 33.33 + 33.34 = 100.0 in IEEE 754
    expect(() => validateTrafficAllocation([
      { revisionId: 'rev-1', trafficPercent: 33.33 },
      { revisionId: 'rev-2', trafficPercent: 33.33 },
      { revisionId: 'rev-3', trafficPercent: 33.34 },
    ])).not.toThrow()
  })

  it('empty steps pass (no traffic yet)', () => {
    expect(() => validateTrafficAllocation([])).not.toThrow()
  })
})
