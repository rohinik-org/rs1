import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  // Error taxonomy
  FEDERATION_ERROR_CODES,
  FederationError,
  makeFederationError,
  type FederationErrorCode,

  // Branded IDs (compile-time cast checks)
  type FederationId,
  type NodeId,
  type EpochId,
  type MembershipSnapshotId,
  type TopologyEdgeId,
  type PlacementId,
  type RemoteExecutionId,
  type ReplicatedRecordId,
  type FailureObservationId,
  type RecoveryId,
  type AttestationId,
  type AdmissionId,
  type RevocationId,
  type AdvertisementId,
  type ConflictId,
  type PartitionId,
  type FailoverId,
  type FederationEnvelopeId,
  type EvidenceId,

  // Lifecycle states
  FEDERATION_STATES,
  NODE_STATES,
  EPOCH_STATES,
  PLACEMENT_STATES,
  REMOTE_EXECUTION_STATES,
  REPLICATION_STATES,
  FAILOVER_STATES,

  // Consistency classes
  CONSISTENCY_CLASSES,
  type ConsistencyClass,

  // Repository ports
  type FederationRepository,
  type NodeRepository,
  type EpochRepository,
  type MembershipRepository,
  type TopologyRepository,
  type PlacementRepository,
  type RemoteExecutionRecordRepository,
  type ReplicationRepository,
  type FailureRepository,
  type RecoveryRepository,

  // Ports
  type TransportPort,
  type AttestationPort,
  type PolicyPort,
  type RoutingPort,
  type TrustPort,
  type EvidencePort,
  type CoordinationPort,
  type ClockPort,
  type IdPort,
  type HashPort,

  // Service shell
  FederationService,

  // Laws
  STAGE_14_CONSTITUTIONAL_LAWS,
} from '../index.js'

// ── Error taxonomy ──────────────────────────────────────────────────────────

