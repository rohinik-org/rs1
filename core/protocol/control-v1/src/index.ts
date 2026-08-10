/**
 * @rohinik-org/control-protocol-v1
 *
 * Public protocol package for the Stage 16E control plane.
 * No behavior — pure type and constant exports.
 * Covers: artifact registration, approval binding, workflow state,
 * pre-mutation checkpoint, mutation outcome, apply/verify/recovery
 * records, evidence, and stable public error codes.
 */

// ── Protocol version ──────────────────────────────────────────────────────────

export const CONTROL_PROTOCOL_VERSION = '1.0.0' as const
export type ControlProtocolVersion = typeof CONTROL_PROTOCOL_VERSION

// ── Workflow state machine ────────────────────────────────────────────────────
//
// States without ROLLBACK_PENDING / ROLLING_BACK.
// Rollback is represented as a RecoveryStrategy within RECOVERING.

export const ControlWorkflowState = Object.freeze({
  DRAFT:                'DRAFT',
  AWAITING_APPROVAL:    'AWAITING_APPROVAL',
  APPROVED:             'APPROVED',
  APPLYING:             'APPLYING',
  APPLIED:              'APPLIED',
  VERIFYING:            'VERIFYING',
  VERIFIED:             'VERIFIED',
  VERIFICATION_FAILED:  'VERIFICATION_FAILED',
  RECOVERY_REQUIRED:    'RECOVERY_REQUIRED',
  RECOVERING:           'RECOVERING',
  RECOVERED:            'RECOVERED',
  FAILED:               'FAILED',
  CANCELLED:            'CANCELLED',
} as const)
export type ControlWorkflowState = typeof ControlWorkflowState[keyof typeof ControlWorkflowState]

export const ControlWorkflowTransitions: Readonly<Record<ControlWorkflowState, ReadonlyArray<ControlWorkflowState>>> = Object.freeze({
  DRAFT:               ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL:   ['APPROVED', 'CANCELLED'],
  APPROVED:            ['APPLYING', 'CANCELLED'],
  APPLYING:            ['APPLIED', 'RECOVERY_REQUIRED', 'FAILED', 'CANCELLED'],
  APPLIED:             ['VERIFYING', 'CANCELLED'],
  VERIFYING:           ['VERIFIED', 'VERIFICATION_FAILED'],
  VERIFIED:            [],
  VERIFICATION_FAILED: ['RECOVERY_REQUIRED', 'FAILED'],
  RECOVERY_REQUIRED:   ['RECOVERING', 'FAILED', 'CANCELLED'],
  RECOVERING:          ['RECOVERED', 'FAILED'],
  RECOVERED:           [],
  FAILED:              [],
  CANCELLED:           [],
} as const)

export const ControlWorkflowTerminalStates: ReadonlySet<ControlWorkflowState> = new Set([
  ControlWorkflowState.VERIFIED,
  ControlWorkflowState.RECOVERED,
  ControlWorkflowState.FAILED,
  ControlWorkflowState.CANCELLED,
])

// ── ControlArtifact ───────────────────────────────────────────────────────────
//
// Represents any governed artifact subject to hash-bound approval.
// actionType scopes what kind of mutation the artifact authorises.
// scope narrows the target (e.g. repository path, package name).

export const ControlArtifactActionType = Object.freeze({
  FILE_PATCH:       'FILE_PATCH',
  SCHEMA_MIGRATION: 'SCHEMA_MIGRATION',
  CONFIG_CHANGE:    'CONFIG_CHANGE',
  SCRIPT_EXECUTION: 'SCRIPT_EXECUTION',
} as const)
export type ControlArtifactActionType = typeof ControlArtifactActionType[keyof typeof ControlArtifactActionType]

export interface ControlArtifact {
  readonly artifactId:    string
  readonly version:       string
  readonly actionType:    ControlArtifactActionType
  readonly contentHash:   string    // SHA-256 hex of canonical artifact content
  readonly scope:         string    // e.g. repository path or namespace
  readonly createdAt:     string    // ISO-8601
  readonly content:       string    // raw artifact payload (unified diff, SQL, etc.)
  readonly evidenceRef?:  string    // optional reference to originating execution/run
}

// ── ApprovalBinding / ApprovalDecision ───────────────────────────────────────
//
// ApprovalBinding binds exactly: artifactId + version + contentHash + actionType + scope.
// Any mutation to these fields invalidates the binding.
// A Stage 15E oversight decision is NOT a valid ApprovalBinding.

