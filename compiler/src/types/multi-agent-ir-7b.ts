// role is topology/routing hint only; capabilityProfileId is authoritative
export type AgentRole =
  | 'PLANNER' | 'EXECUTOR' | 'RESEARCHER' | 'REVIEWER' | 'REFLECTOR' | 'COORDINATOR'

export interface AgentDescriptor {
  readonly agentId: string
  readonly name: string
  readonly role: AgentRole
  readonly capabilityProfileId: string
  readonly version: string
}

// authoritative routing basis — capability matching uses this, not role
export interface AgentCapabilityProfile {
  readonly profileId: string
  readonly capabilities: readonly string[]
  readonly confidence: Readonly<Record<string, number>>
  readonly preferredDomains: readonly string[]
  readonly forbiddenDomains: readonly string[]
  readonly maxConcurrency: number
  readonly costWeight: number
  readonly latencyWeight: number
}

export interface AgentGoal {
  readonly goalId: string
  readonly description: string
  readonly constraints: readonly string[]
  readonly priority: number
}

export interface AgentTask {
  readonly taskId: string
  readonly goalId: string
  readonly assignedAgentId: string
  readonly workflowPlanId?: string
}

// immutable selection audit — why agent X chosen over Y
export interface AgentSelectionDecision {
  readonly decisionId: string
  readonly selectedAgentId: string
  readonly rejectedAgentIds: readonly string[]
  readonly reasoning: readonly string[]
  readonly scores: Readonly<Record<string, number>>
  readonly selectedAt: string
}

export interface AgentResult {
  readonly resultId: string
  readonly agentId: string
  readonly taskId: string
  readonly inferenceChainId: string
  readonly workflowPlanId?: string
  readonly executionResultId?: string
  readonly completedAt: string
}

// no direct agent-to-agent calls; everything through AgentCommunicationBus
export interface AgentMessage {
  readonly messageId: string
  readonly senderAgentId: string
  readonly recipientAgentId: string
  readonly payload: unknown
  readonly sentAt: string
}

export type ConsensusStrategy = 'UNANIMOUS' | 'MAJORITY' | 'WEIGHTED' | 'SUPERVISOR'

export interface ConsensusDecision {
  readonly decisionId: string
  readonly strategy: ConsensusStrategy
  readonly selectedResultId: string
  readonly participatingAgentIds: readonly string[]
  readonly votingRecord: Readonly<Record<string, string>>
  readonly decidedAt: string
}

// GLOBAL: ∞  PROJECT: project lifetime  TASK: task lifetime  PRIVATE: agent policy  EPHEMERAL: task only
export type MemoryScope = 'GLOBAL' | 'PROJECT' | 'TASK' | 'PRIVATE' | 'EPHEMERAL'

// EPHEMERAL memory SHALL NOT outlive the AgentTask that created it
export interface MemoryPromotionDecision {
  readonly decisionId: string
  readonly taskId: string
  readonly promotedMemoryIds: readonly string[]
  readonly discardedMemoryIds: readonly string[]
  readonly promotedTo: 'TASK' | 'PROJECT' | 'GLOBAL'
  readonly rationale: readonly string[]
}

export type AgentTopology = 'STAR' | 'TREE' | 'PIPELINE' | 'MESH'

export interface AgentPolicy {
  readonly maxDelegationDepth: number
  readonly maxParallelAgents: number
  readonly maxMessages: number
  readonly allowNestedDelegation: boolean
  readonly memoryScope: MemoryScope
  readonly executionBudgetMs: number
  readonly consensusStrategy: ConsensusStrategy
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxDelegationDepth: 3,
  maxParallelAgents: 5,
  maxMessages: 100,
  allowNestedDelegation: false,
  memoryScope: 'TASK',
  executionBudgetMs: 30_000,
  consensusStrategy: 'MAJORITY',
}

export interface AgentSession {
  readonly sessionId: string
  readonly goalId: string
  readonly topology: AgentTopology
  readonly participatingAgentIds: readonly string[]
  readonly tasks: readonly AgentTask[]
  readonly results: readonly AgentResult[]
  readonly selectionDecisions: readonly AgentSelectionDecision[]
  readonly consensusDecision: ConsensusDecision
  readonly promotionDecisions: readonly MemoryPromotionDecision[]
  readonly status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  readonly startedAt: string
  readonly completedAt: string
}

export type AgentEventType =
  | 'GOAL_RECEIVED' | 'TASK_DELEGATED' | 'TASK_STARTED' | 'TASK_COMPLETED'
  | 'MESSAGE_SENT' | 'MESSAGE_RECEIVED' | 'CONSENSUS_REACHED' | 'SESSION_COMPLETED'
  | 'AGENT_FAILED' | 'POLICY_REJECTED'

export interface AgentJournalEntry {
  readonly entryId: string
  readonly sessionId: string
  readonly eventType: AgentEventType
  readonly agentId?: string
  readonly payload: unknown
  readonly timestamp: string
}

export interface AgentQuery {
  readonly role?: AgentRole
  readonly topology?: AgentTopology
  readonly status?: AgentSession['status']
  readonly limit?: number
}

export interface CompositeInference {
  readonly compositeId: string
  readonly sessionId: string
  readonly mergedInferenceChainIds: readonly string[]
  readonly mergedAt: string
}
