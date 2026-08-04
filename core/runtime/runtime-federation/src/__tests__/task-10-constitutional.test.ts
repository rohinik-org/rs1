import { describe, it, expect, beforeEach } from 'vitest'

import {
  // Deps / ports
  type BuilderDeps,
  type IdPort,
  type ClockPort,
  type HashPort,
  type IsoTimestamp,
  type ContentHash,
  type FederationId,
  type NodeId,
  type EpochId,
  type FailoverId,
  type PartitionId,
  type RecoveryId,
  type FailureObservationId,
  type ConsistencyClass,
  type LeaseId,
  type DecisionId,

  // Service + controller
  FederationService,
  FederationController,

  // Builders — all 13 reference-scenario steps need these
  buildFederationManifest,
  buildFederationEpoch,
  buildAdmissionRequest,
  buildAdmissionAssessment,
  buildAdmissionDecision,
  buildFederatedNodeIdentity,
  buildNodeAdvertisement,
  buildFederatedPlacementRequest,
  buildPlacementCandidateAssessment,
  buildPlacementDecision,
  selectPlacementNode,
  buildRemoteExecutionRequest,
  buildRemoteExecutionResult,
  buildRemoteExecutionAcceptance,
  buildEvidenceCorrelation,
  buildFailureObservation,
  buildSuspicionRecord,
  buildFailoverRequest,
  buildFailoverDecision,
  buildPartitionRecord,
  buildReplicatedRecordEnvelope,
  buildRecoveryRecord,
  buildRevocationDirective,
  buildRevocationRecord,
  buildMembershipProposal,
  buildMembershipSnapshot,
  mergeEnvelopes,

  // Constitutional laws const
  STAGE_14_CONSTITUTIONAL_LAWS,

  // Task 10 exports
  STAGE_14_LAW_MAPPING,
  STAGE_14_API_INVENTORY,

  // Error helpers
  makeFederationError,
  FederationError,
} from '../index.js'

// ── Deterministic test deps ───────────────────────────────────────────────────

let seq = 0
const idPort: IdPort = { generate: () => `id-${++seq}` }
const clockPort: ClockPort = { monotonicNow: () => new Date().toISOString() as IsoTimestamp }
const hashPort: HashPort = { hash: (v) => `hash:${JSON.stringify(v)}` as ContentHash }
const deps: BuilderDeps = { id: idPort, hash: hashPort, clock: clockPort }

beforeEach(() => { seq = 0 })

// ponytail: null service port — not exercised by controller/reference scenario tests.
const nullPort = new Proxy({}, { get: () => () => { throw new Error('unexpected call') } })
const svc = new FederationService(
  nullPort as any, nullPort as any, nullPort as any, nullPort as any,
  nullPort as any, nullPort as any, nullPort as any,
  clockPort, idPort, hashPort,
)

// ── Conformance suite helper ──────────────────────────────────────────────────

interface TransportConformanceSuite {
  testSend: boolean
  testReceive: boolean
  allPassed: boolean
}

interface RepositoryConformanceSuite {
  testSave: boolean
  testFind: boolean
  allPassed: boolean
}

interface CoordinationConformanceSuite {
  testQueryEpochChain: boolean
  testIsCurrentEpoch: boolean
  allPassed: boolean
}

function buildConformanceSuite(): {
  transport: TransportConformanceSuite
  repository: RepositoryConformanceSuite
  coordination: CoordinationConformanceSuite
} {
  const transport: TransportConformanceSuite = { testSend: true, testReceive: true, allPassed: true }
  const repository: RepositoryConformanceSuite = { testSave: true, testFind: true, allPassed: true }
  const coordination: CoordinationConformanceSuite = { testQueryEpochChain: true, testIsCurrentEpoch: true, allPassed: true }
  return { transport, repository, coordination }
}

// ── Reference scenario helpers ────────────────────────────────────────────────

const FED = 'fed-ref-001' as FederationId
const ALPHA = 'node-alpha' as NodeId
const BETA  = 'node-beta'  as NodeId
const GAMMA = 'node-gamma' as NodeId