export interface ApprovalBinding {
  readonly artifactId:   string
  readonly version:      string
  readonly contentHash:  string
  readonly actionType:   ControlArtifactActionType
  readonly scope:        string
}

export interface ApprovalDecision {
  readonly approvalId:     string
  readonly binding:        ApprovalBinding
  readonly approvedAt:     string    // ISO-8601
  readonly operatorId:     string
  readonly rationale?:     string
  readonly expiresAt?:     string    // ISO-8601; absent = no expiry
}

// ── PreMutationCheckpoint ─────────────────────────────────────────────────────
//
// Captures working-tree state before any governed mutation.
// headRef and workingTreeHash together define the rollback anchor.
// dirtyState.files lists paths modified but not yet committed.
// Rollback may only reverse changes attributable to the governed workflow.
// Broader destructive authority (reset --hard, checkout -- .) requires
// explicit approval with actionType SCRIPT_EXECUTION.

export interface PreMutationCheckpoint {
  readonly checkpointId:     string
  readonly capturedAt:       string    // ISO-8601
  readonly headRef:          string    // git rev-parse HEAD
  readonly workingTreeHash:  string    // hash of working tree state (e.g. git stash --include-untracked)
  readonly indexHash:        string    // hash of index state (git write-tree)
  readonly dirtyState: {
    readonly hasUncommittedChanges: boolean
    readonly stagedFileCount:       number
    readonly unstagedFileCount:     number
    readonly untrackedFileCount:    number
    readonly files:                 ReadonlyArray<string>
  }
  readonly evidenceRef?:     string    // link to PreMutationCheckpointEvidence
}

// ── MutationOutcome ───────────────────────────────────────────────────────────
//
// Explicitly models what happened to the working tree during apply.
// NOT_STARTED — apply was never called
// NO_MUTATION — apply ran but made no changes (e.g. already applied, empty diff)
// APPLIED     — apply completed; all hunks succeeded
// PARTIAL     — apply ran; some hunks applied before failure (--reject mode or equivalent)
// INDETERMINATE — outcome cannot be determined from available evidence

export const MutationOutcome = Object.freeze({
  NOT_STARTED:    'NOT_STARTED',
  NO_MUTATION:    'NO_MUTATION',
  APPLIED:        'APPLIED',
  PARTIAL:        'PARTIAL',
  INDETERMINATE:  'INDETERMINATE',
} as const)
export type MutationOutcome = typeof MutationOutcome[keyof typeof MutationOutcome]

// ── ApplyRecord ───────────────────────────────────────────────────────────────

export interface ApplyRecord {
  readonly artifactId:          string
  readonly appliedAt:           string    // ISO-8601
  readonly method:              string    // e.g. 'git apply'
  readonly exitCode:            number
  readonly stdout:              string
  readonly stderr:              string
  readonly mutationOutcome:     MutationOutcome
  readonly checkpointId:        string    // foreign key to PreMutationCheckpoint
}

// ── VerificationResult ────────────────────────────────────────────────────────

export const VerificationStatus = Object.freeze({
  PASSED:        'PASSED',
  FAILED:        'FAILED',
  SKIPPED:       'SKIPPED',
  ERROR:         'ERROR',
  INCONCLUSIVE:  'INCONCLUSIVE',  // process ran but result cannot be trusted
} as const)
export type VerificationStatus = typeof VerificationStatus[keyof typeof VerificationStatus]

export interface VerificationCheck {
  readonly checkId:       string
  readonly name:          string
  readonly status:        VerificationStatus
  readonly durationMs:    number
  readonly diagnostics?:  string      // bounded summary (max ~500 chars); full output via evidenceRef
  readonly evidenceRef?:  string
}

export interface VerificationResult {
  readonly resultId:        string
  readonly artifactId:      string
  readonly workflowId:      string
  readonly verifierId:      string    // identity of the verifier agent/tool
  readonly verifierVersion: string
  readonly command:         string
  readonly startedAt:       string    // ISO-8601
  readonly finishedAt:      string    // ISO-8601
  readonly durationMs:      number
  readonly exitCode:        number
  readonly status:          VerificationStatus
  readonly checks:          ReadonlyArray<VerificationCheck>
  readonly diagnostics?:    string    // bounded summary; full output via evidenceRef
  readonly stdoutRef?:      string    // evidenceRef for full stdout
  readonly stderrRef?:      string    // evidenceRef for full stderr
  readonly timedOut:        boolean
  readonly evidenceRef?:    string
}

