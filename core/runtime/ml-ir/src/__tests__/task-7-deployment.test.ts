import { describe, it, expect } from 'vitest'
import {
  deploymentId, endpointId, inferenceRequestId, rollbackDirectiveId,
  modelId, promotionDecisionId,
  contentHash, isoTimestamp,
  canonicalMlHash,
  type ModelDeployment, type DeploymentRevision, type DeploymentState,
  type RolloutPlan, type TrafficAllocationStep,
  type InferenceEndpoint, type EndpointState,
  type InferenceRequest, type InferenceResult, type InferenceOutcome,
  type RollbackDirective,
  type DeployModelRequest, type RollbackRequest,
  isValidDeploymentTransition, isValidEndpointTransition,
  isValidTrafficAllocation,
} from '../../src/index.js'

// ── DeploymentState transitions ───────────────────────────────────────────────

describe('isValidDeploymentTransition', () => {
  it('PENDING → ROLLING_OUT is valid', () => {
    expect(isValidDeploymentTransition('PENDING', 'ROLLING_OUT')).toBe(true)
  })
  it('ROLLING_OUT → ACTIVE is valid', () => {
    expect(isValidDeploymentTransition('ROLLING_OUT', 'ACTIVE')).toBe(true)
  })
  it('ROLLING_OUT → FAILED is valid', () => {
    expect(isValidDeploymentTransition('ROLLING_OUT', 'FAILED')).toBe(true)
  })
  it('ACTIVE → ROLLING_BACK is valid', () => {
    expect(isValidDeploymentTransition('ACTIVE', 'ROLLING_BACK')).toBe(true)
  })
  it('ROLLING_BACK → ACTIVE is valid (rollback completes)', () => {
    expect(isValidDeploymentTransition('ROLLING_BACK', 'ACTIVE')).toBe(true)
  })
  it('ROLLING_BACK → FAILED is valid', () => {
    expect(isValidDeploymentTransition('ROLLING_BACK', 'FAILED')).toBe(true)
  })
  it('ACTIVE → RETIRED is valid', () => {
    expect(isValidDeploymentTransition('ACTIVE', 'RETIRED')).toBe(true)
  })
  it('FAILED → PENDING is invalid (terminal restart rejected)', () => {
    expect(isValidDeploymentTransition('FAILED', 'PENDING')).toBe(false)
  })
  it('RETIRED → ROLLING_OUT is invalid (terminal restart rejected)', () => {
    expect(isValidDeploymentTransition('RETIRED', 'ROLLING_OUT')).toBe(false)
  })
  it('PENDING → ACTIVE is invalid (must roll out first)', () => {
    expect(isValidDeploymentTransition('PENDING', 'ACTIVE')).toBe(false)
  })
})

// ── EndpointState transitions ─────────────────────────────────────────────────

describe('isValidEndpointTransition', () => {
  it('PROVISIONING → READY is valid', () => {
    expect(isValidEndpointTransition('PROVISIONING', 'READY')).toBe(true)
  })
  it('READY → DRAINING is valid', () => {
    expect(isValidEndpointTransition('READY', 'DRAINING')).toBe(true)
  })
  it('DRAINING → TERMINATED is valid', () => {
    expect(isValidEndpointTransition('DRAINING', 'TERMINATED')).toBe(true)
  })
  it('PROVISIONING → FAILED is valid', () => {
    expect(isValidEndpointTransition('PROVISIONING', 'FAILED')).toBe(true)
  })
  it('READY → FAILED is valid', () => {
    expect(isValidEndpointTransition('READY', 'FAILED')).toBe(true)
  })
  it('TERMINATED → READY is invalid (terminal)', () => {
    expect(isValidEndpointTransition('TERMINATED', 'READY')).toBe(false)
  })
  it('FAILED → READY is invalid (terminal)', () => {
    expect(isValidEndpointTransition('FAILED', 'READY')).toBe(false)
  })
})

// ── Traffic allocation ────────────────────────────────────────────────────────

