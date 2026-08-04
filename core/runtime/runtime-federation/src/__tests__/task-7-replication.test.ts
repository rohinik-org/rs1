import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildReplicatedRecordEnvelope,
  buildReplicationPolicy,
  buildStrongControlCommitRef,
  buildConflictRecord,
  buildTombstone,
  verifyEnvelopeIntegrity,
  mergeEnvelopes,
  rejectLocalOnly,
  FederationService,
  type ReplicatedRecordEnvelope,
  type ReplicationPolicy,
  type StrongControlCommitRef,
  type ConflictRecord,
  type Tombstone,
  type IntegrityVerificationResult,
  type EnvelopeId,
  type FederationId,
  type NodeId,
  type EpochId,
  type ContentHash,
  type IsoTimestamp,
  type HashPort,
  type IdPort,
  type ClockPort,
  type ConsistencyClass,
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

function makeEnvelope(
  originNodeId: NodeId,
  consistencyClass: ConsistencyClass,
  sequenceNumber: number,
): ReplicatedRecordEnvelope {
  return buildReplicatedRecordEnvelope(
    {
      originNodeId,
      federationId: fed,
      epochId,
      consistencyClass,
      recordKind: 'TEST_RECORD',
      recordHash: 'sha256:record' as ContentHash,
      sequenceNumber,
    },
    deps,
  )
}

// ── Null service deps ─────────────────────────────────────────────────────────

// ponytail: null object pattern for ports we don't exercise in Task 7 tests.
const nullPort = new Proxy({}, { get: () => () => { throw new Error('unexpected call') } })
const svc = new FederationService(
  nullPort as any, nullPort as any, nullPort as any, nullPort as any,
  nullPort as any, nullPort as any, nullPort as any,
  clockPort, idPort, hashPort,
)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildReplicatedRecordEnvelope', () => {
  it('produces record with all fields and envelopeHash', () => {
    const env = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 1)
    expect(env.envelopeId).toBeTruthy()
    expect(env.originNodeId).toBe(nodeA)
    expect(env.federationId).toBe(fed)
    expect(env.epochId).toBe(epochId)
    expect(env.consistencyClass).toBe('CAUSAL_EVIDENCE')
    expect(env.recordKind).toBe('TEST_RECORD')
    expect(env.recordHash).toBe('sha256:record')
    expect(env.sequenceNumber).toBe(1)
    expect(env.replicatedAt).toBeTruthy()
    expect(env.envelopeHash).toBeTruthy()
  })

  it('is frozen', () => {
    const env = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 1)
    expect(Object.isFrozen(env)).toBe(true)
  })
})

describe('buildReplicationPolicy', () => {
  it('produces record with all fields', () => {
    const policy = buildReplicationPolicy(
      { federationId: fed, consistencyClass: 'STRONG_CONTROL', quorumSize: 3 },
      deps,
    )
    expect(policy.policyId).toBeTruthy()
    expect(policy.federationId).toBe(fed)
    expect(policy.consistencyClass).toBe('STRONG_CONTROL')
    expect(policy.quorumSize).toBe(3)
    expect(policy.policyHash).toBeTruthy()
    expect(Object.isFrozen(policy)).toBe(true)
  })
})

describe('buildStrongControlCommitRef', () => {
  it('produces record with all fields', () => {
    const env = makeEnvelope(nodeA, 'STRONG_CONTROL', 1)
    const ref = buildStrongControlCommitRef(env.envelopeId, deps)
    expect(ref.commitRefId).toBeTruthy()
    expect(ref.envelopeId).toBe(env.envelopeId)
    expect(ref.committedAt).toBeTruthy()
    expect(ref.commitHash).toBeTruthy()
    expect(Object.isFrozen(ref)).toBe(true)
  })
})

describe('buildConflictRecord', () => {
  it('produces record with envelopeA and envelopeB', () => {
    const envA = makeEnvelope(nodeA, 'STRONG_CONTROL', 1)
    const envB = makeEnvelope(nodeB, 'STRONG_CONTROL', 1)
    const conflict = buildConflictRecord(envA.envelopeId, envB.envelopeId, deps)
    expect(conflict.conflictId).toBeTruthy()
    expect(conflict.envelopeA).toBe(envA.envelopeId)
    expect(conflict.envelopeB).toBe(envB.envelopeId)
    expect(conflict.detectedAt).toBeTruthy()
    expect(conflict.conflictHash).toBeTruthy()
    expect(Object.isFrozen(conflict)).toBe(true)
  })
})

describe('buildTombstone', () => {
  it('produces record with all fields', () => {
    const env = makeEnvelope(nodeA, 'EVENTUAL_OBSERVATION', 1)
    const ts = buildTombstone(env.envelopeId, deps)
    expect(ts.tombstoneId).toBeTruthy()
    expect(ts.envelopeId).toBe(env.envelopeId)
    expect(ts.tombstonedAt).toBeTruthy()
    expect(ts.tombstoneHash).toBeTruthy()
    expect(Object.isFrozen(ts)).toBe(true)
  })
})

