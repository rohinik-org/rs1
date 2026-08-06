import type {
  PublicExecutionState,
  SubmitExecutionRequest,
  EvidenceEntry,
} from '@rohinik-org/execution-protocol-v1'
import {
  PUBLIC_TERMINAL_STATES,
  EXECUTION_PROTOCOL_VERSION,
  PublicErrorCode,
  type PublicErrorEnvelope,
} from '@rohinik-org/execution-protocol-v1'
import { randomUUID } from 'node:crypto'

// ── AsyncExecutionRecord ──────────────────────────────────────────────────────
//
// Public-facing durable tracking record for one asynchronous execution.
// Correlated to internal engine state by sessionId + executionId references.
// Terminal records are immutable — result and final state cannot be overwritten.

export interface AsyncExecutionResult {
  readonly output: unknown
  readonly totalDurationMs: number
  readonly completedAt: string // ISO-8601
}

export interface AsyncExecutionRecord {
  // Public identity
  readonly executionId: string
  readonly idempotencyKey: string | null
  readonly protocolVersion: typeof EXECUTION_PROTOCOL_VERSION

  // Public state projection
  readonly state: PublicExecutionState

  // Correlation — internal engine references (never exposed via protocol)
  readonly internalSessionId: string | null
  readonly internalExecutionId: string // same as executionId; retained for explicitness

  // Timestamps (ISO-8601)
  readonly submittedAt: string
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly cancelledAt: string | null

  // Set once on terminal — immutable after that
  readonly result: AsyncExecutionResult | null

  // Accumulated evidence entries (append-only)
  readonly evidenceEntries: ReadonlyArray<EvidenceEntry>

  // Original request payload — retained for idempotency validation
  readonly requestSnapshot: Pick<SubmitExecutionRequest, 'content' | 'contentType' | 'idempotencyKey'>
}

// ── Repository interface ──────────────────────────────────────────────────────

export interface IAsyncExecutionRepository {
  /** Persist a new record. Throws if executionId already exists. */
  save(record: AsyncExecutionRecord): Promise<void>

  /** Update mutable state. Enforces terminal immutability — throws if record is terminal and state/result differ. */
  update(executionId: string, patch: AsyncExecutionRecordPatch): Promise<AsyncExecutionRecord>

  /** Retrieve by public executionId. */
  findById(executionId: string): Promise<AsyncExecutionRecord | undefined>

  /** Retrieve by idempotency key (returns latest if multiple — key should be unique per implementation). */
  findByIdempotencyKey(key: string): Promise<AsyncExecutionRecord | undefined>

  /** Retrieve by internal sessionId correlation. */
  findBySessionId(sessionId: string): Promise<AsyncExecutionRecord | undefined>

  /** Append evidence entries. No-op if record does not exist or is already terminal. */
  appendEvidence(executionId: string, entries: ReadonlyArray<EvidenceEntry>): Promise<void>
}

/** Fields that can legally change after initial save. Terminal records reject state/result changes. */
export interface AsyncExecutionRecordPatch {
  readonly state?: PublicExecutionState
  readonly internalSessionId?: string
  readonly startedAt?: string
  readonly completedAt?: string
  readonly cancelledAt?: string
  readonly result?: AsyncExecutionResult
}

// ── Terminal immutability guard ───────────────────────────────────────────────

function assertNotTerminal(record: AsyncExecutionRecord, patch: AsyncExecutionRecordPatch): void {
  if (!PUBLIC_TERMINAL_STATES.has(record.state)) return
  const attemptsStateChange = patch.state !== undefined && patch.state !== record.state
  const attemptsResultChange = patch.result !== undefined
  if (attemptsStateChange || attemptsResultChange) {
    const err: PublicErrorEnvelope = {
      code:            PublicErrorCode.INTERNAL_ERROR,
      message:         `Terminal execution ${record.executionId} (${record.state}) cannot be mutated`,
      executionId:     record.executionId,
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
    }
    throw Object.assign(new Error(err.message), { publicEnvelope: err })
  }
}

