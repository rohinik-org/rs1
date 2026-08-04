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

export interface FailureObservationRecord {
  readonly observationId: FailureObservationId
  readonly federationId: FederationId
  readonly nodeId: NodeId
  readonly observedAt: IsoTimestamp
}

export interface RecoveryRecord {
  readonly recoveryId: RecoveryId
  readonly federationId: FederationId
  readonly failoverId: FailoverId | undefined
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

export interface RemoteExecutionRepository {
  save(record: RemoteExecutionRecord): Promise<void>
  findById(id: RemoteExecutionId): Promise<RemoteExecutionRecord | undefined>
}

export interface ReplicationRepository {
  save(record: ReplicatedRecord): Promise<void>
  findById(id: ReplicatedRecordId): Promise<ReplicatedRecord | undefined>
}

export interface FailureRepository {
  save(record: FailureObservationRecord): Promise<void>
  findById(id: FailureObservationId): Promise<FailureObservationRecord | undefined>
}

export interface RecoveryRepository {
  save(record: RecoveryRecord): Promise<void>
  findById(id: RecoveryId): Promise<RecoveryRecord | undefined>
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
  readonly allowedRegions: string[]
  readonly forbiddenRegions: string[]
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
