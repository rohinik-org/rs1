/**
 * @rohinik-org/agent-protocol-v1
 *
 * Public protocol package for the Stage 15 agent API.
 * No behavior — pure type and constant exports.
 * Mirrors frozen Stage 15 route shapes from core/runtime/server/src/routes/agents.ts.
 */

// ── Re-export frozen state enums and transition tables ────────────────────────

export const AgentRunState = Object.freeze({
  CREATED:    'CREATED',
  ADMITTED:   'ADMITTED',
  READY:      'READY',
  RUNNING:    'RUNNING',
  WAITING:    'WAITING',
  BLOCKED:    'BLOCKED',
  DELEGATING: 'DELEGATING',
  SUSPENDED:  'SUSPENDED',
  COMPLETED:  'COMPLETED',
  FAILED:     'FAILED',
  CANCELLED:  'CANCELLED',
} as const)
export type AgentRunState = typeof AgentRunState[keyof typeof AgentRunState]

export const AgentRunTransitions: Readonly<Record<AgentRunState, ReadonlyArray<AgentRunState>>> = Object.freeze({
  CREATED:    ['ADMITTED', 'CANCELLED'],
  ADMITTED:   ['READY',    'CANCELLED'],
  READY:      ['RUNNING',  'CANCELLED'],
  RUNNING:    ['WAITING', 'BLOCKED', 'DELEGATING', 'SUSPENDED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING:    ['RUNNING',  'CANCELLED', 'FAILED'],
  BLOCKED:    ['RUNNING',  'CANCELLED', 'FAILED'],
  DELEGATING: ['RUNNING',  'CANCELLED', 'FAILED'],
  SUSPENDED:  ['RUNNING',  'CANCELLED', 'FAILED'],
  COMPLETED:  [],
  FAILED:     [],
  CANCELLED:  [],
} as const)

export const AgentRunTerminalStates: ReadonlySet<AgentRunState> = new Set([
  AgentRunState.COMPLETED,
  AgentRunState.FAILED,
  AgentRunState.CANCELLED,
])

export const DelegatedTaskState = Object.freeze({
  PROPOSED:        'PROPOSED',
  OFFERED:         'OFFERED',
  ACCEPTED:        'ACCEPTED',
  RUNNING:         'RUNNING',
  SUBMITTED:       'SUBMITTED',
  ACCEPTED_RESULT: 'ACCEPTED_RESULT',
  REJECTED_RESULT: 'REJECTED_RESULT',
  CANCELLED:       'CANCELLED',
  FAILED:          'FAILED',
} as const)
export type DelegatedTaskState = typeof DelegatedTaskState[keyof typeof DelegatedTaskState]

export const DelegatedTaskTransitions: Readonly<Record<DelegatedTaskState, ReadonlyArray<DelegatedTaskState>>> = Object.freeze({
  PROPOSED:        ['OFFERED', 'CANCELLED'],
  OFFERED:         ['ACCEPTED', 'REJECTED_RESULT', 'CANCELLED'],
  ACCEPTED:        ['RUNNING', 'CANCELLED'],
  RUNNING:         ['SUBMITTED', 'CANCELLED', 'FAILED'],
  SUBMITTED:       ['ACCEPTED_RESULT', 'REJECTED_RESULT'],
  ACCEPTED_RESULT: [],
  REJECTED_RESULT: [],
  CANCELLED:       [],
  FAILED:          [],
} as const)

export const DelegatedTaskTerminalStates: ReadonlySet<DelegatedTaskState> = new Set([
  DelegatedTaskState.ACCEPTED_RESULT,
  DelegatedTaskState.REJECTED_RESULT,
  DelegatedTaskState.CANCELLED,
  DelegatedTaskState.FAILED,
])

// ── Protocol version ──────────────────────────────────────────────────────────

export const AGENT_PROTOCOL_VERSION = '1.0.0'

// ── Route 1: POST /v1/agent-instances/admit ───────────────────────────────────

export interface AdmitAgentRequest {
  readonly instanceId: string
}

export interface AdmitAgentResponse {
  readonly runId: string
}

// ── Route 2: GET /v1/agent-instances/:instanceId ──────────────────────────────

export interface AgentInstanceResponse {
  readonly instanceId:   string
  readonly definitionId: string
  readonly versionId:    string
  readonly createdAt:    string
}

// ── Route 3: POST /v1/agent-runs ─────────────────────────────────────────────

export interface StartAgentRunRequest {
  readonly runId: string
}

export interface StartAgentRunResponse {
  readonly runId:  string
  readonly state:  AgentRunState
}

// ── Route 4: GET /v1/agent-runs/:runId ───────────────────────────────────────

export interface AgentRunStatusResponse {
  readonly runId:        string
  readonly instanceId:   string
  readonly definitionId: string
  readonly versionId:    string
  readonly state:        AgentRunState
  readonly startedAt:    string
  readonly admittedAt?:  string
}

// ── Route 5: POST /v1/agent-runs/:runId/cancel ───────────────────────────────

export interface CancelAgentRunRequest {
  readonly reason?: string
}

// Response is { ok: true }

// ── Route 6: POST /v1/agent-runs/:runId/delegations ──────────────────────────

export interface DelegateTaskRequest {
  readonly delegateeRunId:      string
  readonly taskId:              string
  readonly description:         string
  readonly delegationId?:       string
  readonly grantedCapabilities: string[]
  readonly grantedActions:      string[]
  readonly grantedDepth:        number
  readonly maxCostUsd:          number
  readonly maxLatencyMs:        number
  readonly maxTokens:           number
}

export interface DelegateTaskResponse {
  readonly certificateId:   string
  readonly fingerprint:     string
  readonly delegatedTaskId: string
  readonly delegationId:    string
}

// ── Route 7: POST /v1/delegations/:id/accept ─────────────────────────────────

export interface AcceptDelegationResponse {
  readonly ok: true
}

// ── Route 8: POST /v1/delegations/:id/run ────────────────────────────────────

export interface RunDelegationResponse {
  readonly executionId:     string
  readonly idempotencyKey:  string | null
  readonly state:           string
  readonly protocolVersion: string
  readonly submittedAt:     string
  readonly idempotent:      boolean
}

// ── Route 9: POST /v1/delegations/:id/results ────────────────────────────────

export interface SubmitDelegationResultRequest {
  readonly result: unknown
}

// ── Route 10: POST /v1/delegations/:id/results/accept ────────────────────────

export interface AcceptDelegationResultResponse {
  readonly ok:            boolean
  readonly parentResumed: boolean
}

// ── Route 11: POST /v1/delegations/:id/results/reject ────────────────────────

export interface RejectDelegationResultRequest {
  readonly reason?: string
}

// ── Route 12: POST /v1/delegations/:id/cancel ────────────────────────────────

export interface CancelDelegationRequest {
  readonly reason?: string
}

export interface CancelDelegationResponse {
  readonly ok:            boolean
  readonly parentResumed: boolean
}

// ── Route 13: GET /v1/agent-runs/:runId/evidence ─────────────────────────────

export interface AgentEvidenceEvent {
  readonly eventId:         string
  readonly kind:            string
  readonly delegationId?:   string
  readonly delegatedTaskId?: string
  readonly certificateId?:  string
  readonly fingerprint?:    string
  readonly fromState?:      string
  readonly toState?:        string
  readonly reason?:         string
  readonly evidenceId?:     string
  readonly payload?:        unknown
  readonly occurredAt:      string
}

export interface AgentRunEvidenceResponse {
  readonly runId:   string
  readonly state:   AgentRunState
  readonly events:  AgentEvidenceEvent[]
}