// ── InMemoryAsyncExecutionRepository ─────────────────────────────────────────

export class InMemoryAsyncExecutionRepository implements IAsyncExecutionRepository {
  private readonly byId          = new Map<string, AsyncExecutionRecord>()
  private readonly byIdemKey     = new Map<string, string>()  // idempotencyKey → executionId
  private readonly bySessionId   = new Map<string, string>()  // internalSessionId → executionId

  async save(record: AsyncExecutionRecord): Promise<void> {
    if (this.byId.has(record.executionId)) {
      const err: PublicErrorEnvelope = {
        code:            PublicErrorCode.INTERNAL_ERROR,
        message:         `AsyncExecutionRecord ${record.executionId} already exists`,
        executionId:     record.executionId,
        protocolVersion: EXECUTION_PROTOCOL_VERSION,
      }
      throw Object.assign(new Error(err.message), { publicEnvelope: err })
    }
    this.byId.set(record.executionId, record)
    if (record.idempotencyKey !== null) {
      this.byIdemKey.set(record.idempotencyKey, record.executionId)
    }
    if (record.internalSessionId !== null) {
      this.bySessionId.set(record.internalSessionId, record.executionId)
    }
  }

  async update(executionId: string, patch: AsyncExecutionRecordPatch): Promise<AsyncExecutionRecord> {
    const existing = this.byId.get(executionId)
    if (existing === undefined) {
      const err: PublicErrorEnvelope = {
        code:            PublicErrorCode.EXECUTION_NOT_FOUND,
        message:         `Execution ${executionId} not found`,
        executionId,
        protocolVersion: EXECUTION_PROTOCOL_VERSION,
      }
      throw Object.assign(new Error(err.message), { publicEnvelope: err })
    }
    assertNotTerminal(existing, patch)

    const updated: AsyncExecutionRecord = Object.freeze({
      ...existing,
      ...patch,
    })
    this.byId.set(executionId, updated)
    // Update session index if sessionId just learned
    if (patch.internalSessionId !== undefined && existing.internalSessionId === null) {
      this.bySessionId.set(patch.internalSessionId, executionId)
    }
    return updated
  }

  async findById(executionId: string): Promise<AsyncExecutionRecord | undefined> {
    return this.byId.get(executionId)
  }

  async findByIdempotencyKey(key: string): Promise<AsyncExecutionRecord | undefined> {
    const execId = this.byIdemKey.get(key)
    return execId ? this.byId.get(execId) : undefined
  }

  async findBySessionId(sessionId: string): Promise<AsyncExecutionRecord | undefined> {
    const execId = this.bySessionId.get(sessionId)
    return execId ? this.byId.get(execId) : undefined
  }

  async appendEvidence(executionId: string, entries: ReadonlyArray<EvidenceEntry>): Promise<void> {
    const existing = this.byId.get(executionId)
    if (existing === undefined) return
    // Evidence accumulation is allowed even on terminal records (sealed post-completion evidence)
    const updated: AsyncExecutionRecord = Object.freeze({
      ...existing,
      evidenceEntries: Object.freeze([...existing.evidenceEntries, ...entries]),
    })
    this.byId.set(executionId, updated)
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAsyncExecutionRecord(
  request: SubmitExecutionRequest,
  overrideExecutionId?: string,
): AsyncExecutionRecord {
  const executionId = overrideExecutionId ?? randomUUID()
  return Object.freeze({
    executionId,
    idempotencyKey:      request.idempotencyKey ?? null,
    protocolVersion:     EXECUTION_PROTOCOL_VERSION,
    state:               'QUEUED' as PublicExecutionState,
    internalSessionId:   null,
    internalExecutionId: executionId,
    submittedAt:         new Date().toISOString(),
    startedAt:           null,
    completedAt:         null,
    cancelledAt:         null,
    result:              null,
    evidenceEntries:     Object.freeze([]),
    requestSnapshot:     Object.freeze({
      content:        request.content,
      contentType:    request.contentType,
      idempotencyKey: request.idempotencyKey,
    }),
  })
}
