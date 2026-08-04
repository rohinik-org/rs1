import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildFederationEvent,
  buildShutdownPlan,
  buildAuditQuery,
  buildAuditResult,
  FederationController,
  FederationService,
  buildAdmissionRequest,
  buildAdmissionAssessment,
  buildFederationManifest,
  buildMembershipProposal,
  buildFailureObservation,
  buildFailoverRequest,
  buildRevocationDirective,
  buildReplicatedRecordEnvelope,
  buildRemoteExecutionRequest,
  buildRemoteExecutionResult,
  type FederationEvent,
  type FederationEventId,
  type ShutdownPlanId,
  type AuditQueryId,
  type AuditResultId,
  type FederationId,
  type NodeId,
  type EpochId,
  type FailoverRequest,
  type FailureObservationId,
  type FailoverId,
  type ContentHash,
  type IsoTimestamp,
  type HashPort,
  type IdPort,
  type ClockPort,
  type DecisionId,
} from '../index.js'

// ── Deterministic test deps ────────────────────────────────────────────────────

const hashPort: HashPort = { hash: (v) => `sha256:${JSON.stringify(v)}` as ContentHash }
let idSeq = 0
const idPort: IdPort = { generate: () => `id-${++idSeq}` }
const clockPort: ClockPort = { monotonicNow: () => '2026-08-04T00:00:00.000Z' as IsoTimestamp }
const deps = { id: idPort, hash: hashPort, clock: clockPort }

beforeEach(() => { idSeq = 0 })

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fed = 'fed-1' as FederationId
const fed2 = 'fed-2' as FederationId
const nodeA = 'node-aaa' as NodeId
const nodeB = 'node-bbb' as NodeId
const epochId = 'epoch-1' as EpochId
const payloadHash = 'sha256:payload' as ContentHash

// ── Null service deps ─────────────────────────────────────────────────────────

// ponytail: null object for ports not exercised in Task 9 tests.
const nullPort = new Proxy({}, { get: () => () => { throw new Error('unexpected call') } })
const svc = new FederationService(
  nullPort as any, nullPort as any, nullPort as any, nullPort as any,
  nullPort as any, nullPort as any, nullPort as any,
  clockPort, idPort, hashPort,
)

// ── buildFederationEvent ──────────────────────────────────────────────────────

describe('buildFederationEvent', () => {
  it('produces event with all required fields and eventHash', () => {
    const evt = buildFederationEvent('node-admitted', fed, payloadHash, deps)
    expect(evt.kind).toBe('node-admitted')
    expect(evt.federationId).toBe(fed)
    expect(evt.payloadHash).toBe(payloadHash)
    expect(typeof evt.eventId).toBe('string')
    expect(evt.eventId.length).toBeGreaterThan(0)
    expect(typeof evt.occurredAt).toBe('string')
    expect(typeof evt.eventHash).toBe('string')
    expect(evt.eventHash.length).toBeGreaterThan(0)
  })

  it('is frozen', () => {
    const evt = buildFederationEvent('epoch-advanced', fed, payloadHash, deps)
    expect(Object.isFrozen(evt)).toBe(true)
  })

  it('eventHash differs for different kinds', () => {
    idSeq = 0
    const a = buildFederationEvent('node-admitted', fed, payloadHash, deps)
    idSeq = 0
    const b = buildFederationEvent('node-revoked', fed, payloadHash, deps)
    // same id sequence and payload — only kind differs, so hashes must differ
    expect(a.eventHash).not.toBe(b.eventHash)
  })
})

// ── buildShutdownPlan ─────────────────────────────────────────────────────────

describe('buildShutdownPlan', () => {
  it('produces shutdown plan with all fields', () => {
    const plan = buildShutdownPlan({ federationId: fed, drainNodeIds: [nodeA, nodeB] }, deps)
    expect(plan.federationId).toBe(fed)
    expect(plan.drainNodeIds).toHaveLength(2)
    expect(plan.drainNodeIds[0]).toBe(nodeA)
    expect(typeof plan.planId).toBe('string')
    expect(typeof plan.initiatedAt).toBe('string')
    expect(typeof plan.planHash).toBe('string')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(buildShutdownPlan({ federationId: fed, drainNodeIds: [] }, deps))).toBe(true)
  })
})

// ── buildAuditQuery ───────────────────────────────────────────────────────────

