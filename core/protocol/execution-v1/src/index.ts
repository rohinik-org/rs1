// Protocol version — all artifacts must embed this string
export const EXECUTION_PROTOCOL_VERSION = 'v1' as const
export type ExecutionProtocolVersion = typeof EXECUTION_PROTOCOL_VERSION

// ── Public execution states ───────────────────────────────────────────────────

export const PublicExecutionState = Object.freeze({
  QUEUED:     'QUEUED',
  ADMITTED:   'ADMITTED',
  RUNNING:    'RUNNING',
  WAITING:    'WAITING',
  CANCELLING: 'CANCELLING',
  COMPLETED:  'COMPLETED',
  FAILED:     'FAILED',
  CANCELLED:  'CANCELLED',
} as const)
export type PublicExecutionState = typeof PublicExecutionState[keyof typeof PublicExecutionState]

export const PUBLIC_TERMINAL_STATES: ReadonlySet<PublicExecutionState> = new Set([
  PublicExecutionState.COMPLETED,
  PublicExecutionState.FAILED,
  PublicExecutionState.CANCELLED,
])

// ── Public execution identity ─────────────────────────────────────────────────

export interface ExecutionIdentity {
  /** Stable external identifier for this execution */
  readonly executionId: string
  /** Opaque idempotency key supplied by caller — binds to semantic request identity */
  readonly idempotencyKey: string | null
  /** Protocol version this execution was submitted under */
  readonly protocolVersion: ExecutionProtocolVersion
  readonly submittedAt: string // ISO-8601
}

// ── Submit DTO ────────────────────────────────────────────────────────────────

export interface SubmitExecutionRequest {
  /** Free-text intent or structured content to execute */
  readonly content: string
  readonly contentType: string
  readonly intentHint?: string
  readonly context?: Readonly<Record<string, unknown>>
  readonly constraints?: {
    readonly allowReasoning?: boolean
    readonly timeoutMs?: number
  }
  /**
   * Caller-supplied idempotency key.
   * Same key + same semantic content = same executionId returned without re-execution.
   */
  readonly idempotencyKey?: string
}

export interface SubmitExecutionResponse {
  readonly executionId: string
  readonly idempotencyKey: string | null
  readonly state: PublicExecutionState
  readonly protocolVersion: ExecutionProtocolVersion
  readonly submittedAt: string
  /** True when the response was served from an existing idempotent record */
  readonly idempotent: boolean
}

// ── Status DTO ────────────────────────────────────────────────────────────────

export interface ExecutionStatusResponse {
  readonly executionId: string
  readonly state: PublicExecutionState
  readonly protocolVersion: ExecutionProtocolVersion
  readonly submittedAt: string
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly cancelledAt: string | null
  readonly terminal: boolean
}

// ── Result DTO ────────────────────────────────────────────────────────────────

export interface ExecutionResultResponse {
  readonly executionId: string
  readonly state: PublicExecutionState
  readonly output: unknown
  readonly totalDurationMs: number
  readonly completedAt: string
}

// ── Cancel DTO ───────────────────────────────────────────────────────────────

export interface CancelExecutionRequest {
  /** Optional caller-supplied reason for audit/evidence trail */
  readonly reason?: string
}

export interface CancelExecutionResponse {
  readonly executionId: string
  readonly state: PublicExecutionState
  readonly cancelAccepted: boolean
}

// ── Evidence DTO ─────────────────────────────────────────────────────────────

export interface EvidenceEntry {
  readonly kind: string
  readonly stepId: string | null
  readonly detail: unknown
  readonly recordedAt: string
}

export interface ExecutionEvidenceResponse {
  readonly executionId: string
  readonly entries: ReadonlyArray<EvidenceEntry>
}

// ── Canonical public error envelope ──────────────────────────────────────────

export const PublicErrorCode = Object.freeze({
  EXECUTION_NOT_FOUND:    'EXECUTION_NOT_FOUND',
  RESULT_NOT_READY:       'RESULT_NOT_READY',
  EXECUTION_NOT_TERMINAL: 'EXECUTION_NOT_TERMINAL',
  CANCEL_NOT_ALLOWED:     'CANCEL_NOT_ALLOWED',
  INVALID_REQUEST:        'INVALID_REQUEST',
  IDEMPOTENCY_CONFLICT:   'IDEMPOTENCY_CONFLICT',
  INTERNAL_ERROR:         'INTERNAL_ERROR',
  PROTOCOL_VERSION_MISMATCH: 'PROTOCOL_VERSION_MISMATCH',
} as const)
export type PublicErrorCode = typeof PublicErrorCode[keyof typeof PublicErrorCode]

export interface PublicErrorEnvelope {
  readonly code: PublicErrorCode
  readonly message: string
  readonly executionId?: string
  readonly protocolVersion: ExecutionProtocolVersion
  readonly detail?: unknown
}

// ── JSON-safe constants ───────────────────────────────────────────────────────

export const PROTOCOL_CONSTANTS = Object.freeze({
  version:         EXECUTION_PROTOCOL_VERSION,
  routePrefix:     '/v1/executions',
  maxIdempotencyKeyLength: 256,
  resultNotReadyCode:      PublicErrorCode.RESULT_NOT_READY,
  terminalStates:          ['COMPLETED', 'FAILED', 'CANCELLED'] as const,
} as const)
