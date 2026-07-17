export type NodeStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN'

export interface NodeDescriptor {
  readonly nodeId: string
  readonly version: string
  readonly hostname: string
  readonly region: string
  readonly capabilityProfileId: string
  readonly status: NodeStatus
  readonly joinedAt: string
}

export interface ClusterDescriptor {
  readonly clusterId: string
  readonly members: readonly string[]
  readonly leaderPolicy: 'NONE' | 'ROTATING' | 'ELECTED'
  readonly createdAt: string
}

// authoritative routing basis for node selection
export interface NodeCapabilityProfile {
  readonly profileId: string
  readonly cpuCores: number
  readonly memoryGb: number
  readonly gpuAvailable: boolean
  readonly installedCapabilities: readonly string[]
  readonly installedProviders: readonly string[]
  readonly networkBandwidthMbps: number
  readonly latencyProfileMs: number
  readonly costWeight: number
}

// produced by DistributedScheduler — routes one workflow fragment to one node
export interface DistributedTask {
  readonly taskId: string
  readonly workflowPlanId: string
  readonly targetNodeId: string
  readonly workflowFragment: unknown
  readonly routingDecision: string
  readonly scheduledAt: string
}

// immutable intent artifact — what is being requested
export interface RemoteInvocation {
  readonly invocationId: string
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly distributedTaskId: string
  readonly workflowPlanId: string
  readonly dispatchedAt: string
  readonly policyId: string
}

// immutable outcome artifact — what actually happened
export interface RemoteInvocationResult {
  readonly invocationId: string
  readonly executionId: string
  readonly targetNodeId: string
  readonly latencyMs: number
  readonly transportLatencyMs: number
  readonly executionLatencyMs: number
  readonly outcome: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED'
  readonly completedAt: string
}

export interface DistributedExecutionRecord {
  readonly recordId: string
  readonly clusterId: string
  readonly participatingNodeIds: readonly string[]
  readonly invocationId: string
  readonly totalDurationMs: number
  readonly failedNodeIds: readonly string[]
  readonly completedAt: string
}

export interface ReplicationRecord {
  readonly recordId: string
  readonly artifactType: 'MEMORY' | 'REFLECTION' | 'OBSERVATION' | 'INFERENCE_CHAIN' | 'REASONING_REPORT'
  readonly artifactId: string
  readonly sourceNodeId: string
  readonly replicatedToNodeIds: readonly string[]
  readonly replicatedAt: string
}

export type ClusterMemoryScope = 'CLUSTER_GLOBAL' | 'NODE_GLOBAL' | 'PROJECT' | 'TASK' | 'PRIVATE' | 'EPHEMERAL'

export interface ClusterPolicy {
  readonly policyId: string
  readonly allowRemoteExecution: boolean
  readonly allowReplication: boolean
  readonly preferredRegions: readonly string[]
  readonly maxLatencyMs: number
  readonly requireEncryption: boolean
  readonly requireAuthentication: boolean
  readonly replicationFactor: number
}

export const DEFAULT_CLUSTER_POLICY: ClusterPolicy = {
  policyId: 'default',
  allowRemoteExecution: true,
  allowReplication: true,
  preferredRegions: [],
  maxLatencyMs: 5_000,
  requireEncryption: false,
  requireAuthentication: false,
  replicationFactor: 1,
}

export interface NodeHealth {
  readonly nodeId: string
  readonly cpuPercent: number
  readonly memoryPercent: number
  readonly diskPercent: number
  readonly networkLatencyMs: number
  readonly providerHealth: Readonly<Record<string, boolean>>
  readonly availability: boolean
  readonly sampledAt: string
}

export type ClusterEventType =
  | 'NODE_JOINED' | 'NODE_LEFT' | 'REMOTE_INVOCATION_CREATED' | 'REMOTE_DISPATCHED'
  | 'REMOTE_ACCEPTED' | 'REMOTE_COMPLETED' | 'REMOTE_FAILED' | 'REPLICATION_STARTED'
  | 'REPLICATION_COMPLETED' | 'FAILOVER' | 'PARTITION' | 'RECOVERY' | 'POLICY_REJECTED'

// append-only distributed history entry
export interface ClusterJournalEntry {
  readonly entryId: string
  readonly clusterId: string
  readonly eventType: ClusterEventType
  readonly nodeId?: string
  readonly payload: unknown
  readonly timestamp: string
}

export interface NodeQuery {
  readonly region?: string
  readonly status?: NodeStatus
  readonly minCapability?: string
  readonly limit?: number
}

export interface ClusterQuery {
  readonly clusterId?: string
  readonly status?: 'ACTIVE' | 'DEGRADED' | 'OFFLINE'
  readonly limit?: number
}