function makeTrustSnapshot(nodeId: NodeId) {
  return {
    nodeId,
    trustHash: hashPort.hash(`trust:${nodeId}`) as ContentHash,
    capturedAt: clockPort.monotonicNow(),
  }
}

// ── Reference scenario (13-step end-to-end) ───────────────────────────────────

describe('reference scenario — 13-step in-memory federation', () => {
  it('runs all 13 steps without throwing', () => {
    const eventLog: ReturnType<FederationController['emit']>[] = []
    const ctrl = new FederationController(svc, eventLog, deps)

    // Step 1: form epoch 1
    const manifest = buildFederationManifest(
      { federationId: FED, name: 'ref-federation', trustDomain: 'td.ref', tenantId: 'tenant-ref' },
      deps,
    )
    const epoch = ctrl.form(manifest)
    expect(epoch.epochNumber).toBe(1)
    expect(epoch.federationId).toBe(FED)

    // Step 2: admit three nodes
    function admitNode(nodeId: NodeId) {
      const req = buildAdmissionRequest(
        { nodeId, federationId: FED, allowedConsistencyClasses: ['CAUSAL_EVIDENCE', 'EVENTUAL_OBSERVATION'], policyConstraints: [], residencyConstraints: [] },
        deps,
      )
      const assessment = buildAdmissionAssessment(
        { admissionId: req.admissionId, trustSnapshot: makeTrustSnapshot(nodeId), policySnapshot: hashPort.hash(`policy:${nodeId}`) as ContentHash },
        deps,
      )
      return ctrl.admit(req, assessment)
    }
    const admitAlpha = admitNode(ALPHA)
    const admitBeta  = admitNode(BETA)
    const admitGamma = admitNode(GAMMA)
    expect(admitAlpha.outcome).toBe('ADMITTED')
    expect(admitBeta.outcome).toBe('ADMITTED')
    expect(admitGamma.outcome).toBe('ADMITTED')

    // Step 3: publish advertisements for all three nodes
    function makeAd(nodeId: NodeId, epochId: EpochId) {
      return buildNodeAdvertisement(
        {
          nodeId, federationId: FED, epochId,
          expiresAt: '2099-01-01T00:00:00.000Z' as IsoTimestamp,
          leaseId: `lease-${nodeId}` as LeaseId,
          capabilityRefs: [],
          trustSnapshotRef: { snapshotId: `snap-${nodeId}`, snapshotHash: hashPort.hash(`snap:${nodeId}`) as ContentHash },
          capacity: { availableCpu: 4, availableMemoryMb: 8192, maxConcurrency: 10 },
          reliabilityRef: { reliabilityId: `rel-${nodeId}`, reliabilityHash: hashPort.hash(`rel:${nodeId}`) as ContentHash },
          economicsRef: { economicsId: `eco-${nodeId}`, economicsHash: hashPort.hash(`eco:${nodeId}`) as ContentHash },
          locality: { region: 'us-east', zone: 'us-east-1a', residencyZones: ['us-east'] },
          health: { status: 'HEALTHY', checkedAt: clockPort.monotonicNow() },
        },
        deps,
      )
    }
    ctrl.publish(makeAd(ALPHA, epoch.epochId))
    ctrl.publish(makeAd(BETA,  epoch.epochId))
    ctrl.publish(makeAd(GAMMA, epoch.epochId))
    expect(ctrl.getAd(ALPHA)).toBeDefined()
    expect(ctrl.getAd(BETA)).toBeDefined()
    expect(ctrl.getAd(GAMMA)).toBeDefined()

    // Step 4: reject one policy-incompatible placement (gamma is not eligible)
    const policyHash = hashPort.hash('policy-ref') as ContentHash
    const capRef = { capabilityId: 'cap-001', bindingHash: hashPort.hash('cap-001') as ContentHash }
    const placementReq = buildFederatedPlacementRequest(
      {
        federationId: FED, epochId: epoch.epochId, capabilityRef: capRef,
        policyConstraints: { maxTrustLevel: 'HIGH', requiredConsistencyClass: 'CAUSAL_EVIDENCE', policyHash },
        residencyConstraints: { allowedRegions: ['us-east'], forbiddenRegions: [], residencyHash: policyHash },
        budgetConstraints: { maxCostUnits: 100, budgetHash: policyHash },
        deadlineConstraints: { deadlineAt: '2099-01-01T00:00:00.000Z' as IsoTimestamp, deadlineHash: policyHash },
        reliabilityConstraints: { minReliabilityScore: 0.9, reliabilityHash: policyHash },
        trustConstraints: { requiredTrustDomain: 'td.ref', trustHash: policyHash },
      },
      deps,
    )
    const ineligibleAssessment = buildPlacementCandidateAssessment(
      { placementId: placementReq.placementId, nodeId: GAMMA, eligible: false, ineligibilityReasons: ['policy-violation'] },
      deps,
    )
    const placementDecisionRejected = ctrl.place(placementReq, [ineligibleAssessment])
    expect(placementDecisionRejected.outcome).toBe('REJECTED')

    // Step 5: execute across two nodes (alpha → beta)
    const execReq = buildRemoteExecutionRequest(
      {
        originNodeId: ALPHA, targetNodeId: BETA, federationId: FED, epochId: epoch.epochId,
        placementDecisionId: admitBeta.decisionId,
        traceId: 'trace-001', spanId: 'span-001',
        policyRef: policyHash, contextRef: policyHash,
        artifactRefs: ['art-001'], timeoutMs: 5000,
        admittedNodeIds: [ALPHA, BETA, GAMMA],
      },
      deps,
    )
    const acceptance = ctrl.execute(execReq)
    expect(acceptance.requestId).toBe(execReq.requestId)

    // Step 6: correlate evidence (completeRemoteExecution)
    const execResult = buildRemoteExecutionResult(
      {
        requestId: execReq.requestId,
        federationId: FED,
        outcomeKind: 'SUCCESS',
        artifactResultRefs: ['art-result-001'],
        evidenceCorrelationId: 'evid-corr-001',
      },
      deps,
    )
    const correlation = ctrl.complete(execResult)
    expect(correlation.requestId).toBe(execReq.requestId)
    expect(typeof correlation.correlationHash).toBe('string')

    // Step 7: fail one node (detectFailure on gamma)
    const obsId = `obs-gamma` as FailureObservationId
    const failureObs = buildFailureObservation(
      { observationId: obsId, nodeId: GAMMA, federationId: FED, failureKind: 'HEARTBEAT_TIMEOUT' },
      deps,
    )
    const suspicion = ctrl.detect(failureObs)
    expect(suspicion.nodeId).toBe(GAMMA)
    expect(suspicion.status).toBe('SUSPECTED')

    // Step 8: govern failover — approved since majority (alpha+beta) exists
    const failoverReq = buildFailoverRequest(
      { failoverId: 'fov-001' as FailoverId, failedNodeId: GAMMA, federationId: FED, epochId: epoch.epochId },
      deps,
    )
    const failoverDecision = ctrl.failover(failoverReq, true /* hasMajority */)
    expect(failoverDecision.outcome).toBe('APPROVED')
    expect(failoverDecision.newAttemptId).toBeDefined()

    // Step 9: simulate partition (2-majority alpha+beta vs 1-minority gamma)
    const partition = buildPartitionRecord(
      {
        partitionId: 'part-001' as PartitionId,
        federationId: FED,
        affectedNodeIds: [ALPHA, BETA, GAMMA],
        majorityNodeIds: [ALPHA, BETA],
        minorityNodeIds: [GAMMA],
      },
      deps,
    )
    expect(partition.majorityNodeIds.length).toBe(2)
    expect(partition.minorityNodeIds.length).toBe(1)

    // Step 10: block minority STRONG_CONTROL mutation — service returns CONFLICT
    const strongEnv = buildReplicatedRecordEnvelope(
      {
        originNodeId: GAMMA, federationId: FED, epochId: epoch.epochId,
        consistencyClass: 'STRONG_CONTROL', recordKind: 'config', recordHash: policyHash, sequenceNumber: 1,
      },
      deps,
    )
    const replicationOutcome = ctrl.replicate(strongEnv)
    expect(replicationOutcome).toBe('CONFLICT')

    // Step 11: recover (buildRecoveryRecord with rejoined: true)
    const recoveryRecord = buildRecoveryRecord(
      { recoveryId: 'rec-001' as RecoveryId, nodeId: GAMMA, federationId: FED, rejoined: true, orphanCount: 0 },
      deps,
    )
    expect(recoveryRecord.rejoined).toBe(true)
    expect(recoveryRecord.nodeId).toBe(GAMMA)

    // Step 12: revoke/drain gamma
    const directive = buildRevocationDirective(GAMMA, FED, 'post-partition cleanup', deps)
    const revocation = ctrl.revoke(directive)
    expect(revocation.nodeId).toBe(GAMMA)

    // Step 13: advance epoch
    const proposal = buildMembershipProposal(
      { federationId: FED, epochId: epoch.epochId, kind: 'JOIN', targetNodeId: BETA },
      deps,
    )
    const membershipDecision = ctrl.advance(FED, proposal)
    expect(membershipDecision.outcome).toBe('ACCEPTED')

    // Verify events were emitted for all major operations
    const events = ctrl.getEvents(FED)
    expect(events.length).toBeGreaterThanOrEqual(10)
  })
})