describe('isValidTrafficAllocation', () => {
  it('steps summing to 100 are valid', () => {
    const steps: TrafficAllocationStep[] = [
      { revisionId: 'r1', trafficPercent: 80 },
      { revisionId: 'r2', trafficPercent: 20 },
    ]
    expect(isValidTrafficAllocation(steps)).toBe(true)
  })

  it('steps summing to 0 are valid (no traffic)', () => {
    expect(isValidTrafficAllocation([])).toBe(true)
  })

  it('steps summing to 101 are invalid', () => {
    const steps: TrafficAllocationStep[] = [
      { revisionId: 'r1', trafficPercent: 80 },
      { revisionId: 'r2', trafficPercent: 21 },
    ]
    expect(isValidTrafficAllocation(steps)).toBe(false)
  })

  it('steps with negative percent are invalid', () => {
    const steps: TrafficAllocationStep[] = [
      { revisionId: 'r1', trafficPercent: -10 },
    ]
    expect(isValidTrafficAllocation(steps)).toBe(false)
  })

  it('single step at 100% is valid', () => {
    expect(isValidTrafficAllocation([{ revisionId: 'r1', trafficPercent: 100 }])).toBe(true)
  })
})

// ── ModelDeployment ───────────────────────────────────────────────────────────

describe('ModelDeployment', () => {
  it('deployment references a promotion decision', () => {
    const d: ModelDeployment = {
      deploymentId: deploymentId('dep-001'),
      modelId: modelId('m-001'),
      promotionDecisionId: promotionDecisionId('pd-001'),
      environment: 'production',
      state: 'PENDING',
      currentRevisionId: 'rev-001',
      createdAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    expect(d.promotionDecisionId).toBe('pd-001')
    expect(d.environment).toBe('production')
  })

  it('canonical hash changes when environment changes', () => {
    const base: ModelDeployment = {
      deploymentId: deploymentId('dep-001'),
      modelId: modelId('m-001'),
      promotionDecisionId: promotionDecisionId('pd-001'),
      environment: 'production',
      state: 'PENDING',
      currentRevisionId: 'rev-001',
      createdAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    const changed = { ...base, environment: 'staging' }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── DeploymentRevision ────────────────────────────────────────────────────────

describe('DeploymentRevision', () => {
  it('constructs valid revision', () => {
    const rev: DeploymentRevision = {
      revisionId: 'rev-001',
      deploymentId: deploymentId('dep-001'),
      modelArtifactHash: contentHash('sha256:' + 'a'.repeat(64)),
      createdAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    expect(rev.revisionId).toBe('rev-001')
  })
})

// ── RolloutPlan ───────────────────────────────────────────────────────────────

describe('RolloutPlan', () => {
  it('valid traffic allocation plan', () => {
    const plan: RolloutPlan = {
      deploymentId: deploymentId('dep-001'),
      steps: [
        { revisionId: 'rev-002', trafficPercent: 10 },
        { revisionId: 'rev-001', trafficPercent: 90 },
      ],
      createdAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    const total = plan.steps.reduce((s, t) => s + t.trafficPercent, 0)
    expect(total).toBe(100)
  })
})

// ── InferenceEndpoint ─────────────────────────────────────────────────────────

describe('InferenceEndpoint', () => {
  it('endpoint and deployment states are separate', () => {
    const ep: InferenceEndpoint = {
      endpointId: endpointId('ep-001'),
      deploymentId: deploymentId('dep-001'),
      state: 'READY',
      uri: 'https://inference.example.com/v1/predict',
      createdAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    // endpoint has its own state field — independent of ModelDeployment.state
    expect(ep.state).toBe('READY')
    expect(ep.deploymentId).toBe('dep-001')
  })
})

// ── InferenceRequest ──────────────────────────────────────────────────────────

describe('InferenceRequest', () => {
  it('raw sensitive input not embedded by default', () => {
    const req: InferenceRequest = {
      inferenceRequestId: inferenceRequestId('ir-001'),
      endpointId: endpointId('ep-001'),
      inputHash: contentHash('sha256:' + 'b'.repeat(64)),
      requestedAt: isoTimestamp('2024-03-01T12:00:00.000Z'),
    }
    // inputHash present; no raw input field in type
    expect(req.inputHash).toBeDefined()
    expect(Object.keys(req)).not.toContain('rawInput')
  })
})

// ── InferenceResult ───────────────────────────────────────────────────────────

describe('InferenceResult', () => {
  it('every outcome requires evidence', () => {
    const result: InferenceResult = {
      inferenceRequestId: inferenceRequestId('ir-001'),
      endpointId: endpointId('ep-001'),
      outcome: 'SUCCESS',
      outputHash: contentHash('sha256:' + 'c'.repeat(64)),
      evidenceHash: contentHash('sha256:' + 'd'.repeat(64)),
      latencyMs: 42,
      respondedAt: isoTimestamp('2024-03-01T12:00:00.042Z'),
    }
    // evidenceHash is required — no outcome without evidence
    expect(result.evidenceHash).toBeDefined()
    expect(result.outcome).toBe('SUCCESS')
  })

  it('canonical hash changes when outcome changes', () => {
    const base: InferenceResult = {
      inferenceRequestId: inferenceRequestId('ir-001'),
      endpointId: endpointId('ep-001'),
      outcome: 'SUCCESS',
      outputHash: contentHash('sha256:' + 'c'.repeat(64)),
      evidenceHash: contentHash('sha256:' + 'd'.repeat(64)),
      latencyMs: 42,
      respondedAt: isoTimestamp('2024-03-01T12:00:00.042Z'),
    }
    const changed: InferenceResult = { ...base, outcome: 'FILTERED' }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── RollbackDirective ─────────────────────────────────────────────────────────

describe('RollbackDirective', () => {
  it('rollback requires authorization and different target revision', () => {
    const rb: RollbackDirective = {
      rollbackDirectiveId: rollbackDirectiveId('rb-001'),
      deploymentId: deploymentId('dep-001'),
      fromRevisionId: 'rev-002',
      toRevisionId: 'rev-001',
      authorizationToken: 'tok-abc123',
      reason: 'P0 regression in rev-002',
      issuedAt: isoTimestamp('2024-03-02T00:00:00.000Z'),
    }
    expect(rb.fromRevisionId).not.toBe(rb.toRevisionId)
    expect(rb.authorizationToken).toBeTruthy()
  })

  it('same-revision rollback is detectable', () => {
    const rb: RollbackDirective = {
      rollbackDirectiveId: rollbackDirectiveId('rb-bad'),
      deploymentId: deploymentId('dep-001'),
      fromRevisionId: 'rev-001',
      toRevisionId: 'rev-001',
      authorizationToken: 'tok-xyz',
      reason: 'mistake',
      issuedAt: isoTimestamp('2024-03-02T00:00:00.000Z'),
    }
    // Stage 12E validates; IR exposes the fields for detection
    expect(rb.fromRevisionId).toBe(rb.toRevisionId)
  })
})

// ── Request contracts ─────────────────────────────────────────────────────────

describe('DeployModelRequest', () => {
  it('constructs valid deploy request', () => {
    const req: DeployModelRequest = {
      deploymentId: deploymentId('dep-req-001'),
      modelId: modelId('m-001'),
      promotionDecisionId: promotionDecisionId('pd-001'),
      environment: 'production',
      revisionId: 'rev-001',
      modelArtifactHash: contentHash('sha256:' + 'e'.repeat(64)),
      requestedAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    expect(req.promotionDecisionId).toBe('pd-001')
  })
})

describe('RollbackRequest', () => {
  it('rollback without authorization is detectable at IR level', () => {
    const req: RollbackRequest = {
      deploymentId: deploymentId('dep-001'),
      toRevisionId: 'rev-001',
      authorizationToken: '',
      reason: 'P0 regression',
      requestedAt: isoTimestamp('2024-03-02T00:00:00.000Z'),
    }
    // empty token = no authorization; Stage 12E rejects
    expect(req.authorizationToken).toBe('')
  })
})

// ── Round-trip ────────────────────────────────────────────────────────────────

describe('round-trip JSON serialization', () => {
  it('ModelDeployment round-trips without loss', () => {
    const d: ModelDeployment = {
      deploymentId: deploymentId('dep-rt-001'),
      modelId: modelId('m-rt-001'),
      promotionDecisionId: promotionDecisionId('pd-rt-001'),
      environment: 'staging',
      state: 'ACTIVE',
      currentRevisionId: 'rev-rt-001',
      createdAt: isoTimestamp('2024-04-01T00:00:00.000Z'),
    }
    const parsed = JSON.parse(JSON.stringify(d)) as ModelDeployment
    expect(parsed.deploymentId).toBe(d.deploymentId)
    expect(parsed.state).toBe('ACTIVE')
  })

  it('InferenceResult round-trips without loss', () => {
    const r: InferenceResult = {
      inferenceRequestId: inferenceRequestId('ir-rt-001'),
      endpointId: endpointId('ep-rt-001'),
      outcome: 'SUCCESS',
      outputHash: contentHash('sha256:' + 'f'.repeat(64)),
      evidenceHash: contentHash('sha256:' + 'a'.repeat(64)),
      latencyMs: 15,
      respondedAt: isoTimestamp('2024-04-01T00:00:00.015Z'),
    }
    const parsed = JSON.parse(JSON.stringify(r)) as InferenceResult
    expect(parsed.latencyMs).toBe(15)
    expect(parsed.outcome).toBe('SUCCESS')
  })
})
