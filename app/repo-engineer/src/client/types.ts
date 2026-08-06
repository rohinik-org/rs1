export interface ExecuteRequest {
  requestId?: string
  content: string
  contentType: string
  intentHint?: string
  context?: Record<string, unknown>
  constraints?: { allowReasoning?: boolean }
}

export interface ExecuteResponse {
  requestId: string
  output: unknown
  skillId: string
  tierId?: string
  reasoningInvoked: boolean
  confidence: number | null
  executionTimeMs: number
  resourceCost: unknown
  explanation: string | null
}

export interface SimulateResponse {
  requestId: string
  wouldRoute: boolean
  selectedTier?: string
  selectedSkill?: string
  confidence: number
  estimatedCost: unknown
  estimatedLatencyMs: number
  reasoningWouldBeInvoked: boolean
  candidatesConsidered: Array<{ skillId: string; tierId: string; score: number }>
}

export interface HealthCheck {
  subsystem: string
  status: string
  data?: unknown
}

export interface HealthResponse {
  requestId: string
  status: string
  runtimeId: string
  state: string
  uptimeMs: number
  checks: HealthCheck[]
  timestamp: number
}

export interface DecisionResponse {
  requestId: string
  trace: unknown
}

export interface ExperienceResponse {
  requestId: string
  experience: unknown
}

// ── Agent runtime types ──────────────────────────────────────────────────────

export interface AgentAdmitRequest {
  instanceId: string
}

export interface AgentAdmitResponse {
  runId: string
}

export interface AgentStartResponse {
  runId: string
  state: string
}

export interface AgentRunResponse {
  runId: string
  instanceId: string
  versionId: string
  state: string
  startedAt?: string
  admittedAt?: string
}

export interface DelegateRequest {
  delegateeRunId:      string
  taskId:              string
  description:         string
  delegationId?:       string
  grantedCapabilities: string[]
  grantedActions:      string[]
  grantedDepth:        number
  maxCostUsd:          number
  maxLatencyMs:        number
  maxTokens:           number
}

export interface DelegateResponse {
  certificateId:   string
  fingerprint:     string
  delegatedTaskId: string
  delegationId:    string
}

export interface DelegationRunResponse {
  ok:                 boolean
  executionId:        string
  output:             unknown
  delegatedTaskState: string
}

export interface DelegationAcceptResultResponse {
  ok:            boolean
  parentResumed: boolean
}

export interface AgentEvent {
  eventId:          string
  kind:             string
  delegationId?:    string
  delegatedTaskId?: string
  certificateId?:   string
  fromState?:       string
  toState?:         string
  reason?:          string
  evidenceId?:      string
  payload?:         unknown
  occurredAt:       string
}

export interface AgentEvidenceResponse {
  runId:  string
  state:  string
  events: AgentEvent[]
}

export interface ApiErrorBody {
  code: string
  message: string
}

export class RohinikError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'RohinikError'
    this.code = code
    this.status = status
  }
}
