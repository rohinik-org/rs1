// Branded string IDs — JSON-safe, structurally distinct
declare const _agentId: unique symbol
declare const _agentDefinitionId: unique symbol
declare const _agentVersionId: unique symbol
declare const _agentInstanceId: unique symbol
declare const _agentRunId: unique symbol
declare const _agentTaskId: unique symbol
declare const _agentPlanId: unique symbol
declare const _delegationId: unique symbol
declare const _agentMessageId: unique symbol
declare const _agentTeamId: unique symbol
declare const _agentCheckpointId: unique symbol
declare const _agentEvidenceId: unique symbol
declare const _agentOutcomeId: unique symbol
declare const _supersessionId: unique symbol

export type AgentId           = string & { readonly [_agentId]: never }
export type AgentDefinitionId = string & { readonly [_agentDefinitionId]: never }
export type AgentVersionId    = string & { readonly [_agentVersionId]: never }
export type AgentInstanceId   = string & { readonly [_agentInstanceId]: never }
export type AgentRunId        = string & { readonly [_agentRunId]: never }
export type AgentTaskId       = string & { readonly [_agentTaskId]: never }
export type AgentPlanId       = string & { readonly [_agentPlanId]: never }
export type DelegationId      = string & { readonly [_delegationId]: never }
export type AgentMessageId    = string & { readonly [_agentMessageId]: never }
export type AgentTeamId       = string & { readonly [_agentTeamId]: never }
export type AgentCheckpointId = string & { readonly [_agentCheckpointId]: never }
export type AgentEvidenceId   = string & { readonly [_agentEvidenceId]: never }
export type AgentOutcomeId    = string & { readonly [_agentOutcomeId]: never }
export type SupersessionId    = string & { readonly [_supersessionId]: never }

export const AgentRunState = Object.freeze({
  CREATED:   'CREATED',
  ADMITTED:  'ADMITTED',
  RUNNING:   'RUNNING',
  WAITING:   'WAITING',
  SUSPENDED: 'SUSPENDED',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
  CANCELLED: 'CANCELLED',
} as const)
export type AgentRunState = typeof AgentRunState[keyof typeof AgentRunState]

export const AgentTaskState = Object.freeze({
  PENDING:   'PENDING',
  ASSIGNED:  'ASSIGNED',
  RUNNING:   'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
  CANCELLED: 'CANCELLED',
} as const)
export type AgentTaskState = typeof AgentTaskState[keyof typeof AgentTaskState]

export const AgentPlanState = Object.freeze({
  DRAFT:      'DRAFT',
  ACTIVE:     'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  COMPLETED:  'COMPLETED',
  ABANDONED:  'ABANDONED',
} as const)
export type AgentPlanState = typeof AgentPlanState[keyof typeof AgentPlanState]

export const DelegationState = Object.freeze({
  PENDING:   'PENDING',
  ACCEPTED:  'ACCEPTED',
  ACTIVE:    'ACTIVE',
  COMPLETED: 'COMPLETED',
  REVOKED:   'REVOKED',
  REJECTED:  'REJECTED',
} as const)
export type DelegationState = typeof DelegationState[keyof typeof DelegationState]

export const AgentOutcomeStatus = Object.freeze({
  SUCCESS:   'SUCCESS',
  PARTIAL:   'PARTIAL',
  FAILURE:   'FAILURE',
  CANCELLED: 'CANCELLED',
} as const)
export type AgentOutcomeStatus = typeof AgentOutcomeStatus[keyof typeof AgentOutcomeStatus]

// Core identity records — all readonly, all JSON-safe

export interface AgentRun {
  readonly runId:        AgentRunId
  readonly instanceId:   AgentInstanceId
  readonly definitionId: AgentDefinitionId
  readonly versionId:    AgentVersionId
  readonly state:        AgentRunState
  readonly startedAt:    Date
  readonly admittedAt?:  Date
  readonly completedAt?: Date
  readonly cancelledAt?: Date
  readonly failedAt?:    Date
}

export interface AgentTask {
  readonly taskId:       AgentTaskId
  readonly runId:        AgentRunId
  readonly planId:       AgentPlanId
  readonly state:        AgentTaskState
  readonly description:  string
  readonly createdAt:    Date
  readonly assignedAt?:  Date
  readonly completedAt?: Date
}

export interface AgentPlan {
  readonly planId:      AgentPlanId
  readonly runId:       AgentRunId
  readonly state:       AgentPlanState
  readonly tasks:       ReadonlyArray<AgentTaskId>
  readonly createdAt:   Date
  readonly activatedAt?: Date
  readonly completedAt?: Date
}

export interface AgentDelegation {
  readonly delegationId:   DelegationId
  readonly delegatorRunId: AgentRunId
  readonly delegateeRunId: AgentRunId
  readonly state:          DelegationState
  readonly taskId:         AgentTaskId
  readonly createdAt:      Date
  readonly acceptedAt?:    Date
  readonly completedAt?:   Date
  readonly revokedAt?:     Date
}

export interface AgentMessage {
  readonly messageId:  AgentMessageId
  readonly fromRunId:  AgentRunId
  readonly toRunId:    AgentRunId
  readonly taskId?:    AgentTaskId
  readonly content:    unknown   // JSON-safe payload; schema is caller's concern
  readonly sentAt:     Date
}

export interface AgentTeam {
  readonly teamId:   AgentTeamId
  readonly members:  ReadonlyArray<AgentRunId>
  readonly leaderId: AgentRunId
  readonly createdAt: Date
}

export interface AgentCheckpoint {
  readonly checkpointId: AgentCheckpointId
  readonly runId:        AgentRunId
  readonly planId:       AgentPlanId
  readonly snapshot:     unknown  // JSON-safe; opaque to agent-ir
  readonly recordedAt:   Date
}

export type AgentEvidenceKind = 'observation' | 'action' | 'decision' | 'error' | 'external'

export interface AgentEvidence {
  readonly evidenceId: AgentEvidenceId
  readonly runId:      AgentRunId
  readonly taskId?:    AgentTaskId
  readonly kind:       AgentEvidenceKind
  readonly payload:    unknown  // JSON-safe
  readonly recordedAt: Date
}

export interface AgentOutcome {
  readonly outcomeId:  AgentOutcomeId
  readonly runId:      AgentRunId
  readonly status:     AgentOutcomeStatus
  readonly summary:    string
  readonly evidence:   ReadonlyArray<AgentEvidenceId>
  readonly completedAt: Date
}

// LAW-144: supersession — old plan must be traceable to new plan
export interface AgentSupersession {
  readonly supersessionId: SupersessionId
  readonly oldPlanId:      AgentPlanId
  readonly newPlanId:      AgentPlanId
  readonly reason:         string
  readonly supersededAt:   Date
}