describe('buildAuditQuery', () => {
  it('produces query with all required fields', () => {
    const q = buildAuditQuery({ federationId: fed, queryKind: 'MEMBERSHIP_HISTORY' }, deps)
    expect(q.federationId).toBe(fed)
    expect(q.queryKind).toBe('MEMBERSHIP_HISTORY')
    expect(typeof q.queryId).toBe('string')
    expect(typeof q.queryHash).toBe('string')
  })

  it('accepts optional rangeStart and rangeEnd', () => {
    const q = buildAuditQuery(
      { federationId: fed, queryKind: 'FAILURE_HISTORY', rangeStart: '2026-01-01T00:00:00.000Z' as IsoTimestamp, rangeEnd: '2026-12-31T00:00:00.000Z' as IsoTimestamp },
      deps,
    )
    expect(q.rangeStart).toBe('2026-01-01T00:00:00.000Z')
    expect(q.rangeEnd).toBe('2026-12-31T00:00:00.000Z')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(buildAuditQuery({ federationId: fed, queryKind: 'EVIDENCE_SUMMARY' }, deps))).toBe(true)
  })
})

// ── buildAuditResult ──────────────────────────────────────────────────────────

describe('buildAuditResult', () => {
  it('produces result with correct recordCount', () => {
    const q = buildAuditQuery({ federationId: fed, queryKind: 'PLACEMENT_HISTORY' }, deps)
    const result = buildAuditResult(q, 7, deps)
    expect(result.queryId).toBe(q.queryId)
    expect(result.recordCount).toBe(7)
    expect(typeof result.resultId).toBe('string')
    expect(typeof result.resultAt).toBe('string')
    expect(typeof result.resultHash).toBe('string')
  })

  it('is frozen', () => {
    const q = buildAuditQuery({ federationId: fed, queryKind: 'REPLICATION_HISTORY' }, deps)
    expect(Object.isFrozen(buildAuditResult(q, 0, deps))).toBe(true)
  })
})

// ── FederationController.emit ─────────────────────────────────────────────────

describe('FederationController.emit', () => {
  it('pushes event to log and returns it', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)
    const evt = ctrl.emit('node-admitted', fed, payloadHash)
    expect(log).toHaveLength(1)
    expect(log[0]).toBe(evt)
    expect(evt.kind).toBe('node-admitted')
    expect(evt.federationId).toBe(fed)
  })
})

// ── FederationController.getEvents ────────────────────────────────────────────

describe('FederationController.getEvents', () => {
  it('filters events by federationId', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)
    ctrl.emit('node-admitted', fed, payloadHash)
    ctrl.emit('epoch-advanced', fed2, payloadHash)
    ctrl.emit('record-replicated', fed, payloadHash)

    const fedEvents = ctrl.getEvents(fed)
    expect(fedEvents).toHaveLength(2)
    expect(fedEvents.every(e => e.federationId === fed)).toBe(true)
  })

  it('returns empty array when no events for federation', () => {
    const ctrl = new FederationController(svc, [], deps)
    expect(ctrl.getEvents(fed)).toHaveLength(0)
  })
})

// ── FederationController.initiateShutdown ─────────────────────────────────────

describe('FederationController.initiateShutdown', () => {
  it('returns ShutdownPlan', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)
    const plan = ctrl.initiateShutdown(fed, [nodeA])
    expect(plan.federationId).toBe(fed)
    expect(plan.drainNodeIds).toContain(nodeA)
    expect(typeof plan.planHash).toBe('string')
  })
})

// ── FederationController.runAuditQuery ────────────────────────────────────────

describe('FederationController.runAuditQuery', () => {
  it('returns AuditResult with recordCount matching records.length', () => {
    const ctrl = new FederationController(svc, [], deps)
    const q = buildAuditQuery({ federationId: fed, queryKind: 'MEMBERSHIP_HISTORY' }, deps)
    const result = ctrl.runAuditQuery(q, ['a', 'b', 'c'])
    expect(result.queryId).toBe(q.queryId)
    expect(result.recordCount).toBe(3)
  })

  it('returns 0 for empty records', () => {
    const ctrl = new FederationController(svc, [], deps)
    const q = buildAuditQuery({ federationId: fed, queryKind: 'EVIDENCE_SUMMARY' }, deps)
    const result = ctrl.runAuditQuery(q, [])
    expect(result.recordCount).toBe(0)
  })
})

// ── FederationController.admit delegates and emits ────────────────────────────

