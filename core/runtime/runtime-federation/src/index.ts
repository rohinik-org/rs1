import type { ContentHash } from '@rohinik-org/execution-evidence-ir'

// IsoTimestamp lives in ml-ir; runtime-federation only depends on execution-evidence-ir,
// so we re-declare the brand locally rather than pull an extra dependency.
// ponytail: local brand, switch to shared ml-ir type if a cross-package value ever crosses.
export type IsoTimestamp = string & { readonly __brand: 'IsoTimestamp' }
export type { ContentHash }

// ── Error taxonomy ──────────────────────────────────────────────────────────

export const FEDERATION_ERROR_CODES = {
  FEDERATION_NODE_NOT_ADMITTED:               'FEDERATION_NODE_NOT_ADMITTED',
  FEDERATION_IMPLICIT_TRUST_PROPAGATION:      'FEDERATION_IMPLICIT_TRUST_PROPAGATION',
  FEDERATION_POLICY_WEAKENED:                 'FEDERATION_POLICY_WEAKENED',
  FEDERATION_EVIDENCE_MISSING:                'FEDERATION_EVIDENCE_MISSING',
  FEDERATION_DETERMINISM_VIOLATED:            'FEDERATION_DETERMINISM_VIOLATED',
  FEDERATION_SPLIT_BRAIN_BLOCKED:             'FEDERATION_SPLIT_BRAIN_BLOCKED',
  FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH: 'FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH',
  FEDERATION_STRONG_CONTROL_LAST_WRITE_WINS:  'FEDERATION_STRONG_CONTROL_LAST_WRITE_WINS',
  FEDERATION_ADVERTISEMENT_AS_AUTHORITY:      'FEDERATION_ADVERTISEMENT_AS_AUTHORITY',
  FEDERATION_PARTITION_UNSAFE:                'FEDERATION_PARTITION_UNSAFE',
  FEDERATION_FAILOVER_NO_NEW_ATTEMPT:         'FEDERATION_FAILOVER_NO_NEW_ATTEMPT',
  FEDERATION_LOCAL_ONLY_REJECTED:             'FEDERATION_LOCAL_ONLY_REJECTED',
} as const

export type FederationErrorCode = keyof typeof FEDERATION_ERROR_CODES

