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

// ── Schema contracts (Stage 16C) ─────────────────────────────────────────────

/**
 * Stable reference to a registered output schema.
 * All three fields are required — no implicit latest-version resolution.
 */
export interface OutputSchemaRef {
  readonly schemaId: string
  readonly version: string
  /** SHA-256 hex of the canonical JSON Schema text. Binds exact content, not just identity. */
  readonly semanticHash: string
}

/**
 * Authoritative server-side validation outcome for an execution result.
 *
 * VALID          — output conforms to the bound output schema.
 * INVALID        — output does not conform; result payload blocked.
 * NOT_REQUESTED  — no outputSchemaRef was supplied at submission time.
 * NOT_EVALUATED  — schema was referenced but validation was not attempted
 *                  (schema not found, runtime error, etc).
 *
 * INVALID and NOT_EVALUATED are never VALID.
 */
export const ValidationOutcome = Object.freeze({
  VALID:         'VALID',
  INVALID:       'INVALID',
  NOT_REQUESTED: 'NOT_REQUESTED',
  NOT_EVALUATED: 'NOT_EVALUATED',
} as const)
export type ValidationOutcome = typeof ValidationOutcome[keyof typeof ValidationOutcome]

/** Validation summary embedded in ExecutionResultResponse. */
export interface ValidationResult {
  readonly outcome: ValidationOutcome
  /**
   * Present when outcome is INVALID.
   * Human-readable summary of the first/primary validation error.
   */
  readonly firstError?: string
  /** Number of validation errors found. 0 when VALID or NOT_REQUESTED. */
  readonly errorCount: number
  /** The schema reference that was evaluated, if any. */
  readonly schemaRef?: OutputSchemaRef
}

// ── Schema registry DTOs (Stage 16C) ─────────────────────────────────────────

/** Request body for POST /v1/schemas — register a new schema version. */
export interface RegisterSchemaRequest {
  readonly schemaId: string
  readonly version: string
  /** The full JSON Schema document as a plain object. */
  readonly schema: Readonly<Record<string, unknown>>
}

/** Response for POST /v1/schemas and GET /v1/schemas/:schemaId/:version. */
export interface SchemaRecord {
  readonly schemaId: string
  readonly version: string
  /** SHA-256 hex of the canonical JSON Schema text (server-computed, deterministic). */
  readonly semanticHash: string
  readonly registeredAt: string // ISO-8601
  readonly schema: Readonly<Record<string, unknown>>
}

/** Request body for POST /v1/schemas/:schemaId/:version/validate. */
export interface ValidateAgainstSchemaRequest {
  /** The value to validate. Any JSON-serialisable type. */
  readonly value: unknown
}

/** Response for POST /v1/schemas/:schemaId/:version/validate. */
export interface ValidateAgainstSchemaResponse {
  readonly schemaId: string
  readonly version: string
  readonly semanticHash: string
  readonly outcome: ValidationOutcome
  readonly errorCount: number
  readonly errors: ReadonlyArray<string>
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
  /**
   * Optional output schema binding. When present, RS1 validates the provider
   * output against this schema before committing the terminal result.
   * All three fields in OutputSchemaRef are required — no implicit version resolution.
   */
  readonly outputSchemaRef?: OutputSchemaRef
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
  /** Content type of output (e.g. 'TEXT', 'JSON', 'application/json'). Added in Stage 16C. */
  readonly contentType?: string
  readonly totalDurationMs: number
  readonly completedAt: string
  /** Present when outputSchemaRef was supplied at submission. Added in Stage 16C. */
  readonly validationResult?: ValidationResult
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
  // Stage 16C schema registry errors
  SCHEMA_NOT_FOUND:       'SCHEMA_NOT_FOUND',
  SCHEMA_HASH_MISMATCH:   'SCHEMA_HASH_MISMATCH',
  SCHEMA_ALREADY_EXISTS:  'SCHEMA_ALREADY_EXISTS',
  VALIDATION_FAILED:      'VALIDATION_FAILED',
} as const)
export type PublicErrorCode = typeof PublicErrorCode[keyof typeof PublicErrorCode]

export interface PublicErrorEnvelope {
  readonly code: PublicErrorCode
  readonly message: string
  readonly executionId?: string
  readonly protocolVersion: ExecutionProtocolVersion
  readonly detail?: unknown
}

// ── Event contracts (Stage 16B) ───────────────────────────────────────────────

export {
  PublicEventKind,
  PUBLIC_TERMINAL_EVENT_KINDS,
  encodeExecutionCursor,
  decodeExecutionCursor,
  EVENT_SCHEMAS,
} from './events.js'
export type {
  PublicEventKind as PublicEventKindType,
  ExecutionCursor,
  ExecutionEventEnvelope,
  PublicExecutionEvent,
  ExecutionAcceptedPayload,
  ExecutionAdmittedPayload,
  ExecutionStartedPayload,
  StatusChangedPayload,
  ProgressPayload,
  PartialOutputPayload,
  UsageObservedPayload,
  WaitingPayload,
  CancellationRequestedPayload,
  ExecutionCompletedPayload,
  ExecutionFailedPayload,
  ExecutionCancelledPayload,
} from './events.js'

// ── JSON-safe constants ───────────────────────────────────────────────────────

export const PROTOCOL_CONSTANTS = Object.freeze({
  version:         EXECUTION_PROTOCOL_VERSION,
  routePrefix:     '/v1/executions',
  schemaRoutePrefix: '/v1/schemas',
  maxIdempotencyKeyLength: 256,
  resultNotReadyCode:      PublicErrorCode.RESULT_NOT_READY,
  terminalStates:          ['COMPLETED', 'FAILED', 'CANCELLED'] as const,
  validationOutcomes:      ['VALID', 'INVALID', 'NOT_REQUESTED', 'NOT_EVALUATED'] as const,
} as const)