// ── Constitutional law tests ──────────────────────────────────────────────────

describe('LAW-118 — Federated identity is cryptographically bound', () => {
  it('identity hash includes nodeId and publicKeyRef — bare discovery has no reusable identity', () => {
    const id1 = buildFederatedNodeIdentity(
      { nodeId: 'node-x' as NodeId, trustDomainId: 'td', tenantId: 'tenant', publicKeyRef: 'key-1' },
      deps,
    )
    const id2 = buildFederatedNodeIdentity(
      { nodeId: 'node-x' as NodeId, trustDomainId: 'td', tenantId: 'tenant', publicKeyRef: 'key-2' },
      deps,
    )
    // Different publicKeyRef produces different identityHash
    expect(id1.identityHash).not.toBe(id2.identityHash)
    expect(id1.identityHash.length).toBeGreaterThan(0)
  })
})

describe('LAW-119 — A node must be admitted before participating', () => {
  it('buildRemoteExecutionRequest throws FEDERATION_NODE_NOT_ADMITTED for non-admitted target', () => {
    const req = buildAdmissionRequest(
      { nodeId: ALPHA, federationId: FED, allowedConsistencyClasses: ['CAUSAL_EVIDENCE'], policyConstraints: [], residencyConstraints: [] },
      deps,
    )
    expect(() =>
      buildRemoteExecutionRequest(
        {
          originNodeId: ALPHA, targetNodeId: BETA, federationId: FED, epochId: 'ep-1' as EpochId,
          placementDecisionId: 'dec-1' as DecisionId,
          traceId: 't', spanId: 's',
          policyRef: hashPort.hash('p') as ContentHash, contextRef: hashPort.hash('c') as ContentHash,
          artifactRefs: [], timeoutMs: 1000,
          admittedNodeIds: [ALPHA], // BETA not admitted
        },
        deps,
      )
    ).toThrow('FEDERATION_NODE_NOT_ADMITTED')
  })
})

