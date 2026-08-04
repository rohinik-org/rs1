import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildFailureObservation,
  buildSuspicionRecord,
  buildPartitionRecord,
  buildAuthorityAssessment,
  buildFailoverRequest,
  buildFailoverDecision,
  buildRecoveryRecord,
  buildOrphanReconciliation,
  FederationService,
  type FailureObservation,
  type SuspicionRecord,
  type PartitionRecord,
  type AuthorityAssessment,
  type FailoverRequest,
  type FailoverDecision,
  type RecoveryRecord,
  type OrphanReconciliation,
  type FailureObservationId,
  type PartitionId,
  type FailoverId,
  type RecoveryId,
  type FederationId,
  type NodeId,
  type EpochId,
  type EnvelopeId,
  type ContentHash,
  type IsoTimestamp,
  type HashPort,
  type IdPort,
  type ClockPort,
} from '../index.js'

// ── Deterministic test deps ───────────────────────────────────────────────────

const hashPort: HashPort = { hash: (v) => `sha256:${JSON.stringify(v)}` as ContentHash }
let idSeq = 0
const idPort: IdPort = { generate: () => `id-${++idSeq}` }
const clockPort: ClockPort = { monotonicNow: () => '2026-08-04T00:00:00.000Z' as IsoTimestamp }
const deps = { id: idPort, hash: hashPort, clock: clockPort }

beforeEach(() => { idSeq = 0 })

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fed = 'fed-1' as FederationId
const epochId = 'epoch-1' as EpochId
const nodeA = 'node-aaa' as NodeId
const nodeB = 'node-bbb' as NodeId
const nodeC = 'node-ccc' as NodeId
const nodeD = 'node-ddd' as NodeId

// ── Null service deps ─────────────────────────────────────────────────────────

// ponytail: null object pattern for ports we don't exercise in Task 8 tests.
const nullPort = new Proxy({}, { get: () => () => { throw new Error('unexpected call') } })
const svc = new FederationService(
  nullPort as any, nullPort as any, nullPort as any, nullPort as any,
  nullPort as any, nullPort as any, nullPort as any,
  clockPort, idPort, hashPort,
)

// ── buildFailureObservation ───────────────────────────────────────────────────

