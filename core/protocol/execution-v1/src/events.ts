import type { PublicExecutionState } from './index.js'

// ── Event kinds ───────────────────────────────────────────────────────────────

export const PublicEventKind = Object.freeze({
  EXECUTION_ACCEPTED:      'EXECUTION_ACCEPTED',
  EXECUTION_ADMITTED:      'EXECUTION_ADMITTED',
  EXECUTION_STARTED:       'EXECUTION_STARTED',
  STATUS_CHANGED:          'STATUS_CHANGED',
  PROGRESS:                'PROGRESS',
  PARTIAL_OUTPUT:          'PARTIAL_OUTPUT',
  USAGE_OBSERVED:          'USAGE_OBSERVED',
  WAITING:                 'WAITING',
  CANCELLATION_REQUESTED:  'CANCELLATION_REQUESTED',
  EXECUTION_COMPLETED:     'EXECUTION_COMPLETED',
  EXECUTION_FAILED:        'EXECUTION_FAILED',
  EXECUTION_CANCELLED:     'EXECUTION_CANCELLED',
} as const)
export type PublicEventKind = typeof PublicEventKind[keyof typeof PublicEventKind]

export const PUBLIC_TERMINAL_EVENT_KINDS: ReadonlySet<PublicEventKind> = new Set([
  PublicEventKind.EXECUTION_COMPLETED,
  PublicEventKind.EXECUTION_FAILED,
  PublicEventKind.EXECUTION_CANCELLED,
])

// ── Cursor ────────────────────────────────────────────────────────────────────

declare const _cursorBrand: unique symbol
export type ExecutionCursor = string & { readonly [_cursorBrand]: true }

export function encodeExecutionCursor(executionId: string, sequence: number): ExecutionCursor {
  return Buffer.from(`${executionId}:${sequence}`).toString('base64url') as ExecutionCursor
}

export function decodeExecutionCursor(cursor: ExecutionCursor | string): { executionId: string; sequence: number } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf-8')
  const lastColon = decoded.lastIndexOf(':')
  return {
    executionId: decoded.slice(0, lastColon),
    sequence: parseInt(decoded.slice(lastColon + 1), 10),
  }
}

// ── Event payloads ────────────────────────────────────────────────────────────

export interface ExecutionAcceptedPayload {
  readonly submittedAt: string
}

export interface ExecutionAdmittedPayload {
  readonly admittedAt: string
}

export interface ExecutionStartedPayload {
  readonly startedAt: string
}

export interface StatusChangedPayload {
  readonly previousState: PublicExecutionState
  readonly newState: PublicExecutionState
}

export interface ProgressPayload {
  readonly message: string
  readonly percentComplete?: number
}

export interface PartialOutputPayload {
  readonly chunk: string
  readonly chunkIndex: number
}

export interface UsageObservedPayload {
  readonly tokens?: number
  readonly costUsd?: number
}

export interface WaitingPayload {
  readonly reason?: string
}

export interface CancellationRequestedPayload {
  readonly requestedAt: string
  readonly reason?: string
}

export interface ExecutionCompletedPayload {
  readonly completedAt: string
  readonly totalDurationMs: number
}

export interface ExecutionFailedPayload {
  readonly errorCode: string
  readonly message: string
  readonly failedAt: string
}

export interface ExecutionCancelledPayload {
  readonly cancelledAt: string
  readonly reason?: string
}

// ── Envelope ──────────────────────────────────────────────────────────────────

type PayloadMap = {
  EXECUTION_ACCEPTED:     ExecutionAcceptedPayload
  EXECUTION_ADMITTED:     ExecutionAdmittedPayload
  EXECUTION_STARTED:      ExecutionStartedPayload
  STATUS_CHANGED:         StatusChangedPayload
  PROGRESS:               ProgressPayload
  PARTIAL_OUTPUT:         PartialOutputPayload
  USAGE_OBSERVED:         UsageObservedPayload
  WAITING:                WaitingPayload
  CANCELLATION_REQUESTED: CancellationRequestedPayload
  EXECUTION_COMPLETED:    ExecutionCompletedPayload
  EXECUTION_FAILED:       ExecutionFailedPayload
  EXECUTION_CANCELLED:    ExecutionCancelledPayload
}