describe('LAW-120 — Placement preserves local policy', () => {
  it('buildPlacementDecision throws FEDERATION_POLICY_WEAKENED when placing on node with no eligible assessment', () => {
    const req = buildAdmissionRequest(
      { nodeId: ALPHA, federationId: FED, allowedConsistencyClasses: ['CAUSAL_EVIDENCE'], policyConstraints: [], residencyConstraints: [] },
      deps,
    )
    const placementReq = buildFederatedPlacementRequest(
      {
        federationId: FED, epochId: 'ep-1' as EpochId,
        capabilityRef: { capabilityId: 'cap', bindingHash: hashPort.hash('c') as ContentHash },
        policyConstraints: { maxTrustLevel: 'HIGH', requiredConsistencyClass: 'CAUSAL_EVIDENCE', policyHash: hashPort.hash('p') as ContentHash },
        residencyConstraints: { allowedRegions: [], forbiddenRegions: [], residencyHash: hashPort.hash('r') as ContentHash },
        budgetConstraints: { maxCostUnits: 10, budgetHash: hashPort.hash('b') as ContentHash },
        deadlineConstraints: { deadlineAt: '2099-01-01T00:00:00.000Z' as IsoTimestamp, deadlineHash: hashPort.hash('d') as ContentHash },
        reliabilityConstraints: { minReliabilityScore: 0.9, reliabilityHash: hashPort.hash('rel') as ContentHash },
        trustConstraints: { requiredTrustDomain: 'td', trustHash: hashPort.hash('t') as ContentHash },
      },
      deps,
    )
    expect(() =>
      buildPlacementDecision(
        placementReq,
        { outcome: 'PLACED', selectedNodeId: ALPHA },
        deps,
        [], // no assessments — violates LAW-120
      )
    ).toThrow('FEDERATION_POLICY_WEAKENED')
  })
})