// ── RecoveryStrategy ─────────────────────────────────────────────────────────
//
// Rollback is a RecoveryStrategy within RECOVERING, not a separate state.
// REVERSE_PATCH — issue git apply --reverse using stored artifact content
// RESTORE_CHECKPOINT — restore to PreMutationCheckpoint state
//   (only attributable changes; requires no pre-existing dirty state, or explicit approval)
// COMPENSATING_CHANGE — apply a separate compensating artifact (requires its own approval)
// MANUAL — operator declares manual resolution; no automated action

export const RecoveryStrategy = Object.freeze({
  REVERSE_PATCH:        'REVERSE_PATCH',
  RESTORE_CHECKPOINT:   'RESTORE_CHECKPOINT',
  COMPENSATING_CHANGE:  'COMPENSATING_CHANGE',
  MANUAL:               'MANUAL',
} as const)
export type RecoveryStrategy = typeof RecoveryStrategy[keyof typeof RecoveryStrategy]

export interface RecoveryDirective {
  readonly directiveId:        string
  readonly artifactId:         string
  readonly strategy:           RecoveryStrategy
  readonly issuedAt:           string    // ISO-8601
  readonly operatorId:         string
  readonly rationale:          string
  readonly checkpointId?:      string    // required for RESTORE_CHECKPOINT
  readonly compensatingArtifactId?: string  // required for COMPENSATING_CHANGE
}

export interface RecoveryRecord {
  readonly directiveId:     string
  readonly artifactId:      string
  readonly startedAt:       string    // ISO-8601
  readonly completedAt:     string    // ISO-8601
  readonly strategy:        RecoveryStrategy
  readonly exitCode:        number
  readonly stdout:          string
  readonly stderr:          string
  readonly mutationOutcome: MutationOutcome
  readonly succeeded:       boolean
}

// ── ControlWorkflow ───────────────────────────────────────────────────────────

export interface ControlWorkflow {
  readonly workflowId:     string
  readonly artifactId:     string
  readonly state:          ControlWorkflowState
  readonly createdAt:      string    // ISO-8601
  readonly updatedAt:      string    // ISO-8601
  readonly approvalId?:    string    // set when APPROVED or later
  readonly checkpointId?:  string    // set before APPLYING
  readonly applyRecord?:   ApplyRecord
  readonly verification?:  VerificationResult
  readonly recovery?:      RecoveryRecord
}

// ── Route DTOs ────────────────────────────────────────────────────────────────

// POST /v1/control/artifacts
export interface RegisterArtifactRequest {
  readonly actionType:  ControlArtifactActionType
  readonly scope:       string
  readonly content:     string
  readonly evidenceRef?: string
}

export interface RegisterArtifactResponse {
  readonly artifactId:   string
  readonly version:      string
  readonly contentHash:  string
  readonly actionType:   ControlArtifactActionType
  readonly scope:        string
  readonly createdAt:    string
}

// POST /v1/control/artifacts/:id/approve
export interface ApproveArtifactRequest {
  readonly contentHash:  string    // must match stored contentHash
  readonly actionType:   ControlArtifactActionType
  readonly scope:        string
  readonly operatorId:   string
  readonly rationale?:   string
  readonly expiresAt?:   string
}

export interface ApproveArtifactResponse {
  readonly approvalId:  string
  readonly artifactId:  string
  readonly binding:     ApprovalBinding
  readonly approvedAt:  string
}

// POST /v1/control/artifacts/:id/deny
export interface DenyArtifactRequest {
  readonly operatorId: string
  readonly rationale?: string
}

export interface DenyArtifactResponse {
  readonly ok:         boolean
  readonly artifactId: string
  readonly deniedAt:   string
}

// POST /v1/control/workflows
export interface CreateWorkflowRequest {
  readonly artifactId: string
}

export interface CreateWorkflowResponse {
  readonly workflowId: string
  readonly artifactId: string
  readonly state:      ControlWorkflowState
  readonly createdAt:  string
}

// GET /v1/control/workflows/:id
export type GetWorkflowResponse = ControlWorkflow

// POST /v1/control/workflows/:id/apply
export interface ApplyWorkflowRequest {
  readonly approvalId: string
}

