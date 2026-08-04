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

export interface PolicySnapshot {
  readonly policyHash: ContentHash
}

export interface AdmissionAssessment {
  readonly assessmentId: string
  readonly admissionId: AdmissionId
  readonly assessedAt: IsoTimestamp
  readonly assessmentHash: ContentHash
  // LAW-121: trust is captured explicitly per assessment and never inherited
  // from another node's admission. buildAdmissionDecision asserts it matches
  // the admitted node before it can drive an ADMITTED outcome.
  readonly trustSnapshot: TrustSnapshot
  readonly policySnapshot: PolicySnapshot
}

export type AdmissionOutcome = 'ADMITTED' | 'REJECTED'

export interface AdmissionDecision {
  readonly decisionId: string
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
  return { ...args, createdAt, identityHash }
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
  return { attestationId, nodeId, attestationHash, attestedAt: evidence.attestedAt }
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
  return { admissionId, requestedAt, requestHash, ...args }
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
  const decisionId = deps.id.generate()
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
  return {
    decisionId,
    admissionId: request.admissionId,
    nodeId: request.nodeId,
    federationId: request.federationId,
    decidedAt,
    outcome,
    decisionHash,
    ...(rejectionReason !== undefined ? { rejectionReason } : {}),
  }
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
  return { revocationId, nodeId, federationId, issuedAt, reason, directiveHash }
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
  return {
    revocationId: directive.revocationId,
    nodeId: directive.nodeId,
    federationId: directive.federationId,
    revokedAt,
    drainCompleted,
    revocationHash,
  }
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
    return buildAdmissionDecision(request, assessment, 'ADMITTED', this.deps)
  }

  revokeNode(directive: RevocationDirective): RevocationRecord {
    return buildRevocationRecord(directive, false, this.deps)
  }
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