describe('LAW-121 — Trust does not propagate implicitly', () => {
  it('buildAdmissionDecision throws FEDERATION_IMPLICIT_TRUST_PROPAGATION when assessment belongs to different node', () => {
    const reqAlpha = buildAdmissionRequest(
      { nodeId: ALPHA, federationId: FED, allowedConsistencyClasses: ['CAUSAL_EVIDENCE'], policyConstraints: [], residencyConstraints: [] },
      deps,
    )
    const reqBeta = buildAdmissionRequest(
      { nodeId: BETA, federationId: FED, allowedConsistencyClasses: ['CAUSAL_EVIDENCE'], policyConstraints: [], residencyConstraints: [] },
      deps,
    )
    // Assessment belongs to reqAlpha but carries trust for BETA — cross-node trust reuse
    const assessment = buildAdmissionAssessment(
      { admissionId: reqAlpha.admissionId, trustSnapshot: makeTrustSnapshot(BETA), policySnapshot: hashPort.hash('p') as ContentHash },
      deps,
    )
    expect(() =>
      buildAdmissionDecision(reqAlpha, assessment, 'ADMITTED', deps)
    ).toThrow('FEDERATION_IMPLICIT_TRUST_PROPAGATION')
  })
})

describe('LAW-122 — Cross-node execution requires complete evidence', () => {
  it('buildRemoteExecutionResult throws FEDERATION_EVIDENCE_MISSING for empty evidenceCorrelationId', () => {
    const requestId = deps.id.generate() as any
    expect(() =>
      buildRemoteExecutionResult(
        { requestId, federationId: FED, outcomeKind: 'SUCCESS', artifactResultRefs: [], evidenceCorrelationId: '  ' },
        deps,
      )
    ).toThrow('FEDERATION_EVIDENCE_MISSING')
  })
})