describe('buildFailureObservation', () => {
  it('produces record with all required fields and observationHash', () => {
    const obs = buildFailureObservation(
      {
        observationId: 'obs-1' as FailureObservationId,
        nodeId: nodeA,
        federationId: fed,
        failureKind: 'HEARTBEAT_TIMEOUT',
      },
      deps,
    )

    expect(obs.observationId).toBe('obs-1')
    expect(obs.nodeId).toBe(nodeA)
    expect(obs.federationId).toBe(fed)
    expect(obs.failureKind).toBe('HEARTBEAT_TIMEOUT')
    expect(obs.observedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(typeof obs.observationHash).toBe('string')
    expect(obs.observationHash.length).toBeGreaterThan(0)
  })

  it('is frozen', () => {
    const obs = buildFailureObservation(
      { observationId: 'obs-1' as FailureObservationId, nodeId: nodeA, federationId: fed, failureKind: 'EXPLICIT_REPORT' },
      deps,
    )
    expect(Object.isFrozen(obs)).toBe(true)
  })
})

// ── buildSuspicionRecord ──────────────────────────────────────────────────────

describe('buildSuspicionRecord', () => {
  it('produces SUSPECTED status record with all required fields', () => {
    const obs = buildFailureObservation(
      { observationId: 'obs-1' as FailureObservationId, nodeId: nodeA, federationId: fed, failureKind: 'HEALTH_CHECK_FAILED' },
      deps,
    )
    const sus = buildSuspicionRecord({ nodeId: nodeA, federationId: fed, observation: obs }, deps)

    expect(sus.nodeId).toBe(nodeA)
    expect(sus.federationId).toBe(fed)
    expect(sus.status).toBe('SUSPECTED')
    expect(typeof sus.suspicionId).toBe('string')
    expect(sus.suspicionId.length).toBeGreaterThan(0)
    expect(sus.suspectedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(sus.confirmedAt).toBeUndefined()
    expect(typeof sus.suspicionHash).toBe('string')
  })

  it('is frozen', () => {
    const obs = buildFailureObservation(
      { observationId: 'obs-1' as FailureObservationId, nodeId: nodeA, federationId: fed, failureKind: 'NETWORK_UNREACHABLE' },
      deps,
    )
    const sus = buildSuspicionRecord({ nodeId: nodeA, federationId: fed, observation: obs }, deps)
    expect(Object.isFrozen(sus)).toBe(true)
  })
})

// ── buildPartitionRecord ──────────────────────────────────────────────────────

describe('buildPartitionRecord', () => {
  it('produces record with all required fields', () => {
    const majority = [nodeA, nodeB, nodeC]
    const minority = [nodeD]
    const rec = buildPartitionRecord(
      {
        partitionId: 'part-1' as PartitionId,
        federationId: fed,
        affectedNodeIds: [...majority, ...minority],
        majorityNodeIds: majority,
        minorityNodeIds: minority,
      },
      deps,
    )

    expect(rec.partitionId).toBe('part-1')
    expect(rec.federationId).toBe(fed)
    expect(rec.majorityNodeIds).toHaveLength(3)
    expect(rec.minorityNodeIds).toHaveLength(1)
    expect(rec.affectedNodeIds).toHaveLength(4)
    expect(typeof rec.detectedAt).toBe('string')
    expect(typeof rec.partitionHash).toBe('string')
  })

  it('is frozen', () => {
    const rec = buildPartitionRecord(
      { partitionId: 'part-1' as PartitionId, federationId: fed, affectedNodeIds: [nodeA, nodeB], majorityNodeIds: [nodeA, nodeB], minorityNodeIds: [nodeC] },
      deps,
    )
    expect(Object.isFrozen(rec)).toBe(true)
  })

  it('LAW-129: throws FEDERATION_SPLIT_BRAIN_BLOCKED when majority not strictly larger than minority', () => {
    // equal size — not strictly larger
    expect(() =>
      buildPartitionRecord(
        { partitionId: 'part-1' as PartitionId, federationId: fed, affectedNodeIds: [nodeA, nodeB], majorityNodeIds: [nodeA], minorityNodeIds: [nodeB] },
        deps,
      ),
    ).toThrow('FEDERATION_SPLIT_BRAIN_BLOCKED')
  })

  it('LAW-129: throws when minority is larger than majority', () => {
    expect(() =>
      buildPartitionRecord(
        { partitionId: 'part-1' as PartitionId, federationId: fed, affectedNodeIds: [nodeA, nodeB, nodeC], majorityNodeIds: [nodeA], minorityNodeIds: [nodeB, nodeC] },
        deps,
      ),
    ).toThrow('FEDERATION_SPLIT_BRAIN_BLOCKED')
  })
})

// ── buildAuthorityAssessment (LAW-124) ────────────────────────────────────────

describe('buildAuthorityAssessment', () => {
  it('forces strongControlBlocked true when hasMajority false (LAW-124)', () => {
    const rec = buildPartitionRecord(
      { partitionId: 'part-1' as PartitionId, federationId: fed, affectedNodeIds: [nodeA, nodeB, nodeC], majorityNodeIds: [nodeA, nodeB], minorityNodeIds: [nodeC] },
      deps,
    )
    const assessment = buildAuthorityAssessment(
      { partitionId: rec.partitionId, hasMajority: false, strongControlBlocked: false },
      deps,
    )
    // LAW-124: even though caller passed false, it must be forced to true
    expect(assessment.hasMajority).toBe(false)
    expect(assessment.strongControlBlocked).toBe(true)
  })

  it('passes through strongControlBlocked as-is when hasMajority true', () => {
    const rec = buildPartitionRecord(
      { partitionId: 'part-1' as PartitionId, federationId: fed, affectedNodeIds: [nodeA, nodeB, nodeC], majorityNodeIds: [nodeA, nodeB], minorityNodeIds: [nodeC] },
      deps,
    )
    const assessment = buildAuthorityAssessment(
      { partitionId: rec.partitionId, hasMajority: true, strongControlBlocked: false },
      deps,
    )
    expect(assessment.hasMajority).toBe(true)
    expect(assessment.strongControlBlocked).toBe(false)
  })

  it('produces record with all required fields', () => {
    const rec = buildPartitionRecord(
      { partitionId: 'part-1' as PartitionId, federationId: fed, affectedNodeIds: [nodeA, nodeB, nodeC], majorityNodeIds: [nodeA, nodeB], minorityNodeIds: [nodeC] },
      deps,
    )
    const assessment = buildAuthorityAssessment(
      { partitionId: rec.partitionId, hasMajority: true, strongControlBlocked: false },
      deps,
    )
    expect(typeof assessment.assessmentId).toBe('string')
    expect(assessment.partitionId).toBe(rec.partitionId)
    expect(typeof assessment.assessedAt).toBe('string')
    expect(typeof assessment.assessmentHash).toBe('string')
  })

  it('is frozen', () => {
    const rec = buildPartitionRecord(
      { partitionId: 'part-1' as PartitionId, federationId: fed, affectedNodeIds: [nodeA, nodeB, nodeC], majorityNodeIds: [nodeA, nodeB], minorityNodeIds: [nodeC] },
      deps,
    )
    expect(Object.isFrozen(buildAuthorityAssessment({ partitionId: rec.partitionId, hasMajority: true, strongControlBlocked: false }, deps))).toBe(true)
  })
})

// ── buildFailoverRequest ──────────────────────────────────────────────────────

describe('buildFailoverRequest', () => {
  it('produces record with all required fields', () => {
    const req = buildFailoverRequest(
      { failoverId: 'fov-1' as FailoverId, failedNodeId: nodeA, federationId: fed, epochId },
      deps,
    )
    expect(req.failoverId).toBe('fov-1')
    expect(req.failedNodeId).toBe(nodeA)
    expect(req.federationId).toBe(fed)
    expect(req.epochId).toBe(epochId)
    expect(typeof req.requestedAt).toBe('string')
    expect(typeof req.failoverHash).toBe('string')
  })

  it('is frozen', () => {
    const req = buildFailoverRequest(
      { failoverId: 'fov-1' as FailoverId, failedNodeId: nodeA, federationId: fed, epochId },
      deps,
    )
    expect(Object.isFrozen(req)).toBe(true)
  })
})

// ── buildFailoverDecision (LAW-125) ───────────────────────────────────────────

describe('buildFailoverDecision', () => {
  function makeRequest(): FailoverRequest {
    return buildFailoverRequest(
      { failoverId: 'fov-1' as FailoverId, failedNodeId: nodeA, federationId: fed, epochId },
      deps,
    )
  }

  it('LAW-125: APPROVED throws FEDERATION_FAILOVER_NO_NEW_ATTEMPT when newAttemptId empty', () => {
    const req = makeRequest()
    expect(() =>
      buildFailoverDecision(req, { outcome: 'APPROVED', newAttemptId: '' }, deps),
    ).toThrow('FEDERATION_FAILOVER_NO_NEW_ATTEMPT')
  })

  it('LAW-125: APPROVED throws when newAttemptId is whitespace only', () => {
    const req = makeRequest()
    expect(() =>
      buildFailoverDecision(req, { outcome: 'APPROVED', newAttemptId: '   ' }, deps),
    ).toThrow('FEDERATION_FAILOVER_NO_NEW_ATTEMPT')
  })

  it('APPROVED with valid newAttemptId succeeds', () => {
    const req = makeRequest()
    const decision = buildFailoverDecision(req, { outcome: 'APPROVED', newAttemptId: 'attempt-42' }, deps)
    expect(decision.outcome).toBe('APPROVED')
    expect(decision.newAttemptId).toBe('attempt-42')
    expect(decision.failoverId).toBe('fov-1')
    expect(decision.federationId).toBe(fed)
    expect(typeof decision.decisionId).toBe('string')
    expect(typeof decision.decidedAt).toBe('string')
    expect(typeof decision.decisionHash).toBe('string')
    expect(decision.denialReason).toBeUndefined()
  })

  it('DENIED is allowed without newAttemptId', () => {
    const req = makeRequest()
    const decision = buildFailoverDecision(req, { outcome: 'DENIED', denialReason: 'no majority' }, deps)
    expect(decision.outcome).toBe('DENIED')
    expect(decision.denialReason).toBe('no majority')
  })

  it('is frozen', () => {
    const req = makeRequest()
    const decision = buildFailoverDecision(req, { outcome: 'APPROVED', newAttemptId: 'attempt-1' }, deps)
    expect(Object.isFrozen(decision)).toBe(true)
  })
})

// ── buildRecoveryRecord ───────────────────────────────────────────────────────

describe('buildRecoveryRecord', () => {
  it('produces record with all required fields', () => {
    const rec = buildRecoveryRecord(
      { recoveryId: 'rec-1' as RecoveryId, nodeId: nodeA, federationId: fed, rejoined: true, orphanCount: 3 },
      deps,
    )
    expect(rec.recoveryId).toBe('rec-1')
    expect(rec.nodeId).toBe(nodeA)
    expect(rec.federationId).toBe(fed)
    expect(rec.rejoined).toBe(true)
    expect(rec.orphanCount).toBe(3)
    expect(typeof rec.recoveredAt).toBe('string')
    expect(typeof rec.recoveryHash).toBe('string')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(
      buildRecoveryRecord(
        { recoveryId: 'rec-1' as RecoveryId, nodeId: nodeA, federationId: fed, rejoined: false, orphanCount: 0 },
        deps,
      ),
    )).toBe(true)
  })
})

// ── buildOrphanReconciliation ─────────────────────────────────────────────────

describe('buildOrphanReconciliation', () => {
  it('produces record with all required fields', () => {
    const orphans = ['env-a', 'env-b'] as EnvelopeId[]
    const rec = buildOrphanReconciliation(
      { recoveryId: 'rec-1' as RecoveryId, orphanedEnvelopes: orphans },
      deps,
    )
    expect(typeof rec.reconciliationId).toBe('string')
    expect(rec.recoveryId).toBe('rec-1')
    expect(rec.orphanedEnvelopes).toHaveLength(2)
    expect(typeof rec.reconciledAt).toBe('string')
    expect(typeof rec.reconciliationHash).toBe('string')
  })

  it('is frozen', () => {
    const rec = buildOrphanReconciliation(
      { recoveryId: 'rec-1' as RecoveryId, orphanedEnvelopes: [] },
      deps,
    )
    expect(Object.isFrozen(rec)).toBe(true)
  })
})

// ── FederationService.detectFailure ──────────────────────────────────────────

describe('FederationService.detectFailure', () => {
  beforeEach(() => { idSeq = 0 })

  it('returns SuspicionRecord with SUSPECTED status', () => {
    const obs = buildFailureObservation(
      { observationId: 'obs-1' as FailureObservationId, nodeId: nodeA, federationId: fed, failureKind: 'HEARTBEAT_TIMEOUT' },
      deps,
    )
    const sus = svc.detectFailure(obs)
    expect(sus.status).toBe('SUSPECTED')
    expect(sus.nodeId).toBe(nodeA)
    expect(sus.federationId).toBe(fed)
    expect(sus.confirmedAt).toBeUndefined()
  })
})

// ── FederationService.governFailover ─────────────────────────────────────────

describe('FederationService.governFailover', () => {
  beforeEach(() => { idSeq = 0 })

  it('APPROVED when hasMajority true', () => {
    const req = buildFailoverRequest(
      { failoverId: 'fov-1' as FailoverId, failedNodeId: nodeA, federationId: fed, epochId },
      deps,
    )
    const decision = svc.governFailover(req, true)
    expect(decision.outcome).toBe('APPROVED')
    expect(decision.newAttemptId).toBeTruthy()
    expect((decision.newAttemptId as string).trim().length).toBeGreaterThan(0)
  })

  it('DENIED when hasMajority false', () => {
    const req = buildFailoverRequest(
      { failoverId: 'fov-1' as FailoverId, failedNodeId: nodeA, federationId: fed, epochId },
      deps,
    )
    const decision = svc.governFailover(req, false)
    expect(decision.outcome).toBe('DENIED')
  })
})