describe('FEDERATION_ERROR_CODES', () => {
  it('all required codes exist', () => {
    const codes = Object.keys(FEDERATION_ERROR_CODES)
    for (const c of [
      'FEDERATION_NODE_NOT_ADMITTED',
      'FEDERATION_IMPLICIT_TRUST_PROPAGATION',
      'FEDERATION_POLICY_WEAKENED',
      'FEDERATION_EVIDENCE_MISSING',
      'FEDERATION_DETERMINISM_VIOLATED',
      'FEDERATION_SPLIT_BRAIN_BLOCKED',
      'FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH',
      'FEDERATION_STRONG_CONTROL_LAST_WRITE_WINS',
      'FEDERATION_ADVERTISEMENT_AS_AUTHORITY',
      'FEDERATION_PARTITION_UNSAFE',
      'FEDERATION_FAILOVER_NO_NEW_ATTEMPT',
      'FEDERATION_LOCAL_ONLY_REJECTED',
    ]) {
      expect(codes).toContain(c)
    }
  })

  it('all codes unique', () => {
    const codes = Object.values(FEDERATION_ERROR_CODES)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('FederationError', () => {
  it('is an Error with name FEDERATION_ERROR', () => {
    const e = new FederationError('FEDERATION_NODE_NOT_ADMITTED', 'not admitted')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('FEDERATION_ERROR')
  })

  it('message includes code and text', () => {
    const e = new FederationError('FEDERATION_POLICY_WEAKENED', 'weaker policy')
    expect(e.message).toContain('FEDERATION_POLICY_WEAKENED')
    expect(e.message).toContain('weaker policy')
  })

  it('makeFederationError returns FederationError with code', () => {
    const e = makeFederationError('FEDERATION_SPLIT_BRAIN_BLOCKED', 'two leaders')
    expect(e).toBeInstanceOf(FederationError)
    expect(e.code).toBe('FEDERATION_SPLIT_BRAIN_BLOCKED')
  })

  it('serializes without circular refs', () => {
    const e = makeFederationError('FEDERATION_EVIDENCE_MISSING', 'x')
    expect(() => JSON.stringify({ code: e.code, message: e.message })).not.toThrow()
  })
})

// ── Branded IDs ─────────────────────────────────────────────────────────────

describe('branded IDs', () => {
  it('can be cast from string', () => {
    const fid = 'fed-1' as FederationId
    const nid = 'node-1' as NodeId
    const eid = 'epoch-1' as EpochId
    const mid = 'mem-1' as MembershipSnapshotId
    const tid = 'edge-1' as TopologyEdgeId
    const pid = 'place-1' as PlacementId
    const rid = 'rex-1' as RemoteExecutionId
    const rrid = 'rep-1' as ReplicatedRecordId
    const foid = 'fail-1' as FailureObservationId
    const recid = 'rec-1' as RecoveryId
    const aid = 'att-1' as AttestationId
    const adid = 'adm-1' as AdmissionId
    const rvid = 'rev-1' as RevocationId
    const advid = 'adv-1' as AdvertisementId
    const cid = 'conf-1' as ConflictId
    const partid = 'part-1' as PartitionId
    const foverid = 'fover-1' as FailoverId
    const envid = 'env-1' as FederationEnvelopeId
    expect([fid, nid, eid, mid, tid, pid, rid, rrid, foid, recid, aid, adid, rvid, advid, cid, partid, foverid, envid].length).toBe(18)
    const ids = [fid, nid, eid, mid, tid, pid, rid, rrid, foid, recid, aid, adid, rvid, advid, cid, partid, foverid, envid]
    expect(new Set(ids).size).toBe(18)
  })
})

// ── Lifecycle states ────────────────────────────────────────────────────────

describe('lifecycle states', () => {
  it('FEDERATION_STATES', () => {
    expect(FEDERATION_STATES).toEqual(['FORMING', 'ACTIVE', 'DEGRADED', 'PARTITIONED', 'DISSOLVING', 'DISSOLVED'])
  })
  it('NODE_STATES', () => {
    expect(NODE_STATES).toEqual(['PENDING_ADMISSION', 'ADMITTED', 'DRAINING', 'REVOKED', 'FAILED'])
  })
  it('EPOCH_STATES', () => {
    expect(EPOCH_STATES).toEqual(['CURRENT', 'SUPERSEDED'])
  })
  it('PLACEMENT_STATES', () => {
    expect(PLACEMENT_STATES).toEqual(['PENDING', 'ACCEPTED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED'])
  })
  it('REMOTE_EXECUTION_STATES', () => {
    expect(REMOTE_EXECUTION_STATES).toEqual(['REQUESTED', 'ACCEPTED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'])
  })
  it('REPLICATION_STATES', () => {
    expect(REPLICATION_STATES).toEqual(['PENDING', 'COMMITTED', 'CONFLICT', 'TOMBSTONED'])
  })
  it('FAILOVER_STATES', () => {
    expect(FAILOVER_STATES).toEqual(['DETECTING', 'DECIDED', 'EXECUTING', 'COMPLETED', 'ABORTED'])
  })
})

// ── Consistency classes ─────────────────────────────────────────────────────

describe('CONSISTENCY_CLASSES', () => {
  it('all four classes present', () => {
    expect(CONSISTENCY_CLASSES).toEqual(['STRONG_CONTROL', 'CAUSAL_EVIDENCE', 'EVENTUAL_OBSERVATION', 'LOCAL_ONLY'])
  })
  it('is assignable to ConsistencyClass', () => {
    const c: ConsistencyClass = 'STRONG_CONTROL'
    expect(CONSISTENCY_CLASSES).toContain(c)
  })
})

// ── Repository ports ────────────────────────────────────────────────────────

describe('repository port shapes', () => {
  const mk = () => ({ save: async () => {}, findById: async () => undefined })
  it('FederationRepository', () => {
    const r: FederationRepository = mk()
    expect(typeof r.save).toBe('function')
    expect(typeof r.findById).toBe('function')
  })
  it('NodeRepository', () => {
    const r: NodeRepository = mk()
    expect(typeof r.save).toBe('function')
  })
  it('EpochRepository', () => {
    const r: EpochRepository = mk()
    expect(typeof r.save).toBe('function')
  })
  it('PlacementRepository', () => {
    const r: PlacementRepository = mk()
    expect(typeof r.save).toBe('function')
  })
  it('all ten repositories importable', () => {
    const membership: MembershipRepository = mk()
    const topology: TopologyRepository = mk()
    const remote: RemoteExecutionRecordRepository = mk()
    const replication: ReplicationRepository = mk()
    const failure: FailureRepository = mk()
    const recovery: RecoveryRepository = mk()
    expect([membership, topology, remote, replication, failure, recovery].every(r => typeof r.save === 'function')).toBe(true)
  })
})

// ── Ports ───────────────────────────────────────────────────────────────────

describe('ports importable', () => {
  it('TransportPort', () => {
    const p: TransportPort = { send: async () => {}, receive: async function* () {} }
    expect(typeof p.send).toBe('function')
  })
  it('AttestationPort', () => {
    const p: AttestationPort = { attest: async () => ({ attestationId: 'att-1' as AttestationId, nodeId: 'node-1' as NodeId, attestationHash: 'sha256:x' as never, attestedAt: '2024-01-01T00:00:00.000Z' as never }), verify: async () => true }
    expect(typeof p.attest).toBe('function')
  })
  it('PolicyPort', () => {
    const p: PolicyPort = { evaluate: async () => ({ admitted: true }) }
    expect(typeof p.evaluate).toBe('function')
  })
  it('RoutingPort', () => {
    const p: RoutingPort = { resolveTarget: async () => undefined }
    expect(typeof p.resolveTarget).toBe('function')
  })
  it('TrustPort', () => {
    const p: TrustPort = { getTrustSnapshot: async () => undefined }
    expect(typeof p.getTrustSnapshot).toBe('function')
  })
  it('EvidencePort', () => {
    const p: EvidencePort = { open: async () => 'e' as EvidenceId, record: async () => {}, seal: async () => {} }
    expect(typeof p.seal).toBe('function')
  })
  it('CoordinationPort', () => {
    const p: CoordinationPort = { leaderHint: async () => undefined }
    expect(typeof p.leaderHint).toBe('function')
  })
  it('ClockPort', () => {
    const p: ClockPort = { monotonicNow: () => '2024-01-01T00:00:00.000Z' as never }
    expect(typeof p.monotonicNow).toBe('function')
  })
  it('IdPort', () => {
    const p: IdPort = { generate: () => 'id-1' }
    expect(p.generate()).toBe('id-1')
  })
  it('HashPort', () => {
    const p: HashPort = { hash: () => 'sha256:x' as never }
    expect(typeof p.hash).toBe('function')
  })
})

// ── Service shell ───────────────────────────────────────────────────────────

describe('FederationService', () => {
  it('constructs from the ten ports', () => {
    const svc = new FederationService(
      { send: async () => {}, receive: async function* () {} },
      { attest: async () => ({ attestationId: 'att-1' as AttestationId, nodeId: 'node-1' as NodeId, attestationHash: 'sha256:x' as never, attestedAt: '2024-01-01T00:00:00.000Z' as never }), verify: async () => true },
      { evaluate: async () => ({ admitted: true }) },
      { resolveTarget: async () => undefined },
      { getTrustSnapshot: async () => undefined },
      { open: async () => 'e' as EvidenceId, record: async () => {}, seal: async () => {} },
      { leaderHint: async () => undefined },
      { monotonicNow: () => '2024-01-01T00:00:00.000Z' as never },
      { generate: () => 'id-1' },
      { hash: () => 'sha256:x' as never },
    )
    expect(svc).toBeInstanceOf(FederationService)
  })
})

// ── Constitutional laws ─────────────────────────────────────────────────────

describe('STAGE_14_CONSTITUTIONAL_LAWS', () => {
  it('has exactly 12 entries', () => {
    expect(STAGE_14_CONSTITUTIONAL_LAWS.length).toBe(12)
  })
  it('has LAW-118 through LAW-129', () => {
    const ids = STAGE_14_CONSTITUTIONAL_LAWS.map(l => l.id)
    for (let n = 118; n <= 129; n++) expect(ids).toContain(`LAW-${n}`)
  })
  it('every law has a description', () => {
    expect(STAGE_14_CONSTITUTIONAL_LAWS.every(l => l.description.length > 0)).toBe(true)
  })
})

// ── Architecture guardrails ─────────────────────────────────────────────────

describe('architecture: no direct infrastructure dependencies', () => {
  const src = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8')

  it('does not import forbidden infrastructure modules', () => {
    for (const forbidden of ['net', 'socket', 'dgram', 'tls', 'http', 'https', 'kubernetes', 'k8s-client', '@kubernetes', 'grpc', 'ioredis', 'pg', 'mongodb']) {
      expect(src).not.toMatch(new RegExp(`from ['"]${forbidden}['"]`))
      expect(src).not.toMatch(new RegExp(`require\\(['"]${forbidden}['"]\\)`))
    }
  })

  it('exposes no unrestricted federation / provider constructs', async () => {
    const mod = await import('../index.js')
    for (const banned of ['connectSocket', 'openTcpConnection', 'createConsensus', 'kubernetesClient', 'runFederationUnrestricted']) {
      expect(banned in mod).toBe(false)
    }
  })
})