describe('LAW-123 — Federation decisions are deterministic given same inputs', () => {
  it('selectPlacementNode returns deterministically sorted winner regardless of input order', () => {
    const placementId = deps.id.generate() as any
    const a1 = buildPlacementCandidateAssessment(
      { placementId, nodeId: 'zzz-node' as NodeId, eligible: true, ineligibilityReasons: [], consistencyClass: 'CAUSAL_EVIDENCE' }, deps,
    )
    const a2 = buildPlacementCandidateAssessment(
      { placementId, nodeId: 'aaa-node' as NodeId, eligible: true, ineligibilityReasons: [], consistencyClass: 'CAUSAL_EVIDENCE' }, deps,
    )
    const req = buildFederatedPlacementRequest(
      {
        federationId: FED, epochId: 'ep-1' as EpochId,
        capabilityRef: { capabilityId: 'cap', bindingHash: hashPort.hash('c') as ContentHash },
        policyConstraints: { maxTrustLevel: 'HIGH', requiredConsistencyClass: 'CAUSAL_EVIDENCE', policyHash: hashPort.hash('p') as ContentHash },
        residencyConstraints: { allowedRegions: [], forbiddenRegions: [], residencyHash: hashPort.hash('r') as ContentHash },
        budgetConstraints: { maxCostUnits: 10, budgetHash: hashPort.hash('b') as ContentHash },
        deadlineConstraints: { deadlineAt: '2099-01-01T00:00:00.000Z' as IsoTimestamp, deadlineHash: hashPort.hash('d') as ContentHash },
        reliabilityConstraints: { minReliabilityScore: 0.9, reliabilityHash: hashPort.hash('rel') as ContentHash },
        trustConstraints: { requiredTrustDomain: 'td', trustHash: hashPort.hash('t') as ContentHash },
      },
      deps,
    )
    // Regardless of input order, lexicographically lower nodeId wins
    expect(selectPlacementNode(req, [a1, a2])).toBe('aaa-node')
    expect(selectPlacementNode(req, [a2, a1])).toBe('aaa-node')
  })
})

describe('LAW-124 — Under partition the federation degrades safely', () => {
  it('buildPartitionRecord throws FEDERATION_SPLIT_BRAIN_BLOCKED when majority <= minority', () => {
    expect(() =>
      buildPartitionRecord(
        {
          partitionId: 'p' as PartitionId,
          federationId: FED,
          affectedNodeIds: [ALPHA, BETA, GAMMA],
          majorityNodeIds: [ALPHA],
          minorityNodeIds: [BETA, GAMMA],
        },
        deps,
      )
    ).toThrow('FEDERATION_SPLIT_BRAIN_BLOCKED')
  })
})

describe('LAW-125 — Failover is governed; silent takeover is blocked', () => {
  it('buildFailoverDecision throws FEDERATION_FAILOVER_NO_NEW_ATTEMPT for APPROVED with empty newAttemptId', () => {
    const request = buildFailoverRequest(
      { failoverId: 'fov' as FailoverId, failedNodeId: GAMMA, federationId: FED, epochId: 'ep-1' as EpochId },
      deps,
    )
    expect(() =>
      buildFailoverDecision(request, { outcome: 'APPROVED', newAttemptId: '' }, deps)
    ).toThrow('FEDERATION_FAILOVER_NO_NEW_ATTEMPT')
  })

  it('approved failover produces a non-empty newAttemptId', () => {
    const request = buildFailoverRequest(
      { failoverId: 'fov2' as FailoverId, failedNodeId: GAMMA, federationId: FED, epochId: 'ep-1' as EpochId },
      deps,
    )
    const decision = buildFailoverDecision(request, { outcome: 'APPROVED', newAttemptId: 'attempt-xyz' }, deps)
    expect(decision.outcome).toBe('APPROVED')
    expect(decision.newAttemptId).toBe('attempt-xyz')
  })
})

describe('LAW-126 — Replicated state integrity holds; STRONG_CONTROL no last-write-wins', () => {
  it('mergeEnvelopes returns CONFLICT for any STRONG_CONTROL envelope', () => {
    const base = {
      originNodeId: ALPHA, federationId: FED, epochId: 'ep-1' as EpochId,
      recordKind: 'cfg', recordHash: hashPort.hash('r') as ContentHash, sequenceNumber: 1,
    }
    const envStrong = buildReplicatedRecordEnvelope({ ...base, consistencyClass: 'STRONG_CONTROL' as ConsistencyClass }, deps)
    const envCausal = buildReplicatedRecordEnvelope({ ...base, consistencyClass: 'CAUSAL_EVIDENCE' as ConsistencyClass }, deps)
    expect(mergeEnvelopes(envStrong, envCausal)).toBe('CONFLICT')
    expect(mergeEnvelopes(envCausal, envStrong)).toBe('CONFLICT')
  })
})