export class FederationError extends Error {
  override readonly name = 'FEDERATION_ERROR'
  constructor(
    public readonly code: FederationErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export function makeFederationError(code: FederationErrorCode, message: string): FederationError {
  return new FederationError(code, message)
}

// ── Branded IDs ─────────────────────────────────────────────────────────────

export type FederationId          = string & { readonly __brand: 'FederationId' }
export type NodeId                = string & { readonly __brand: 'NodeId' }
export type EpochId               = string & { readonly __brand: 'EpochId' }
export type MembershipSnapshotId  = string & { readonly __brand: 'MembershipSnapshotId' }
export type TopologyEdgeId        = string & { readonly __brand: 'TopologyEdgeId' }
export type PlacementId           = string & { readonly __brand: 'PlacementId' }
export type RemoteExecutionId     = string & { readonly __brand: 'RemoteExecutionId' }
export type ReplicatedRecordId    = string & { readonly __brand: 'ReplicatedRecordId' }
export type FailureObservationId  = string & { readonly __brand: 'FailureObservationId' }
export type RecoveryId            = string & { readonly __brand: 'RecoveryId' }
export type AttestationId         = string & { readonly __brand: 'AttestationId' }
export type AdmissionId           = string & { readonly __brand: 'AdmissionId' }
export type AssessmentId          = string & { readonly __brand: 'AssessmentId' }
export type DecisionId            = string & { readonly __brand: 'DecisionId' }
export type RevocationId          = string & { readonly __brand: 'RevocationId' }
export type AdvertisementId       = string & { readonly __brand: 'AdvertisementId' }
export type ConflictId            = string & { readonly __brand: 'ConflictId' }
export type PartitionId           = string & { readonly __brand: 'PartitionId' }
export type FailoverId            = string & { readonly __brand: 'FailoverId' }
export type FederationEnvelopeId  = string & { readonly __brand: 'FederationEnvelopeId' }
export type EvidenceId            = string & { readonly __brand: 'EvidenceId' }

// ── Lifecycle states ────────────────────────────────────────────────────────

export const FEDERATION_STATES = ['FORMING', 'ACTIVE', 'DEGRADED', 'PARTITIONED', 'DISSOLVING', 'DISSOLVED'] as const
export const NODE_STATES = ['PENDING_ADMISSION', 'ADMITTED', 'DRAINING', 'REVOKED', 'FAILED'] as const
export const EPOCH_STATES = ['CURRENT', 'SUPERSEDED'] as const
export const PLACEMENT_STATES = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED'] as const
export const REMOTE_EXECUTION_STATES = ['REQUESTED', 'ACCEPTED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const
export const REPLICATION_STATES = ['PENDING', 'COMMITTED', 'CONFLICT', 'TOMBSTONED'] as const
export const FAILOVER_STATES = ['DETECTING', 'DECIDED', 'EXECUTING', 'COMPLETED', 'ABORTED'] as const

export type FederationState       = typeof FEDERATION_STATES[number]
export type NodeState             = typeof NODE_STATES[number]
export type EpochState            = typeof EPOCH_STATES[number]
export type PlacementState        = typeof PLACEMENT_STATES[number]
export type RemoteExecutionState  = typeof REMOTE_EXECUTION_STATES[number]
export type ReplicationState      = typeof REPLICATION_STATES[number]
export type FailoverState         = typeof FAILOVER_STATES[number]

// ── Consistency classes ─────────────────────────────────────────────────────

export const CONSISTENCY_CLASSES = ['STRONG_CONTROL', 'CAUSAL_EVIDENCE', 'EVENTUAL_OBSERVATION', 'LOCAL_ONLY'] as const
export type ConsistencyClass = typeof CONSISTENCY_CLASSES[number]

// ── Core record types (stubs — fleshed out in Tasks 2–9) ──────────────────────

export interface FederationRecord {
  readonly federationId: FederationId
  readonly state: FederationState
  readonly epochId: EpochId
  readonly createdAt: IsoTimestamp
}

export interface NodeRecord {
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly state: NodeState
  readonly attestationId: AttestationId | undefined
  readonly admittedAt: IsoTimestamp | undefined
}

export interface EpochRecord {
  readonly epochId: EpochId
  readonly federationId: FederationId
  readonly state: EpochState
  readonly epochHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface MembershipSnapshotRecord {
  readonly snapshotId: MembershipSnapshotId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly memberNodeIds: readonly NodeId[]
  readonly snapshotHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface TopologyEdgeRecord {
  readonly edgeId: TopologyEdgeId
  readonly federationId: FederationId
  readonly fromNodeId: NodeId
  readonly toNodeId: NodeId
  readonly createdAt: IsoTimestamp
}

export interface PlacementRecord {
  readonly placementId: PlacementId
  readonly federationId: FederationId
  readonly targetNodeId: NodeId
  readonly consistencyClass: ConsistencyClass
  readonly state: PlacementState
  readonly placementHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface RemoteExecutionRecord {
  readonly remoteExecutionId: RemoteExecutionId
  readonly placementId: PlacementId
  readonly targetNodeId: NodeId
  readonly state: RemoteExecutionState
  readonly evidenceRef: { readonly evidenceId: EvidenceId; readonly evidenceHash: ContentHash } | undefined
  readonly createdAt: IsoTimestamp
}

export interface ReplicatedRecord {
  readonly recordId: ReplicatedRecordId
  readonly federationId: FederationId
  readonly consistencyClass: ConsistencyClass
  readonly state: ReplicationState
  readonly recordHash: ContentHash
  readonly createdAt: IsoTimestamp
}

// ── Repository ports ────────────────────────────────────────────────────────

export interface FederationRepository {
  save(record: FederationRecord): Promise<void>
  findById(id: FederationId): Promise<FederationRecord | undefined>
}

export interface NodeRepository {
  save(record: NodeRecord): Promise<void>
  findById(id: NodeId): Promise<NodeRecord | undefined>
}

export interface EpochRepository {
  save(record: EpochRecord): Promise<void>
  findById(id: EpochId): Promise<EpochRecord | undefined>
}

export interface MembershipRepository {
  save(record: MembershipSnapshotRecord): Promise<void>
  findById(id: MembershipSnapshotId): Promise<MembershipSnapshotRecord | undefined>
}

export interface TopologyRepository {
  save(record: TopologyEdgeRecord): Promise<void>
  findById(id: TopologyEdgeId): Promise<TopologyEdgeRecord | undefined>
}

export interface PlacementRepository {
  save(record: PlacementRecord): Promise<void>
  findById(id: PlacementId): Promise<PlacementRecord | undefined>
}

export interface RemoteExecutionRecordRepository {
  save(record: RemoteExecutionRecord): Promise<void>
  findById(id: RemoteExecutionId): Promise<RemoteExecutionRecord | undefined>
}

export interface ReplicationRecordRepository {
  save(record: ReplicatedRecord): Promise<void>
  findById(id: ReplicatedRecordId): Promise<ReplicatedRecord | undefined>
}

// ── Infrastructure ports (interfaces only — no implementations in core) ───────

export interface FederationEnvelope {
  readonly envelopeId: FederationEnvelopeId
  readonly federationId: FederationId
  readonly fromNodeId: NodeId
  readonly toNodeId: NodeId
  readonly epochId: EpochId
  readonly payloadHash: ContentHash
}

export interface AttestationEvidence {
  readonly evidenceKind: string
  readonly evidencePayloadHash: ContentHash
  readonly attestedAt: IsoTimestamp
}

export interface AttestationReference {
  readonly attestationId: AttestationId
  readonly nodeId: NodeId
  readonly attestationHash: ContentHash
  readonly attestedAt: IsoTimestamp
}

export interface PolicyDecision {
  readonly admitted: boolean
  readonly reason?: string
}

export interface TrustSnapshot {
  readonly nodeId: NodeId
  readonly trustHash: ContentHash
  readonly capturedAt: IsoTimestamp
}

export interface TransportPort {
  send(envelope: FederationEnvelope): Promise<void>
  receive(): AsyncIterable<FederationEnvelope>
}

export interface AttestationPort {
  attest(nodeId: NodeId, evidence: AttestationEvidence): Promise<AttestationReference>
  verify(ref: AttestationReference): Promise<boolean>
}

export interface PolicyPort {
  evaluate(input: { placementId?: PlacementId; nodeId: NodeId; consistencyClass: ConsistencyClass }): Promise<PolicyDecision>
}

export interface RoutingPort {
  resolveTarget(input: { federationId: FederationId; capabilityId: string }): Promise<NodeId | undefined>
}

export interface TrustPort {
  getTrustSnapshot(nodeId: NodeId): Promise<TrustSnapshot | undefined>
}

export interface EvidencePort {
  open(input: { federationId: FederationId; remoteExecutionId: RemoteExecutionId }): Promise<EvidenceId>
  record(evidenceId: EvidenceId, event: { readonly kind: string; readonly hash: ContentHash }): Promise<void>
  seal(evidenceId: EvidenceId): Promise<void>
}

export interface CoordinationPort {
  // Hint only — real leader election is provider-specific and lives outside core.
  leaderHint(federationId: FederationId): Promise<NodeId | undefined>
}

export interface ClockPort {
  monotonicNow(): IsoTimestamp
}

export interface IdPort {
  generate(): string
}

export interface HashPort {
  hash(value: string | object): ContentHash
}

// ── Node identity, attestation, admission, revocation (Task 2) ────────────────

export interface FederatedNodeIdentity {
  readonly nodeId: NodeId
  readonly trustDomainId: string
  readonly tenantId: string
  readonly publicKeyRef: string
  readonly createdAt: IsoTimestamp
  readonly identityHash: ContentHash
}

export interface AdmissionRequest {
  readonly admissionId: AdmissionId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly requestedAt: IsoTimestamp
  readonly requestHash: ContentHash
  readonly allowedConsistencyClasses: readonly ConsistencyClass[]
  readonly policyConstraints: readonly string[]
  readonly residencyConstraints: readonly string[]
}

export interface AdmissionAssessment {
  readonly assessmentId: AssessmentId
  readonly admissionId: AdmissionId
  readonly assessedAt: IsoTimestamp
  readonly assessmentHash: ContentHash
  // LAW-121: trust is captured explicitly per assessment and never inherited
  // from another node's admission. buildAdmissionDecision asserts it matches
  // the admitted node before it can drive an ADMITTED outcome.
  readonly trustSnapshot: TrustSnapshot
  readonly policySnapshot: ContentHash
}

export type AdmissionOutcome = 'ADMITTED' | 'REJECTED'

export interface AdmissionDecision {
  readonly decisionId: DecisionId
  readonly admissionId: AdmissionId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly decidedAt: IsoTimestamp
  readonly outcome: AdmissionOutcome
  readonly decisionHash: ContentHash
  readonly rejectionReason?: string
}

export interface RevocationDirective {
  readonly revocationId: RevocationId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly issuedAt: IsoTimestamp
  readonly reason: string
  readonly directiveHash: ContentHash
}

export interface RevocationRecord {
  readonly revocationId: RevocationId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly revokedAt: IsoTimestamp
  readonly drainCompleted: boolean
  readonly revocationHash: ContentHash
}

// Builder dependencies — pure inputs, deterministic given the same clock/id/hash.
export interface BuilderDeps {
  readonly id: IdPort
  readonly clock: ClockPort
  readonly hash: HashPort
}

function buildHash(fields: Record<string, unknown>, hash: HashPort): ContentHash {
  return hash.hash(JSON.stringify(fields))
}

export function buildFederatedNodeIdentity(
  args: { nodeId: NodeId; trustDomainId: string; tenantId: string; publicKeyRef: string },
  deps: BuilderDeps,
): FederatedNodeIdentity {
  const createdAt = deps.clock.monotonicNow()
  // LAW-118: identity is cryptographically bound — hash includes the nodeId and
  // publicKeyRef, not just opaque content, so bare discovery of a node confers
  // no reusable identity.
  const identityHash = buildHash(
    {
      nodeId: args.nodeId,
      trustDomainId: args.trustDomainId,
      tenantId: args.tenantId,
      publicKeyRef: args.publicKeyRef,
      createdAt,
    },
    deps.hash,
  )
  return Object.freeze({ ...args, createdAt, identityHash })
}

export function buildAttestationReference(
  evidence: AttestationEvidence,
  nodeId: NodeId,
  deps: BuilderDeps,
): AttestationReference {
  const attestationId = deps.id.generate() as AttestationId
  const attestationHash = buildHash(
    {
      attestationId,
      nodeId,
      evidenceKind: evidence.evidenceKind,
      evidencePayloadHash: evidence.evidencePayloadHash,
      attestedAt: evidence.attestedAt,
    },
    deps.hash,
  )
  return Object.freeze({ attestationId, nodeId, attestationHash, attestedAt: evidence.attestedAt })
}

export function buildAdmissionRequest(
  args: {
    nodeId: NodeId
    federationId: FederationId
    allowedConsistencyClasses: readonly ConsistencyClass[]
    policyConstraints: readonly string[]
    residencyConstraints: readonly string[]
  },
  deps: BuilderDeps,
): AdmissionRequest {
  const admissionId = deps.id.generate() as AdmissionId
  const requestedAt = deps.clock.monotonicNow()
  const requestHash = buildHash(
    {
      admissionId,
      nodeId: args.nodeId,
      federationId: args.federationId,
      requestedAt,
      allowedConsistencyClasses: args.allowedConsistencyClasses,
      policyConstraints: args.policyConstraints,
      residencyConstraints: args.residencyConstraints,
    },
    deps.hash,
  )
  return Object.freeze({ admissionId, requestedAt, requestHash, ...args })
}

export function buildAdmissionAssessment(
  args: {
    admissionId: AdmissionId
    trustSnapshot: TrustSnapshot
    policySnapshot: ContentHash
  },
  deps: BuilderDeps,
): AdmissionAssessment {
  const assessedAt = deps.clock.monotonicNow()
  const assessmentId = deps.id.generate() as AssessmentId
  const assessmentHash = buildHash(
    {
      assessmentId,
      admissionId: args.admissionId,
      trustSnapshot: args.trustSnapshot,
      policySnapshot: args.policySnapshot,
      assessedAt,
    },
    deps.hash,
  )
  return Object.freeze({
    assessmentId,
    admissionId: args.admissionId,
    assessedAt,
    assessmentHash,
    trustSnapshot: args.trustSnapshot,
    policySnapshot: args.policySnapshot,
  })
}

export function buildAdmissionDecision(
  request: AdmissionRequest,
  assessment: AdmissionAssessment,
  outcome: AdmissionOutcome,
  deps: BuilderDeps,
  rejectionReason?: string,
): AdmissionDecision {
  // LAW-121: the assessment must belong to THIS request and carry trust captured
  // for THIS node. This forbids reusing another node's assessment/trust snapshot
  // to admit a different node (implicit trust propagation).
  if (assessment.admissionId !== request.admissionId) {
    throw makeFederationError(
      'FEDERATION_IMPLICIT_TRUST_PROPAGATION',
      `assessment ${assessment.assessmentId} does not belong to admission ${request.admissionId}`,
    )
  }
  if (assessment.trustSnapshot.nodeId !== request.nodeId) {
    throw makeFederationError(
      'FEDERATION_IMPLICIT_TRUST_PROPAGATION',
      `trust snapshot is for node ${assessment.trustSnapshot.nodeId}, not admitted node ${request.nodeId}`,
    )
  }
  // LAW-119: a node cannot be admitted with no consistency class it may use.
  if (outcome === 'ADMITTED' && request.allowedConsistencyClasses.length === 0) {
    throw makeFederationError(
      'FEDERATION_NODE_NOT_ADMITTED',
      'ADMITTED requires at least one allowed consistency class',
    )
  }
  const decisionId = deps.id.generate() as DecisionId
  const decidedAt = deps.clock.monotonicNow()
  const decisionHash = buildHash(
    {
      decisionId,
      admissionId: request.admissionId,
      nodeId: request.nodeId,
      federationId: request.federationId,
      decidedAt,
      outcome,
      requestHash: request.requestHash,
      assessmentHash: assessment.assessmentHash,
      rejectionReason: rejectionReason ?? null,
    },
    deps.hash,
  )
  return Object.freeze({
    decisionId,
    admissionId: request.admissionId,
    nodeId: request.nodeId,
    federationId: request.federationId,
    decidedAt,
    outcome,
    decisionHash,
    ...(rejectionReason !== undefined ? { rejectionReason } : {}),
  })
}

export function buildRevocationDirective(
  nodeId: NodeId,
  federationId: FederationId,
  reason: string,
  deps: BuilderDeps,
): RevocationDirective {
  const revocationId = deps.id.generate() as RevocationId
  const issuedAt = deps.clock.monotonicNow()
  const directiveHash = buildHash({ revocationId, nodeId, federationId, issuedAt, reason }, deps.hash)
  return Object.freeze({ revocationId, nodeId, federationId, issuedAt, reason, directiveHash })
}

export function buildRevocationRecord(
  directive: RevocationDirective,
  drainCompleted: boolean,
  deps: BuilderDeps,
): RevocationRecord {
  const revokedAt = deps.clock.monotonicNow()
  const revocationHash = buildHash(
    {
      revocationId: directive.revocationId,
      nodeId: directive.nodeId,
      federationId: directive.federationId,
      revokedAt,
      drainCompleted,
      directiveHash: directive.directiveHash,
    },
    deps.hash,
  )
  return Object.freeze({
    revocationId: directive.revocationId,
    nodeId: directive.nodeId,
    federationId: directive.federationId,
    revokedAt,
    drainCompleted,
    revocationHash,
  })
}

// ── Service shell ───────────────────────────────────────────────────────────

export class FederationService {
  constructor(
    private readonly transport: TransportPort,
    private readonly attestation: AttestationPort,
    private readonly policy: PolicyPort,
    private readonly routing: RoutingPort,
    private readonly trust: TrustPort,
    private readonly evidence: EvidencePort,
    private readonly coordination: CoordinationPort,
    private readonly clock: ClockPort,
    private readonly id: IdPort,
    private readonly hash: HashPort,
  ) {}

  // Tasks 2–9 add federation, admission, placement, execution, replication,
  // failover, and recovery methods using the injected ports above.

  private get deps(): BuilderDeps {
    return { id: this.id, clock: this.clock, hash: this.hash }
  }

  admitNode(request: AdmissionRequest, assessment: AdmissionAssessment): AdmissionDecision {
    // ponytail: outcome hardcoded 'ADMITTED'; Task 2 scope only — real policy-driven
    // ADMITTED/REJECTED selection lands with the admission workflow in a later task.
    return buildAdmissionDecision(request, assessment, 'ADMITTED', this.deps)
  }

  revokeNode(directive: RevocationDirective): RevocationRecord {
    return buildRevocationRecord(directive, false, this.deps)
  }

  formFederation(manifest: FederationManifest): FederationEpoch {
    return buildFederationEpoch(
      { federationId: manifest.federationId, epochNumber: 1, memberCount: 0 },
      this.deps,
    )
  }

  advanceEpoch(federationId: FederationId, proposal: MembershipProposal): MembershipDecision {
    // ponytail: always ACCEPTED here; real quorum/policy evaluation is a later task.
    return buildMembershipDecision(proposal, 'ACCEPTED', this.deps)
  }

  // ponytail: in-memory map; real persistence goes through AdvertisementRepository.
  private readonly advertisements = new Map<NodeId, NodeAdvertisement>()

  publishAdvertisement(ad: NodeAdvertisement): void {
    this.advertisements.set(ad.nodeId, ad)
  }

  getAdvertisement(nodeId: NodeId): NodeAdvertisement | undefined {
    return this.advertisements.get(nodeId)
  }

  planPlacement(request: FederatedPlacementRequest, assessments: PlacementCandidateAssessment[]): PlacementDecision {
    const selectedNodeId = selectPlacementNode(request, assessments)
    if (selectedNodeId === undefined) {
      return buildPlacementDecision(request, { outcome: 'REJECTED', rejectionReason: 'NO_ELIGIBLE_NODES' }, this.deps, [])
    }
    return buildPlacementDecision(request, { outcome: 'PLACED', selectedNodeId }, this.deps, assessments)
  }

  initiateRemoteExecution(request: RemoteExecutionRequest): RemoteExecutionAcceptance {
    return buildRemoteExecutionAcceptance(request.requestId, this.deps)
  }

  // LAW-128/LAW-129: LOCAL_ONLY rejected immediately; STRONG_CONTROL always CONFLICT.
  replicateRecord(env: ReplicatedRecordEnvelope): 'ACCEPTED' | 'REJECTED_LOCAL_ONLY' | 'CONFLICT' {
    if (rejectLocalOnly(env)) return 'REJECTED_LOCAL_ONLY'
    if (env.consistencyClass === 'STRONG_CONTROL') return 'CONFLICT'
    return 'ACCEPTED'
  }

  completeRemoteExecution(result: RemoteExecutionResult): EvidenceCorrelation {
    // LAW-122: evidenceCorrelationId must be present (already enforced by buildRemoteExecutionResult;
    // this re-validates to guard against hand-crafted result objects reaching the service).
    if (result.evidenceCorrelationId.trim().length === 0) {
      throw makeFederationError(
        'FEDERATION_EVIDENCE_MISSING',
        'result must carry a non-empty evidenceCorrelationId (LAW-122)',
      )
    }
    // ponytail: origin/target refs derived from resultHash; real impls pass real evidence hashes.
    const originRef = result.resultHash
    const targetRef = result.resultHash
    return buildEvidenceCorrelation(result.requestId, originRef, targetRef, this.deps)
  }

  detectFailure(obs: FailureObservation): SuspicionRecord {
    return buildSuspicionRecord({ nodeId: obs.nodeId, federationId: obs.federationId, observation: obs }, this.deps)
  }

  // LAW-125: approved only when caller confirms majority; generates a fresh newAttemptId.
  governFailover(request: FailoverRequest, hasMajority: boolean): FailoverDecision {
    if (!hasMajority) {
      return buildFailoverDecision(request, { outcome: 'DENIED', denialReason: 'no majority' }, this.deps)
    }
    const newAttemptId = this.deps.id.generate()
    return buildFailoverDecision(request, { outcome: 'APPROVED', newAttemptId }, this.deps)
  }
}

// ── Task 3: Membership types ──────────────────────────────────────────────────

export type NodeRole            = 'COORDINATOR' | 'WORKER' | 'OBSERVER'
export type MembershipChangeKind = 'JOIN' | 'DRAIN' | 'REMOVE' | 'REVOKE'

export type ProposalId = string & { readonly __brand: 'ProposalId' }
export type ZoneId     = string & { readonly __brand: 'ZoneId' }

export interface FederationManifest {
  readonly federationId: FederationId
  readonly name: string
  readonly trustDomain: string
  readonly tenantId: string
  readonly formedAt: IsoTimestamp
  readonly manifestHash: ContentHash
}

export interface FederationEpoch {
  readonly epochId: EpochId
  readonly federationId: FederationId
  readonly epochNumber: number
  readonly formedAt: IsoTimestamp
  readonly memberCount: number
  readonly previousEpochId?: EpochId
  readonly epochHash: ContentHash
}

export interface MemberEntry {
  readonly nodeId: NodeId
  readonly admissionDecisionId: DecisionId
  readonly role: NodeRole
  readonly joinedAt: IsoTimestamp
  readonly consistencyClasses: readonly ConsistencyClass[]
}

export interface MembershipSnapshot {
  readonly snapshotId: MembershipSnapshotId
  readonly epochId: EpochId
  readonly federationId: FederationId
  readonly capturedAt: IsoTimestamp
  readonly memberEntries: readonly MemberEntry[]
  readonly snapshotHash: ContentHash
}

export interface TopologyEdge {
  readonly edgeId: TopologyEdgeId
  readonly sourceNodeId: NodeId
  readonly targetNodeId: NodeId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly edgeHash: ContentHash
}

export interface TopologyZone {
  readonly zoneId: ZoneId
  readonly federationId: FederationId
  readonly nodeIds: readonly NodeId[]
  readonly zoneHash: ContentHash
}

export interface MembershipProposal {
  readonly proposalId: ProposalId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly proposedAt: IsoTimestamp
  readonly kind: MembershipChangeKind
  readonly targetNodeId: NodeId
  readonly proposalHash: ContentHash
}

export interface MembershipDecision {
  readonly decisionId: DecisionId
  readonly proposalId: ProposalId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly decidedAt: IsoTimestamp
  readonly outcome: 'ACCEPTED' | 'REJECTED'
  readonly decisionHash: ContentHash
}

// ── Task 3: Authority port ────────────────────────────────────────────────────

export interface AuthorityPort {
  queryEpochChain(federationId: FederationId): Promise<FederationEpoch[]>
  isCurrentEpoch(epochId: EpochId): Promise<boolean>
}

// ── Task 3: Builder functions ─────────────────────────────────────────────────

export function buildFederationManifest(
  args: { federationId: FederationId; name: string; trustDomain: string; tenantId: string },
  deps: BuilderDeps,
): FederationManifest {
  const formedAt = deps.clock.monotonicNow()
  const manifestHash = buildHash({ ...args, formedAt }, deps.hash)
  return Object.freeze({ ...args, formedAt, manifestHash })
}

export function buildFederationEpoch(
  args: {
    federationId: FederationId
    epochNumber: number
    memberCount: number
    previousEpochId?: EpochId
    previousEpochNumber?: number
  },
  deps: BuilderDeps,
): FederationEpoch {
  // LAW-127: epochNumber must be > 0 and advance monotonically
  if (args.epochNumber <= 0) {
    throw makeFederationError(
      'FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH',
      `epochNumber must be > 0, got ${args.epochNumber}`,
    )
  }
  if (args.previousEpochNumber !== undefined && args.epochNumber !== args.previousEpochNumber + 1) {
    throw makeFederationError(
      'FEDERATION_MEMBERSHIP_CHANGE_MISSING_EPOCH',
      `epochNumber must advance by 1: expected ${args.previousEpochNumber + 1}, got ${args.epochNumber}`,
    )
  }
  const epochId = deps.id.generate() as EpochId
  const formedAt = deps.clock.monotonicNow()
  const epochHash = buildHash(
    { epochId, federationId: args.federationId, epochNumber: args.epochNumber, memberCount: args.memberCount, formedAt },
    deps.hash,
  )
  const result: FederationEpoch = {
    epochId,
    federationId: args.federationId,
    epochNumber: args.epochNumber,
    formedAt,
    memberCount: args.memberCount,
    ...(args.previousEpochId !== undefined ? { previousEpochId: args.previousEpochId } : {}),
    epochHash,
  }
  return Object.freeze(result)
}

export function buildMembershipSnapshot(
  args: { federationId: FederationId; epochId: EpochId; memberEntries: MemberEntry[] },
  deps: BuilderDeps,
): MembershipSnapshot {
  // LAW-129: at least one COORDINATOR must be present
  const hasCoordinator = args.memberEntries.some(e => e.role === 'COORDINATOR')
  if (!hasCoordinator) {
    throw makeFederationError(
      'FEDERATION_SPLIT_BRAIN_BLOCKED',
      'snapshot must have at least one COORDINATOR member',
    )
  }
  const snapshotId = deps.id.generate() as MembershipSnapshotId
  const capturedAt = deps.clock.monotonicNow()
  const snapshotHash = buildHash(
    { snapshotId, epochId: args.epochId, federationId: args.federationId, capturedAt, memberCount: args.memberEntries.length },
    deps.hash,
  )
  return Object.freeze({
    snapshotId,
    epochId: args.epochId,
    federationId: args.federationId,
    capturedAt,
    memberEntries: Object.freeze([...args.memberEntries]),
    snapshotHash,
  })
}

export function buildTopologyEdge(
  args: { federationId: FederationId; epochId: EpochId; sourceNodeId: NodeId; targetNodeId: NodeId },
  deps: BuilderDeps,
): TopologyEdge {
  const edgeId = deps.id.generate() as TopologyEdgeId
  const edgeHash = buildHash({ edgeId, ...args }, deps.hash)
  return Object.freeze({ edgeId, ...args, edgeHash })
}

export function buildTopologyZone(
  args: { federationId: FederationId; nodeIds: readonly NodeId[] },
  deps: BuilderDeps,
): TopologyZone {
  const zoneId = deps.id.generate() as ZoneId
  const zoneHash = buildHash({ zoneId, federationId: args.federationId, nodeCount: args.nodeIds.length }, deps.hash)
  return Object.freeze({ zoneId, federationId: args.federationId, nodeIds: Object.freeze([...args.nodeIds]), zoneHash })
}

export function buildMembershipProposal(
  args: { federationId: FederationId; epochId: EpochId; kind: MembershipChangeKind; targetNodeId: NodeId },
  deps: BuilderDeps,
): MembershipProposal {
  const proposalId = deps.id.generate() as ProposalId
  const proposedAt = deps.clock.monotonicNow()
  const proposalHash = buildHash({ proposalId, ...args, proposedAt }, deps.hash)
  return Object.freeze({ proposalId, ...args, proposedAt, proposalHash })
}

export function buildMembershipDecision(
  proposal: MembershipProposal,
  outcome: 'ACCEPTED' | 'REJECTED',
  deps: BuilderDeps,
): MembershipDecision {
  const decisionId = deps.id.generate() as DecisionId
  const decidedAt = deps.clock.monotonicNow()
  const decisionHash = buildHash(
    { decisionId, proposalId: proposal.proposalId, federationId: proposal.federationId, epochId: proposal.epochId, decidedAt, outcome, proposalHash: proposal.proposalHash },
    deps.hash,
  )
  return Object.freeze({
    decisionId,
    proposalId: proposal.proposalId,
    federationId: proposal.federationId,
    epochId: proposal.epochId,
    decidedAt,
    outcome,
    decisionHash,
  })
}

// ── Task 4: Advertisement types ───────────────────────────────────────────────

// LAW-120/121: NodeAdvertisement carries only refs (hashes), never raw policy
// or trust values. The type itself enforces this — there are no policyRules,
// trustLevel, or permissions fields.

export type LeaseId = string & { readonly __brand: 'LeaseId' }

export interface CapabilityBindingRef {
  readonly capabilityId: string
  readonly bindingHash: ContentHash
}

export interface TrustSnapshotRef {
  readonly snapshotId: string
  readonly snapshotHash: ContentHash
}

export interface NodeCapacity {
  readonly availableCpu: number
  readonly availableMemoryMb: number
  readonly maxConcurrency: number
}

export interface ReliabilityRef {
  readonly reliabilityId: string
  readonly reliabilityHash: ContentHash
}

export interface EconomicsRef {
  readonly economicsId: string
  readonly economicsHash: ContentHash
}

export interface NodeLocality {
  readonly region: string
  readonly zone: string
  readonly residencyZones: readonly string[]
}

export interface NodeHealth {
  readonly status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'
  readonly checkedAt: IsoTimestamp
}

export interface NodeAdvertisement {
  readonly advertisementId: AdvertisementId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly publishedAt: IsoTimestamp
  readonly expiresAt: IsoTimestamp
  readonly leaseId: LeaseId
  readonly advertisementHash: ContentHash
  readonly capabilityRefs: readonly CapabilityBindingRef[]
  readonly trustSnapshotRef: TrustSnapshotRef
  readonly capacity: NodeCapacity
  readonly reliabilityRef: ReliabilityRef
  readonly economicsRef: EconomicsRef
  readonly locality: NodeLocality
  readonly health: NodeHealth
}

export function buildNodeAdvertisement(
  args: {
    nodeId: NodeId
    federationId: FederationId
    epochId: EpochId
    expiresAt: IsoTimestamp
    leaseId: LeaseId
    capabilityRefs: readonly CapabilityBindingRef[]
    trustSnapshotRef: TrustSnapshotRef
    capacity: NodeCapacity
    reliabilityRef: ReliabilityRef
    economicsRef: EconomicsRef
    locality: NodeLocality
    health: NodeHealth
  },
  deps: BuilderDeps,
): NodeAdvertisement {
  const publishedAt = deps.clock.monotonicNow()
  const advertisementId = deps.id.generate() as AdvertisementId
  const advertisementHash = buildHash(
    { advertisementId, nodeId: args.nodeId, federationId: args.federationId, epochId: args.epochId, leaseId: args.leaseId, publishedAt, expiresAt: args.expiresAt },
    deps.hash,
  )
  return Object.freeze({ advertisementId, publishedAt, advertisementHash, ...args })
}

export function validateAdvertisement(
  ad: NodeAdvertisement,
  currentEpochId: EpochId,
): { valid: boolean; reason?: string } {
  if (ad.epochId !== currentEpochId) {
    return { valid: false, reason: `epochId mismatch: advertisement has ${ad.epochId}, current is ${currentEpochId}` }
  }
  if (ad.expiresAt <= ad.publishedAt) {
    return { valid: false, reason: `expiresAt (${ad.expiresAt}) must be after publishedAt (${ad.publishedAt})` }
  }
  return { valid: true }
}

export interface AdvertisementRepository {
  save(ad: NodeAdvertisement): Promise<void>
  findByNode(nodeId: NodeId): Promise<NodeAdvertisement | undefined>
  findByFederation(federationId: FederationId): Promise<NodeAdvertisement[]>
  expire(advertisementId: AdvertisementId): Promise<void>
}

// ── Task 5: Placement types ───────────────────────────────────────────────────

export type PlanId = string & { readonly __brand: 'PlanId' }

export interface PlacementPolicyConstraints {
  readonly maxTrustLevel: string
  readonly requiredConsistencyClass: ConsistencyClass
  readonly policyHash: ContentHash
}

export interface PlacementResidencyConstraints {
  readonly allowedRegions: readonly string[]
  readonly forbiddenRegions: readonly string[]
  readonly residencyHash: ContentHash
}

export interface PlacementBudgetConstraints {
  readonly maxCostUnits: number
  readonly budgetHash: ContentHash
}

export interface PlacementDeadlineConstraints {
  readonly deadlineAt: IsoTimestamp
  readonly deadlineHash: ContentHash
}

export interface PlacementReliabilityConstraints {
  readonly minReliabilityScore: number
  readonly reliabilityHash: ContentHash
}

export interface PlacementTrustConstraints {
  readonly requiredTrustDomain: string
  readonly trustHash: ContentHash
}

export interface FederatedPlacementRequest {
  readonly placementId: PlacementId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly requestedAt: IsoTimestamp
  readonly capabilityRef: CapabilityBindingRef
  readonly policyConstraints: PlacementPolicyConstraints
  readonly residencyConstraints: PlacementResidencyConstraints
  readonly budgetConstraints: PlacementBudgetConstraints
  readonly deadlineConstraints: PlacementDeadlineConstraints
  readonly reliabilityConstraints: PlacementReliabilityConstraints
  readonly trustConstraints: PlacementTrustConstraints
  readonly requestHash: ContentHash
}

export interface PlacementCandidateAssessment {
  readonly assessmentId: AssessmentId
  readonly placementId: PlacementId
  readonly nodeId: NodeId
  readonly assessedAt: IsoTimestamp
  readonly eligible: boolean
  readonly ineligibilityReasons: readonly string[]
  readonly consistencyClass?: ConsistencyClass
  readonly assessmentHash: ContentHash
}

export interface StepNodeBinding {
  readonly stepId: string
  readonly nodeId: NodeId
  readonly consistencyClass: ConsistencyClass
}

export interface DataTransferStep {
  readonly fromNodeId: NodeId
  readonly toNodeId: NodeId
  readonly artifactRef: string
  readonly transferHash: ContentHash
}

export interface FallbackConstraints {
  readonly allowLocalFallback: boolean
  readonly maxRetries: number
}

export interface DistributedPlan {
  readonly planId: PlanId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly createdAt: IsoTimestamp
  readonly stepBindings: readonly StepNodeBinding[]
  readonly dataTransferPlan: readonly DataTransferStep[]
  readonly fallbackConstraints: FallbackConstraints
  readonly planHash: ContentHash
}

export interface PlacementDecision {
  readonly decisionId: DecisionId
  readonly placementId: PlacementId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly decidedAt: IsoTimestamp
  readonly outcome: 'PLACED' | 'REJECTED'
  readonly selectedNodeId?: NodeId
  readonly rejectionReason?: string
  readonly decisionHash: ContentHash
}

// ── Task 5: Builder functions ─────────────────────────────────────────────────

export function buildFederatedPlacementRequest(
  args: {
    federationId: FederationId
    epochId: EpochId
    capabilityRef: CapabilityBindingRef
    policyConstraints: PlacementPolicyConstraints
    residencyConstraints: PlacementResidencyConstraints
    budgetConstraints: PlacementBudgetConstraints
    deadlineConstraints: PlacementDeadlineConstraints
    reliabilityConstraints: PlacementReliabilityConstraints
    trustConstraints: PlacementTrustConstraints
  },
  deps: BuilderDeps,
): FederatedPlacementRequest {
  const placementId = deps.id.generate() as PlacementId
  const requestedAt = deps.clock.monotonicNow()
  const requestHash = buildHash(
    { placementId, federationId: args.federationId, epochId: args.epochId, requestedAt, capabilityRef: args.capabilityRef },
    deps.hash,
  )
  return Object.freeze({ placementId, requestedAt, requestHash, ...args })
}

export function buildPlacementCandidateAssessment(
  args: {
    placementId: PlacementId
    nodeId: NodeId
    eligible: boolean
    ineligibilityReasons: readonly string[]
    consistencyClass?: ConsistencyClass
  },
  deps: BuilderDeps,
): PlacementCandidateAssessment {
  const assessmentId = deps.id.generate() as AssessmentId
  const assessedAt = deps.clock.monotonicNow()
  const assessmentHash = buildHash(
    { assessmentId, placementId: args.placementId, nodeId: args.nodeId, eligible: args.eligible, assessedAt },
    deps.hash,
  )
  const result: PlacementCandidateAssessment = {
    assessmentId,
    placementId: args.placementId,
    nodeId: args.nodeId,
    assessedAt,
    eligible: args.eligible,
    ineligibilityReasons: Object.freeze([...args.ineligibilityReasons]),
    assessmentHash,
    ...(args.consistencyClass !== undefined ? { consistencyClass: args.consistencyClass } : {}),
  }
  return Object.freeze(result)
}

export function buildDistributedPlan(
  args: {
    federationId: FederationId
    epochId: EpochId
    stepBindings: readonly StepNodeBinding[]
    dataTransferPlan: readonly DataTransferStep[]
    fallbackConstraints: FallbackConstraints
  },
  deps: BuilderDeps,
): DistributedPlan {
  const planId = deps.id.generate() as PlanId
  const createdAt = deps.clock.monotonicNow()
  const planHash = buildHash(
    { planId, federationId: args.federationId, epochId: args.epochId, createdAt, stepCount: args.stepBindings.length },
    deps.hash,
  )
  return Object.freeze({
    planId,
    federationId: args.federationId,
    epochId: args.epochId,
    createdAt,
    stepBindings: Object.freeze([...args.stepBindings]),
    dataTransferPlan: Object.freeze([...args.dataTransferPlan]),
    fallbackConstraints: args.fallbackConstraints,
    planHash,
  })
}

// LAW-123: sort candidates by nodeId for deterministic tie-breaking before selecting.
export function selectPlacementNode(
  request: FederatedPlacementRequest,
  candidates: PlacementCandidateAssessment[],
): NodeId | undefined {
  const sorted = [...candidates].sort((a, b) => a.nodeId.localeCompare(b.nodeId))
  for (const c of sorted) {
    if (!c.eligible) continue
    // LAW-120: if candidate carries a consistencyClass, it must match required.
    if (c.consistencyClass !== undefined &&
        c.consistencyClass !== request.policyConstraints.requiredConsistencyClass) {
      continue
    }
    return c.nodeId
  }
  return undefined
}

// buildPlacementDecision: explicit outcome discriminant prevents ambiguity.
// LAW-120: PLACED requires an eligible assessment for the selected node.
export function buildPlacementDecision(
  request: FederatedPlacementRequest,
  intent: { outcome: 'PLACED'; selectedNodeId: NodeId } | { outcome: 'REJECTED'; rejectionReason: string },
  deps: BuilderDeps,
  assessments: PlacementCandidateAssessment[],
): PlacementDecision {
  if (intent.outcome === 'PLACED') {
    // LAW-120: selected node must have an eligible assessment.
    const eligibleAssessment = assessments.find(
      a => a.nodeId === intent.selectedNodeId && a.eligible,
    )
    if (eligibleAssessment === undefined) {
      throw makeFederationError(
        'FEDERATION_POLICY_WEAKENED',
        `node ${intent.selectedNodeId} has no eligible assessment; placement would weaken policy`,
      )
    }
  }

  const decisionId = deps.id.generate() as DecisionId
  const decidedAt = deps.clock.monotonicNow()

  const decisionHash = buildHash(
    {
      decisionId,
      placementId: request.placementId,
      federationId: request.federationId,
      epochId: request.epochId,
      decidedAt,
      outcome: intent.outcome,
      selectedNodeId: intent.outcome === 'PLACED' ? intent.selectedNodeId : null,
      rejectionReason: intent.outcome === 'REJECTED' ? intent.rejectionReason : null,
    },
    deps.hash,
  )

  const result: PlacementDecision = {
    decisionId,
    placementId: request.placementId,
    federationId: request.federationId,
    epochId: request.epochId,
    decidedAt,
    outcome: intent.outcome,
    decisionHash,
    ...(intent.outcome === 'PLACED'
      ? { selectedNodeId: intent.selectedNodeId }
      : { rejectionReason: intent.rejectionReason }),
  }
  return Object.freeze(result)
}

// ── Task 6: Remote Execution Protocol and Cross-Node Evidence ────────────────

export type AcceptanceId   = string & { readonly __brand: 'AcceptanceId' }
export type RejectionId    = string & { readonly __brand: 'RejectionId' }
export type ResultId       = string & { readonly __brand: 'ResultId' }
export type CorrelationId  = string & { readonly __brand: 'CorrelationId' }

export interface RemoteExecutionRequest {
  readonly requestId: RemoteExecutionId
  readonly originNodeId: NodeId
  readonly targetNodeId: NodeId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly placementDecisionId: DecisionId
  readonly traceId: string
  readonly spanId: string
  readonly policyRef: ContentHash
  readonly contextRef: ContentHash
  readonly artifactRefs: readonly string[]
  readonly timeoutMs: number
  readonly requestHash: ContentHash
}

export interface RemoteExecutionAcceptance {
  readonly acceptanceId: AcceptanceId
  readonly requestId: RemoteExecutionId
  readonly acceptedAt: IsoTimestamp
  readonly acceptanceHash: ContentHash
}

export interface RemoteExecutionRejection {
  readonly rejectionId: RejectionId
  readonly requestId: RemoteExecutionId
  readonly rejectedAt: IsoTimestamp
  readonly reason: string
  readonly rejectionHash: ContentHash
}

export interface RemoteExecutionResult {
  readonly resultId: ResultId
  readonly requestId: RemoteExecutionId
  readonly completedAt: IsoTimestamp
  readonly outcomeKind: 'SUCCESS' | 'FAILURE' | 'CANCELLED'
  readonly artifactResultRefs: readonly string[]
  readonly evidenceCorrelationId: string
  readonly resultHash: ContentHash
}

export interface EvidenceCorrelation {
  readonly correlationId: CorrelationId
  readonly requestId: RemoteExecutionId
  readonly originEvidenceRef: ContentHash
  readonly targetEvidenceRef: ContentHash
  readonly correlatedAt: IsoTimestamp
  readonly correlationHash: ContentHash
}

export interface ReplayProtectionRecord {
  readonly nonce: string
  readonly requestId: RemoteExecutionId
  readonly recordedAt: IsoTimestamp
  readonly nonceHash: ContentHash
}

// Task 6 repository port — save/find for remote execution requests and results.
export interface RemoteExecutionRepository {
  saveRequest(req: RemoteExecutionRequest): Promise<void>
  saveResult(result: RemoteExecutionResult): Promise<void>
  findRequest(requestId: RemoteExecutionId): Promise<RemoteExecutionRequest | undefined>
  findResult(requestId: RemoteExecutionId): Promise<RemoteExecutionResult | undefined>
}

// LAW-119: targetNodeId must be in admittedNodeIds.
export function buildRemoteExecutionRequest(
  args: {
    originNodeId: NodeId
    targetNodeId: NodeId
    federationId: FederationId
    epochId: EpochId
    placementDecisionId: DecisionId
    traceId: string
    spanId: string
    policyRef: ContentHash
    contextRef: ContentHash
    artifactRefs: readonly string[]
    timeoutMs: number
    admittedNodeIds: readonly NodeId[]
  },
  deps: BuilderDeps,
): RemoteExecutionRequest {
  if (!args.admittedNodeIds.includes(args.targetNodeId)) {
    throw makeFederationError(
      'FEDERATION_NODE_NOT_ADMITTED',
      `node ${args.targetNodeId} is not in the admitted node list`,
    )
  }
  const requestId = deps.id.generate() as RemoteExecutionId
  const requestHash = buildHash(
    {
      requestId,
      originNodeId: args.originNodeId,
      targetNodeId: args.targetNodeId,
      federationId: args.federationId,
      epochId: args.epochId,
      placementDecisionId: args.placementDecisionId,
      traceId: args.traceId,
      spanId: args.spanId,
      policyRef: args.policyRef,
      contextRef: args.contextRef,
      timeoutMs: args.timeoutMs,
    },
    deps.hash,
  )
  const { admittedNodeIds: _admitted, ...rest } = args
  return Object.freeze({ requestId, requestHash, ...rest })
}

export function buildRemoteExecutionAcceptance(
  requestId: RemoteExecutionId,
  deps: BuilderDeps,
): RemoteExecutionAcceptance {
  const acceptanceId = deps.id.generate() as AcceptanceId
  const acceptedAt = deps.clock.monotonicNow()
  const acceptanceHash = buildHash({ acceptanceId, requestId, acceptedAt }, deps.hash)
  return Object.freeze({ acceptanceId, requestId, acceptedAt, acceptanceHash })
}

export function buildRemoteExecutionRejection(
  requestId: RemoteExecutionId,
  reason: string,
  deps: BuilderDeps,
): RemoteExecutionRejection {
  const rejectionId = deps.id.generate() as RejectionId
  const rejectedAt = deps.clock.monotonicNow()
  const rejectionHash = buildHash({ rejectionId, requestId, rejectedAt, reason }, deps.hash)
  return Object.freeze({ rejectionId, requestId, rejectedAt, reason, rejectionHash })
}

// LAW-122: evidenceCorrelationId must be a non-empty, non-whitespace string.
export function buildRemoteExecutionResult(
  args: {
    requestId: RemoteExecutionId
    outcomeKind: 'SUCCESS' | 'FAILURE' | 'CANCELLED'
    artifactResultRefs: readonly string[]
    evidenceCorrelationId: string
  },
  deps: BuilderDeps,
): RemoteExecutionResult {
  if (args.evidenceCorrelationId.trim().length === 0) {
    throw makeFederationError(
      'FEDERATION_EVIDENCE_MISSING',
      'evidenceCorrelationId must be a non-empty string (LAW-122)',
    )
  }
  const resultId = deps.id.generate() as ResultId
  const completedAt = deps.clock.monotonicNow()
  const resultHash = buildHash(
    { resultId, requestId: args.requestId, completedAt, outcomeKind: args.outcomeKind, evidenceCorrelationId: args.evidenceCorrelationId },
    deps.hash,
  )
  return Object.freeze({
    resultId,
    requestId: args.requestId,
    completedAt,
    outcomeKind: args.outcomeKind,
    artifactResultRefs: Object.freeze([...args.artifactResultRefs]),
    evidenceCorrelationId: args.evidenceCorrelationId,
    resultHash,
  })
}

export function buildEvidenceCorrelation(
  requestId: RemoteExecutionId,
  originEvidenceRef: ContentHash,
  targetEvidenceRef: ContentHash,
  deps: BuilderDeps,
): EvidenceCorrelation {
  const correlationId = deps.id.generate() as CorrelationId
  const correlatedAt = deps.clock.monotonicNow()
  const correlationHash = buildHash(
    { correlationId, requestId, originEvidenceRef, targetEvidenceRef, correlatedAt },
    deps.hash,
  )
  return Object.freeze({ correlationId, requestId, originEvidenceRef, targetEvidenceRef, correlatedAt, correlationHash })
}

export function buildReplayProtectionRecord(
  requestId: RemoteExecutionId,
  deps: BuilderDeps,
): ReplayProtectionRecord {
  const nonce = deps.id.generate()
  const recordedAt = deps.clock.monotonicNow()
  const nonceHash = buildHash({ nonce, requestId, recordedAt }, deps.hash)
  return Object.freeze({ nonce, requestId, recordedAt, nonceHash })
}

// ── Task 7: Replicated State, Consistency Classes, Conflict Handling ─────────

export type EnvelopeId          = string & { readonly __brand: 'EnvelopeId' }
export type ReplicationPolicyId = string & { readonly __brand: 'ReplicationPolicyId' }
export type CommitRefId         = string & { readonly __brand: 'CommitRefId' }
export type TombstoneId         = string & { readonly __brand: 'TombstoneId' }

export interface ReplicatedRecordEnvelope {
  readonly envelopeId: EnvelopeId
  readonly originNodeId: NodeId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly consistencyClass: ConsistencyClass
  readonly recordKind: string
  readonly recordHash: ContentHash
  readonly sequenceNumber: number
  readonly replicatedAt: IsoTimestamp
  readonly envelopeHash: ContentHash
}

export interface ReplicationPolicy {
  readonly policyId: ReplicationPolicyId
  readonly federationId: FederationId
  readonly consistencyClass: ConsistencyClass
  readonly quorumSize: number
  readonly policyHash: ContentHash
}

export interface StrongControlCommitRef {
  readonly commitRefId: CommitRefId
  readonly envelopeId: EnvelopeId
  readonly committedAt: IsoTimestamp
  readonly commitHash: ContentHash
}

export interface ConflictRecord {
  readonly conflictId: ConflictId
  readonly envelopeA: EnvelopeId
  readonly envelopeB: EnvelopeId
  readonly detectedAt: IsoTimestamp
  readonly conflictHash: ContentHash
}

export interface Tombstone {
  readonly tombstoneId: TombstoneId
  readonly envelopeId: EnvelopeId
  readonly tombstonedAt: IsoTimestamp
  readonly tombstoneHash: ContentHash
}

export interface IntegrityVerificationResult {
  readonly envelopeId: EnvelopeId
  readonly verified: boolean
  readonly verifiedAt: IsoTimestamp
  readonly reason?: string
}

export interface ReplicationRepository {
  saveEnvelope(env: ReplicatedRecordEnvelope): Promise<void>
  findByFederation(federationId: FederationId): Promise<ReplicatedRecordEnvelope[]>
  saveConflict(conflict: ConflictRecord): Promise<void>
  saveTombstone(t: Tombstone): Promise<void>
}

export function buildReplicatedRecordEnvelope(
  args: {
    originNodeId: NodeId
    federationId: FederationId
    epochId: EpochId
    consistencyClass: ConsistencyClass
    recordKind: string
    recordHash: ContentHash
    sequenceNumber: number
  },
  deps: BuilderDeps,
): ReplicatedRecordEnvelope {
  const envelopeId = deps.id.generate() as EnvelopeId
  const replicatedAt = deps.clock.monotonicNow()
  const envelopeHash = buildHash(
    { envelopeId, originNodeId: args.originNodeId, federationId: args.federationId, epochId: args.epochId, consistencyClass: args.consistencyClass, recordKind: args.recordKind, recordHash: args.recordHash, sequenceNumber: args.sequenceNumber, replicatedAt },
    deps.hash,
  )
  return Object.freeze({ envelopeId, replicatedAt, envelopeHash, ...args })
}

export function buildReplicationPolicy(
  args: { federationId: FederationId; consistencyClass: ConsistencyClass; quorumSize: number },
  deps: BuilderDeps,
): ReplicationPolicy {
  const policyId = deps.id.generate() as ReplicationPolicyId
  const policyHash = buildHash({ policyId, ...args }, deps.hash)
  return Object.freeze({ policyId, policyHash, ...args })
}

export function buildStrongControlCommitRef(envelopeId: EnvelopeId, deps: BuilderDeps): StrongControlCommitRef {
  const commitRefId = deps.id.generate() as CommitRefId
  const committedAt = deps.clock.monotonicNow()
  const commitHash = buildHash({ commitRefId, envelopeId, committedAt }, deps.hash)
  return Object.freeze({ commitRefId, envelopeId, committedAt, commitHash })
}

export function buildConflictRecord(envelopeA: EnvelopeId, envelopeB: EnvelopeId, deps: BuilderDeps): ConflictRecord {
  const conflictId = deps.id.generate() as ConflictId
  const detectedAt = deps.clock.monotonicNow()
  const conflictHash = buildHash({ conflictId, envelopeA, envelopeB, detectedAt }, deps.hash)
  return Object.freeze({ conflictId, envelopeA, envelopeB, detectedAt, conflictHash })
}

export function buildTombstone(envelopeId: EnvelopeId, deps: BuilderDeps): Tombstone {
  const tombstoneId = deps.id.generate() as TombstoneId
  const tombstonedAt = deps.clock.monotonicNow()
  const tombstoneHash = buildHash({ tombstoneId, envelopeId, tombstonedAt }, deps.hash)
  return Object.freeze({ tombstoneId, envelopeId, tombstonedAt, tombstoneHash })
}

// LAW-126: recompute envelopeHash from all fields except envelopeHash itself and compare.
export function verifyEnvelopeIntegrity(
  envelope: ReplicatedRecordEnvelope,
  hashPort: HashPort,
): IntegrityVerificationResult {
  const expected = hashPort.hash(JSON.stringify({
    envelopeId: envelope.envelopeId,
    originNodeId: envelope.originNodeId,
    federationId: envelope.federationId,
    epochId: envelope.epochId,
    consistencyClass: envelope.consistencyClass,
    recordKind: envelope.recordKind,
    recordHash: envelope.recordHash,
    sequenceNumber: envelope.sequenceNumber,
    replicatedAt: envelope.replicatedAt,
  }))
  // ponytail: verifiedAt uses a fixed stub; real impls inject ClockPort.
  const verified = expected === envelope.envelopeHash
  return Object.freeze({
    envelopeId: envelope.envelopeId,
    verified,
    verifiedAt: new Date().toISOString() as IsoTimestamp,
    ...(verified ? {} : { reason: `envelopeHash mismatch: expected ${expected}, got ${envelope.envelopeHash}` }),
  })
}

// LAW-129: STRONG_CONTROL never resolves with last-write-wins — always CONFLICT.
// CAUSAL/EVENTUAL: higher sequenceNumber wins; tie-break on lexicographic originNodeId.
export function mergeEnvelopes(
  a: ReplicatedRecordEnvelope,
  b: ReplicatedRecordEnvelope,
): 'ACCEPT_A' | 'ACCEPT_B' | 'CONFLICT' {
  if (a.consistencyClass === 'STRONG_CONTROL' || b.consistencyClass === 'STRONG_CONTROL') {
    return 'CONFLICT'
  }
  if (a.sequenceNumber > b.sequenceNumber) return 'ACCEPT_A'
  if (b.sequenceNumber > a.sequenceNumber) return 'ACCEPT_B'
  // Equal sequence: deterministic tie-break on nodeId lexicographic order (lower wins).
  return a.originNodeId.localeCompare(b.originNodeId) <= 0 ? 'ACCEPT_A' : 'ACCEPT_B'
}

// LAW-128: LOCAL_ONLY records must never leave the node.
export function rejectLocalOnly(envelope: ReplicatedRecordEnvelope): boolean {
  return envelope.consistencyClass === 'LOCAL_ONLY'
}

// ── Task 8: Failure Detection, Governed Failover, Partition, and Recovery ─────

export type SuspicionId      = string & { readonly __brand: 'SuspicionId' }
export type NewAttemptId     = string & { readonly __brand: 'NewAttemptId' }
export type ReconciliationId = string & { readonly __brand: 'ReconciliationId' }

export type FailureKind = 'HEARTBEAT_TIMEOUT' | 'HEALTH_CHECK_FAILED' | 'NETWORK_UNREACHABLE' | 'EXPLICIT_REPORT'

export interface FailureObservation {
  readonly observationId: FailureObservationId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly observedAt: IsoTimestamp
  readonly failureKind: FailureKind
  readonly observationHash: ContentHash
}

export interface SuspicionRecord {
  readonly suspicionId: SuspicionId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly suspectedAt: IsoTimestamp
  readonly confirmedAt?: IsoTimestamp
  readonly status: 'SUSPECTED' | 'CONFIRMED' | 'CLEARED'
  readonly suspicionHash: ContentHash
}

export interface PartitionRecord {
  readonly partitionId: PartitionId
  readonly federationId: FederationId
  readonly detectedAt: IsoTimestamp
  readonly affectedNodeIds: readonly NodeId[]
  readonly majorityNodeIds: readonly NodeId[]
  readonly minorityNodeIds: readonly NodeId[]
  readonly partitionHash: ContentHash
}

export interface AuthorityAssessment {
  readonly assessmentId: AssessmentId
  readonly partitionId: PartitionId
  readonly assessedAt: IsoTimestamp
  readonly hasMajority: boolean
  readonly strongControlBlocked: boolean
  readonly assessmentHash: ContentHash
}

export interface FailoverRequest {
  readonly failoverId: FailoverId
  readonly failedNodeId: NodeId
  readonly federationId: FederationId
  readonly epochId: EpochId
  readonly requestedAt: IsoTimestamp
  readonly failoverHash: ContentHash
}

export interface FailoverDecision {
  readonly decisionId: DecisionId
  readonly failoverId: FailoverId
  readonly federationId: FederationId
  readonly decidedAt: IsoTimestamp
  readonly outcome: 'APPROVED' | 'DENIED'
  readonly newAttemptId?: NewAttemptId
  readonly denialReason?: string
  readonly decisionHash: ContentHash
}

export interface RecoveryRecord {
  readonly recoveryId: RecoveryId
  readonly nodeId: NodeId
  readonly federationId: FederationId
  readonly recoveredAt: IsoTimestamp
  readonly rejoined: boolean
  readonly orphanCount: number
  readonly recoveryHash: ContentHash
}

export interface OrphanReconciliation {
  readonly reconciliationId: ReconciliationId
  readonly recoveryId: RecoveryId
  readonly reconciledAt: IsoTimestamp
  readonly orphanedEnvelopes: readonly EnvelopeId[]
  readonly reconciliationHash: ContentHash
}

export interface FailureRepository {
  saveObservation(obs: FailureObservation): Promise<void>
  saveSuspicion(s: SuspicionRecord): Promise<void>
  savePartition(p: PartitionRecord): Promise<void>
  saveFailover(d: FailoverDecision): Promise<void>
  saveRecovery(r: RecoveryRecord): Promise<void>
}

export function buildFailureObservation(
  args: { observationId: FailureObservationId; nodeId: NodeId; federationId: FederationId; failureKind: FailureKind },
  deps: BuilderDeps,
): FailureObservation {
  const observedAt = deps.clock.monotonicNow()
  const observationHash = buildHash({ ...args, observedAt }, deps.hash)
  return Object.freeze({ ...args, observedAt, observationHash })
}

export function buildSuspicionRecord(
  args: { nodeId: NodeId; federationId: FederationId; observation: FailureObservation },
  deps: BuilderDeps,
): SuspicionRecord {
  const suspicionId = deps.id.generate() as SuspicionId
  const suspectedAt = deps.clock.monotonicNow()
  const suspicionHash = buildHash(
    { suspicionId, nodeId: args.nodeId, federationId: args.federationId, suspectedAt, observationId: args.observation.observationId },
    deps.hash,
  )
  return Object.freeze({ suspicionId, nodeId: args.nodeId, federationId: args.federationId, suspectedAt, status: 'SUSPECTED' as const, suspicionHash })
}

// LAW-129: majorityNodeIds.length must be strictly greater than minorityNodeIds.length.
export function buildPartitionRecord(
  args: {
    partitionId: PartitionId
    federationId: FederationId
    affectedNodeIds: readonly NodeId[]
    majorityNodeIds: readonly NodeId[]
    minorityNodeIds: readonly NodeId[]
  },
  deps: BuilderDeps,
): PartitionRecord {
  if (args.majorityNodeIds.length <= args.minorityNodeIds.length) {
    throw makeFederationError(
      'FEDERATION_SPLIT_BRAIN_BLOCKED',
      `majority (${args.majorityNodeIds.length}) must be strictly larger than minority (${args.minorityNodeIds.length}) (LAW-129)`,
    )
  }
  const detectedAt = deps.clock.monotonicNow()
  const partitionHash = buildHash(
    { partitionId: args.partitionId, federationId: args.federationId, detectedAt, majorityCount: args.majorityNodeIds.length, minorityCount: args.minorityNodeIds.length },
    deps.hash,
  )
  return Object.freeze({
    partitionId: args.partitionId,
    federationId: args.federationId,
    detectedAt,
    affectedNodeIds: Object.freeze([...args.affectedNodeIds]),
    majorityNodeIds: Object.freeze([...args.majorityNodeIds]),
    minorityNodeIds: Object.freeze([...args.minorityNodeIds]),
    partitionHash,
  })
}

// LAW-124: strongControlBlocked is forced true when hasMajority is false; no override.
export function buildAuthorityAssessment(
  args: { partitionId: PartitionId; hasMajority: boolean; strongControlBlocked: boolean },
  deps: BuilderDeps,
): AuthorityAssessment {
  const assessmentId = deps.id.generate() as AssessmentId
  const assessedAt = deps.clock.monotonicNow()
  // LAW-124: minority side can never run strong-control operations.
  const strongControlBlocked = args.hasMajority ? args.strongControlBlocked : true
  const assessmentHash = buildHash(
    { assessmentId, partitionId: args.partitionId, assessedAt, hasMajority: args.hasMajority, strongControlBlocked },
    deps.hash,
  )
  return Object.freeze({ assessmentId, partitionId: args.partitionId, assessedAt, hasMajority: args.hasMajority, strongControlBlocked, assessmentHash })
}

export function buildFailoverRequest(
  args: { failoverId: FailoverId; failedNodeId: NodeId; federationId: FederationId; epochId: EpochId },
  deps: BuilderDeps,
): FailoverRequest {
  const requestedAt = deps.clock.monotonicNow()
  const failoverHash = buildHash({ ...args, requestedAt }, deps.hash)
  return Object.freeze({ ...args, requestedAt, failoverHash })
}

// LAW-125: APPROVED requires a non-empty newAttemptId — silent takeover is blocked.
export function buildFailoverDecision(
  request: FailoverRequest,
  intent: { outcome: 'APPROVED'; newAttemptId: string } | { outcome: 'DENIED'; denialReason?: string },
  deps: BuilderDeps,
): FailoverDecision {
  if (intent.outcome === 'APPROVED' && intent.newAttemptId.trim().length === 0) {
    throw makeFederationError(
      'FEDERATION_FAILOVER_NO_NEW_ATTEMPT',
      'APPROVED failover must carry a non-empty newAttemptId (LAW-125)',
    )
  }
  const decisionId = deps.id.generate() as DecisionId
  const decidedAt = deps.clock.monotonicNow()
  const newAttemptId = intent.outcome === 'APPROVED' ? (intent.newAttemptId as NewAttemptId) : undefined
  const decisionHash = buildHash(
    { decisionId, failoverId: request.failoverId, federationId: request.federationId, decidedAt, outcome: intent.outcome, newAttemptId },
    deps.hash,
  )
  const result: FailoverDecision = {
    decisionId,
    failoverId: request.failoverId,
    federationId: request.federationId,
    decidedAt,
    outcome: intent.outcome,
    ...(newAttemptId !== undefined ? { newAttemptId } : {}),
    decisionHash,
    ...(intent.outcome === 'DENIED' && intent.denialReason !== undefined ? { denialReason: intent.denialReason } : {}),
  }
  return Object.freeze(result)
}

export function buildRecoveryRecord(
  args: { recoveryId: RecoveryId; nodeId: NodeId; federationId: FederationId; rejoined: boolean; orphanCount: number },
  deps: BuilderDeps,
): RecoveryRecord {
  const recoveredAt = deps.clock.monotonicNow()
  const recoveryHash = buildHash({ ...args, recoveredAt }, deps.hash)
  return Object.freeze({ ...args, recoveredAt, recoveryHash })
}

export function buildOrphanReconciliation(
  args: { recoveryId: RecoveryId; orphanedEnvelopes: readonly EnvelopeId[] },
  deps: BuilderDeps,
): OrphanReconciliation {
  const reconciliationId = deps.id.generate() as ReconciliationId
  const reconciledAt = deps.clock.monotonicNow()
  const reconciliationHash = buildHash({ reconciliationId, recoveryId: args.recoveryId, reconciledAt, orphanCount: args.orphanedEnvelopes.length }, deps.hash)
  return Object.freeze({
    reconciliationId,
    recoveryId: args.recoveryId,
    reconciledAt,
    orphanedEnvelopes: Object.freeze([...args.orphanedEnvelopes]),
    reconciliationHash,
  })
}

// ── Constitutional laws ─────────────────────────────────────────────────────

export const STAGE_14_CONSTITUTIONAL_LAWS = [
  { id: 'LAW-118', description: 'Federated identity is cryptographically bound; bare node discovery confers no trust.' },
  { id: 'LAW-119', description: 'A node must be admitted before it may participate in any federation activity.' },
  { id: 'LAW-120', description: 'Placement preserves local policy; a placement decision cannot weaken node policy.' },
  { id: 'LAW-121', description: 'Trust does not propagate implicitly across nodes; each edge is verified independently.' },
  { id: 'LAW-122', description: 'Cross-node execution requires complete evidence; missing remote evidence is rejected.' },
  { id: 'LAW-123', description: 'Federation decisions are deterministic given the same epoch, membership, and inputs.' },
  { id: 'LAW-124', description: 'Under partition the federation degrades safely; unsafe partition operation is rejected.' },
  { id: 'LAW-125', description: 'Failover is governed; a failover must produce a new authorized attempt, not silent takeover.' },
  { id: 'LAW-126', description: 'Replicated state integrity holds; STRONG_CONTROL records cannot use last-write-wins.' },
  { id: 'LAW-127', description: 'Membership changes require an epoch; a membership change without an epoch is rejected.' },
  { id: 'LAW-128', description: 'Local authority is preserved; LOCAL_ONLY state is never overridden by federation.' },
  { id: 'LAW-129', description: 'No split-brain authority; two concurrent authorities in one federation are blocked.' },
] as const

export type ConstitutionalLaw = typeof STAGE_14_CONSTITUTIONAL_LAWS[number]