describe('verifyEnvelopeIntegrity', () => {
  it('returns verified: true for unmodified envelope', () => {
    const env = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 5)
    const result = verifyEnvelopeIntegrity(env, hashPort)
    expect(result.verified).toBe(true)
    expect(result.envelopeId).toBe(env.envelopeId)
  })

  it('returns verified: false when envelope is tampered (changed recordHash)', () => {
    const env = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 5)
    // Tamper: create a modified copy with a different recordHash
    const tampered: ReplicatedRecordEnvelope = Object.freeze({
      ...env,
      recordHash: 'sha256:TAMPERED' as ContentHash,
    })
    const result = verifyEnvelopeIntegrity(tampered, hashPort)
    expect(result.verified).toBe(false)
    expect(result.reason).toBeTruthy()
  })
})

describe('mergeEnvelopes — LAW-129 STRONG_CONTROL always CONFLICT', () => {
  it('returns CONFLICT for STRONG_CONTROL even when one has higher sequence', () => {
    const envA = makeEnvelope(nodeA, 'STRONG_CONTROL', 10)
    const envB = makeEnvelope(nodeB, 'STRONG_CONTROL', 1)
    expect(mergeEnvelopes(envA, envB)).toBe('CONFLICT')
  })

  it('returns CONFLICT for STRONG_CONTROL when sequence numbers are equal', () => {
    const envA = makeEnvelope(nodeA, 'STRONG_CONTROL', 5)
    const envB = makeEnvelope(nodeB, 'STRONG_CONTROL', 5)
    expect(mergeEnvelopes(envA, envB)).toBe('CONFLICT')
  })
})

describe('mergeEnvelopes — CAUSAL_EVIDENCE last-write-wins', () => {
  it('accepts A when A has higher sequence number', () => {
    const envA = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 10)
    const envB = makeEnvelope(nodeB, 'CAUSAL_EVIDENCE', 3)
    expect(mergeEnvelopes(envA, envB)).toBe('ACCEPT_A')
  })

  it('accepts B when B has higher sequence number', () => {
    const envA = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 2)
    const envB = makeEnvelope(nodeB, 'CAUSAL_EVIDENCE', 7)
    expect(mergeEnvelopes(envA, envB)).toBe('ACCEPT_B')
  })

  it('uses lexicographic nodeId as deterministic tie-break on equal sequence', () => {
    // nodeA = 'node-aaa', nodeB = 'node-bbb'; 'node-aaa' < 'node-bbb' => ACCEPT_A
    const envA = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 5)
    const envB = makeEnvelope(nodeB, 'CAUSAL_EVIDENCE', 5)
    expect(mergeEnvelopes(envA, envB)).toBe('ACCEPT_A')
  })
})

describe('mergeEnvelopes — EVENTUAL_OBSERVATION', () => {
  it('uses higher sequence number', () => {
    const envA = makeEnvelope(nodeA, 'EVENTUAL_OBSERVATION', 99)
    const envB = makeEnvelope(nodeB, 'EVENTUAL_OBSERVATION', 1)
    expect(mergeEnvelopes(envA, envB)).toBe('ACCEPT_A')
  })
})

describe('rejectLocalOnly — LAW-128', () => {
  it('returns true for LOCAL_ONLY', () => {
    const env = makeEnvelope(nodeA, 'LOCAL_ONLY', 1)
    expect(rejectLocalOnly(env)).toBe(true)
  })

  it('returns false for CAUSAL_EVIDENCE', () => {
    const env = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 1)
    expect(rejectLocalOnly(env)).toBe(false)
  })

  it('returns false for EVENTUAL_OBSERVATION', () => {
    const env = makeEnvelope(nodeA, 'EVENTUAL_OBSERVATION', 1)
    expect(rejectLocalOnly(env)).toBe(false)
  })

  it('returns false for STRONG_CONTROL', () => {
    const env = makeEnvelope(nodeA, 'STRONG_CONTROL', 1)
    expect(rejectLocalOnly(env)).toBe(false)
  })
})

describe('FederationService.replicateRecord', () => {
  it('returns REJECTED_LOCAL_ONLY for LOCAL_ONLY envelope', () => {
    const env = makeEnvelope(nodeA, 'LOCAL_ONLY', 1)
    expect(svc.replicateRecord(env)).toBe('REJECTED_LOCAL_ONLY')
  })

  it('returns CONFLICT for STRONG_CONTROL envelope (LAW-129)', () => {
    const env = makeEnvelope(nodeA, 'STRONG_CONTROL', 1)
    expect(svc.replicateRecord(env)).toBe('CONFLICT')
  })

  it('returns ACCEPTED for CAUSAL_EVIDENCE envelope', () => {
    const env = makeEnvelope(nodeA, 'CAUSAL_EVIDENCE', 1)
    expect(svc.replicateRecord(env)).toBe('ACCEPTED')
  })

  it('returns ACCEPTED for EVENTUAL_OBSERVATION envelope', () => {
    const env = makeEnvelope(nodeA, 'EVENTUAL_OBSERVATION', 1)
    expect(svc.replicateRecord(env)).toBe('ACCEPTED')
  })
})