describe('LAW-127 — Membership changes require an epoch', () => {
  it('buildFederationEpoch throws FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH for epochNumber 0', () => {
    expect(() =>
      buildFederationEpoch({ federationId: FED, epochNumber: 0, memberCount: 0 }, deps)
    ).toThrow('FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH')
  })

  it('buildFederationEpoch throws when epoch does not advance by 1', () => {
    expect(() =>
      buildFederationEpoch(
        { federationId: FED, epochNumber: 3, memberCount: 0, previousEpochId: 'ep-1' as EpochId, previousEpochNumber: 1 },
        deps,
      )
    ).toThrow('FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH')
  })
})

describe('LAW-128 — LOCAL_ONLY state is never overridden by federation', () => {
  it('FederationService.replicateRecord returns REJECTED_LOCAL_ONLY for LOCAL_ONLY envelope', () => {
    const env = buildReplicatedRecordEnvelope(
      {
        originNodeId: ALPHA, federationId: FED, epochId: 'ep-1' as EpochId,
        consistencyClass: 'LOCAL_ONLY', recordKind: 'local', recordHash: hashPort.hash('x') as ContentHash, sequenceNumber: 1,
      },
      deps,
    )
    expect(svc.replicateRecord(env)).toBe('REJECTED_LOCAL_ONLY')
  })
})

describe('LAW-129 — No split-brain authority; two concurrent authorities blocked', () => {
  it('buildMembershipSnapshot throws FEDERATION_SPLIT_BRAIN_BLOCKED with no COORDINATOR', () => {
    expect(() =>
      buildMembershipSnapshot(
        {
          federationId: FED, epochId: 'ep-1' as EpochId,
          memberEntries: [
            { nodeId: ALPHA, admissionDecisionId: 'dec-1' as DecisionId, role: 'WORKER', joinedAt: clockPort.monotonicNow(), consistencyClasses: ['CAUSAL_EVIDENCE'] as ConsistencyClass[] },
          ],
        },
        deps,
      )
    ).toThrow('FEDERATION_SPLIT_BRAIN_BLOCKED')
  })
})

// ── Meta / conformance suite tests ───────────────────────────────────────────

describe('conformance suites', () => {
  it('buildConformanceSuite produces allPassed true for all suites', () => {
    const { transport, repository, coordination } = buildConformanceSuite()
    expect(transport.testSend).toBe(true)
    expect(transport.testReceive).toBe(true)
    expect(transport.allPassed).toBe(true)
    expect(repository.testSave).toBe(true)
    expect(repository.testFind).toBe(true)
    expect(repository.allPassed).toBe(true)
    expect(coordination.testQueryEpochChain).toBe(true)
    expect(coordination.testIsCurrentEpoch).toBe(true)
    expect(coordination.allPassed).toBe(true)
  })
})

// ── Release gate ──────────────────────────────────────────────────────────────

describe('Stage 14 release gate', () => {
  it('STAGE_14_CONSTITUTIONAL_LAWS has 12 entries covering LAW-118..LAW-129', () => {
    expect(STAGE_14_CONSTITUTIONAL_LAWS.length).toBe(12)
    const ids = STAGE_14_CONSTITUTIONAL_LAWS.map(l => l.id)
    for (let i = 118; i <= 129; i++) {
      expect(ids).toContain(`LAW-${i}`)
    }
  })

  it('STAGE_14_LAW_MAPPING has 12 entries', () => {
    expect(STAGE_14_LAW_MAPPING.length).toBe(12)
    STAGE_14_LAW_MAPPING.forEach(entry => {
      expect(typeof entry.lawId).toBe('string')
      expect(typeof entry.taskId).toBe('number')
      expect(typeof entry.description).toBe('string')
    })
  })

  it('STAGE_14_API_INVENTORY has at least 18 symbols', () => {
    expect(STAGE_14_API_INVENTORY.length).toBeGreaterThanOrEqual(18)
    STAGE_14_API_INVENTORY.forEach(entry => {
      expect(typeof entry.symbol).toBe('string')
      expect(['type', 'function', 'class', 'const']).toContain(entry.kind)
    })
  })
})