export interface ExecutionEventEnvelope<K extends PublicEventKind = PublicEventKind> {
  readonly kind: K
  readonly sequence: number
  readonly executionId: string
  readonly occurredAt: string
  readonly cursor: ExecutionCursor
  readonly payload: PayloadMap[K]
}

export type PublicExecutionEvent = {
  [K in PublicEventKind]: ExecutionEventEnvelope<K>
}[PublicEventKind]

// ── Event schemas ─────────────────────────────────────────────────────────────

const BASE = 'https://rohinik.org/schemas/execution-protocol/v1/events'

export const EVENT_SCHEMAS = [
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ExecutionEventEnvelope.json`,
    title: 'ExecutionEventEnvelope',
    type: 'object',
    required: ['kind', 'sequence', 'executionId', 'occurredAt', 'cursor', 'payload'],
    additionalProperties: false,
    properties: {
      kind:        { type: 'string' },
      sequence:    { type: 'integer', minimum: 0 },
      executionId: { type: 'string' },
      occurredAt:  { type: 'string', format: 'date-time' },
      cursor:      { type: 'string' },
      payload:     { type: 'object' },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ExecutionAcceptedPayload.json`,
    title: 'ExecutionAcceptedPayload',
    type: 'object',
    required: ['submittedAt'],
    additionalProperties: false,
    properties: { submittedAt: { type: 'string', format: 'date-time' } },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ExecutionAdmittedPayload.json`,
    title: 'ExecutionAdmittedPayload',
    type: 'object',
    required: ['admittedAt'],
    additionalProperties: false,
    properties: { admittedAt: { type: 'string', format: 'date-time' } },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ExecutionStartedPayload.json`,
    title: 'ExecutionStartedPayload',
    type: 'object',
    required: ['startedAt'],
    additionalProperties: false,
    properties: { startedAt: { type: 'string', format: 'date-time' } },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/StatusChangedPayload.json`,
    title: 'StatusChangedPayload',
    type: 'object',
    required: ['previousState', 'newState'],
    additionalProperties: false,
    properties: {
      previousState: { type: 'string' },
      newState:      { type: 'string' },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ProgressPayload.json`,
    title: 'ProgressPayload',
    type: 'object',
    required: ['message'],
    additionalProperties: false,
    properties: {
      message:         { type: 'string' },
      percentComplete: { type: 'number', minimum: 0, maximum: 100 },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/PartialOutputPayload.json`,
    title: 'PartialOutputPayload',
    type: 'object',
    required: ['chunk', 'chunkIndex'],
    additionalProperties: false,
    properties: {
      chunk:      { type: 'string' },
      chunkIndex: { type: 'integer', minimum: 0 },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/UsageObservedPayload.json`,
    title: 'UsageObservedPayload',
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: {
      tokens:  { type: 'integer', minimum: 0 },
      costUsd: { type: 'number', minimum: 0 },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/WaitingPayload.json`,
    title: 'WaitingPayload',
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: { reason: { type: 'string' } },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/CancellationRequestedPayload.json`,
    title: 'CancellationRequestedPayload',
    type: 'object',
    required: ['requestedAt'],
    additionalProperties: false,
    properties: {
      requestedAt: { type: 'string', format: 'date-time' },
      reason:      { type: 'string' },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ExecutionCompletedPayload.json`,
    title: 'ExecutionCompletedPayload',
    type: 'object',
    required: ['completedAt', 'totalDurationMs'],
    additionalProperties: false,
    properties: {
      completedAt:     { type: 'string', format: 'date-time' },
      totalDurationMs: { type: 'number', minimum: 0 },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ExecutionFailedPayload.json`,
    title: 'ExecutionFailedPayload',
    type: 'object',
    required: ['errorCode', 'message', 'failedAt'],
    additionalProperties: false,
    properties: {
      errorCode: { type: 'string' },
      message:   { type: 'string' },
      failedAt:  { type: 'string', format: 'date-time' },
    },
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${BASE}/ExecutionCancelledPayload.json`,
    title: 'ExecutionCancelledPayload',
    type: 'object',
    required: ['cancelledAt'],
    additionalProperties: false,
    properties: {
      cancelledAt: { type: 'string', format: 'date-time' },
      reason:      { type: 'string' },
    },
  },
] as const