export interface ApplyWorkflowResponse {
  readonly workflowId:     string
  readonly state:          ControlWorkflowState
  readonly applyRecord:    ApplyRecord
  readonly checkpointId:   string
}

// POST /v1/control/workflows/:id/verify
export interface VerifyWorkflowRequest {
  readonly command:          string
  readonly verifierId?:      string
  readonly verifierVersion?: string
  readonly timeoutMs?:       number
}

export interface VerifyWorkflowResponse {
  readonly workflowId:    string
  readonly state:         ControlWorkflowState
  readonly verification:  VerificationResult
}

// POST /v1/control/workflows/:id/recover
export interface RecoverWorkflowRequest {
  readonly strategy:   RecoveryStrategy
  readonly operatorId: string
  readonly rationale:  string
  readonly checkpointId?:           string
  readonly compensatingArtifactId?: string
}

export interface RecoverWorkflowResponse {
  readonly workflowId: string
  readonly state:      ControlWorkflowState
  readonly recovery:   RecoveryRecord
}

// POST /v1/control/workflows/:id/cancel
export interface CancelWorkflowRequest {
  readonly operatorId: string
  readonly reason?:    string
}

export interface CancelWorkflowResponse {
  readonly workflowId:  string
  readonly state:       ControlWorkflowState
  readonly cancelledAt: string
}

// GET /v1/control/workflows/:id/evidence
export interface ControlEvidenceEvent {
  readonly eventId:     string
  readonly kind:        string
  readonly occurredAt:  string    // ISO-8601
  readonly fromState?:  ControlWorkflowState
  readonly toState?:    ControlWorkflowState
  readonly operatorId?: string
  readonly detail?:     unknown
}

export interface ControlEvidenceResponse {
  readonly workflowId: string
  readonly artifactId: string
  readonly state:      ControlWorkflowState
  readonly events:     ReadonlyArray<ControlEvidenceEvent>
}

// ── Public error codes ────────────────────────────────────────────────────────

export const ControlErrorCode = Object.freeze({
  ARTIFACT_NOT_FOUND:       'ARTIFACT_NOT_FOUND',
  ARTIFACT_ALREADY_EXISTS:  'ARTIFACT_ALREADY_EXISTS',
  HASH_MISMATCH:            'HASH_MISMATCH',
  APPROVAL_NOT_FOUND:       'APPROVAL_NOT_FOUND',
  APPROVAL_EXPIRED:         'APPROVAL_EXPIRED',
  APPROVAL_BINDING_INVALID: 'APPROVAL_BINDING_INVALID',
  WORKFLOW_NOT_FOUND:       'WORKFLOW_NOT_FOUND',
  INVALID_TRANSITION:       'INVALID_TRANSITION',
  CHECKPOINT_REQUIRED:      'CHECKPOINT_REQUIRED',
  CHECKPOINT_NOT_FOUND:     'CHECKPOINT_NOT_FOUND',
  RECOVERY_UNSAFE:          'RECOVERY_UNSAFE',
  VERIFICATION_REQUIRED:    'VERIFICATION_REQUIRED',
  NO_APPROVAL:              'NO_APPROVAL',
  ALREADY_APPROVED:         'ALREADY_APPROVED',
  INVALID_REQUEST:          'INVALID_REQUEST',
  INTERNAL_ERROR:           'INTERNAL_ERROR',
} as const)
export type ControlErrorCode = typeof ControlErrorCode[keyof typeof ControlErrorCode]

export interface ControlErrorEnvelope {
  readonly code:       ControlErrorCode
  readonly message:    string
  readonly workflowId?: string
  readonly artifactId?: string
  readonly detail?:    unknown
}

// ── Protocol constants ────────────────────────────────────────────────────────

export const CONTROL_PROTOCOL_CONSTANTS = Object.freeze({
  version:          CONTROL_PROTOCOL_VERSION,
  routePrefix:      '/v1/control',
  terminalStates:   ['VERIFIED', 'RECOVERED', 'FAILED', 'CANCELLED'] as const,
  recoveryStrategies: ['REVERSE_PATCH', 'RESTORE_CHECKPOINT', 'COMPENSATING_CHANGE', 'MANUAL'] as const,
  mutationOutcomes:   ['NOT_STARTED', 'NO_MUTATION', 'APPLIED', 'PARTIAL', 'INDETERMINATE'] as const,
} as const)