describe('FederationController.admit', () => {
  it('delegates to service AND emits node-admitted event', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)

    const request = buildAdmissionRequest(
      {
        nodeId: nodeA,
        federationId: fed,
        allowedConsistencyClasses: ['CAUSAL_EVIDENCE'],
        policyConstraints: [],
        residencyConstraints: [],
      },
      deps,
    )
    const assessment = buildAdmissionAssessment(
      {
        admissionId: request.admissionId,
        trustSnapshot: { nodeId: nodeA, trustHash: 'sha256:trust' as ContentHash, capturedAt: clockPort.monotonicNow() },
        policySnapshot: 'sha256:policy' as ContentHash,
      },
      deps,
    )

    const decision = ctrl.admit(request, assessment)
    expect(decision.outcome).toBe('ADMITTED')
    expect(log).toHaveLength(1)
    const admitEvt = log[0]!
    expect(admitEvt.kind).toBe('node-admitted')
    expect(admitEvt.federationId).toBe(fed)
  })
})

// ── FederationController.form delegates and emits ─────────────────────────────

describe('FederationController.form', () => {
  it('delegates to service AND emits federation-formed event', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)

    const manifest = buildFederationManifest(
      { federationId: fed, name: 'test-fed', trustDomain: 'td', tenantId: 'tenant-1' },
      deps,
    )

    const epoch = ctrl.form(manifest)
    expect(epoch.federationId).toBe(fed)
    expect(log).toHaveLength(1)
    const formEvt = log[0]!
    expect(formEvt.kind).toBe('federation-formed')
    expect(formEvt.federationId).toBe(fed)
  })
})

// ── FederationController.revoke delegates and emits ───────────────────────────

describe('FederationController.revoke', () => {
  it('delegates to service AND emits node-revoked event', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)

    const directive = buildRevocationDirective(nodeA, fed, 'security policy violation', deps)
    const record = ctrl.revoke(directive)

    expect(record.nodeId).toBe(nodeA)
    expect(record.federationId).toBe(fed)
    expect(log).toHaveLength(1)
    const evt = log[0]!
    expect(evt.kind).toBe('node-revoked')
    expect(evt.federationId).toBe(fed)
  })
})

// ── FederationController.replicate delegates and emits ────────────────────────

describe('FederationController.replicate', () => {
  it('delegates to service AND emits record-replicated event', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)

    const env = buildReplicatedRecordEnvelope(
      {
        originNodeId: nodeA,
        federationId: fed,
        epochId,
        consistencyClass: 'CAUSAL_EVIDENCE',
        recordKind: 'test-record',
        recordHash: 'sha256:record' as ContentHash,
        sequenceNumber: 1,
      },
      deps,
    )

    const outcome = ctrl.replicate(env)
    expect(outcome).toBe('ACCEPTED')
    expect(log).toHaveLength(1)
    const evt = log[0]!
    expect(evt.kind).toBe('record-replicated')
    expect(evt.federationId).toBe(fed)
  })
})

// ── FederationController.detect delegates and emits ───────────────────────────

describe('FederationController.detect', () => {
  it('delegates to service AND emits failure-detected event', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)

    const obs = buildFailureObservation(
      {
        observationId: 'obs-1' as FailureObservationId,
        nodeId: nodeA,
        federationId: fed,
        failureKind: 'HEARTBEAT_TIMEOUT',
      },
      deps,
    )

    const suspicion = ctrl.detect(obs)
    expect(suspicion.nodeId).toBe(nodeA)
    expect(suspicion.federationId).toBe(fed)
    expect(log).toHaveLength(1)
    const evt = log[0]!
    expect(evt.kind).toBe('failure-detected')
    expect(evt.federationId).toBe(fed)
  })
})

// ── FederationController.complete delegates and emits ─────────────────────────

describe('FederationController.complete', () => {
  it('delegates to service AND emits remote-execution-completed event with correct federationId', () => {
    const log: FederationEvent[] = []
    const ctrl = new FederationController(svc, log, deps)

    const result = buildRemoteExecutionResult(
      {
        requestId: 'req-1' as import('../index.js').RemoteExecutionId,
        federationId: fed,
        outcomeKind: 'SUCCESS',
        artifactResultRefs: [],
        evidenceCorrelationId: 'corr-test',
      },
      deps,
    )

    const correlation = ctrl.complete(result)
    expect(correlation.federationId).toBe(fed)
    expect(log).toHaveLength(1)
    const evt = log[0]!
    expect(evt.kind).toBe('remote-execution-completed')
    expect(evt.federationId).toBe(fed)
  })
})
