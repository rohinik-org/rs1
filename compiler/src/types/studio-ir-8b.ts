import type { RuntimeHealth } from './daemon-ir-6h.js'
import type { ExecutionResult } from './execution-result-6a.js'
import type { MemoryArtifact } from './memory-artifact.js'
import type { ReflectionReport } from './reflection-ir-6g.js'
import type { InferenceChain } from './reasoning-ir-7a.js'
import type { Observation } from './observation-ir-6e.js'
import type { ClusterDescriptor } from './distributed-ir-7c.js'

// ── Protocol version ──────────────────────────────────────────────────────
export const STUDIO_PROTOCOL_VERSION = '8.0'

export type StudioProtocolVersion = string

// ── Feature identifiers ───────────────────────────────────────────────────
export type StudioFeature =
  | 'LIVE_EVENTS'
  | 'REPLAY'
  | 'SNAPSHOT'
  | 'GRAPH'
  | 'TIMELINE'
  | 'DASHBOARD'

// ── Protocol handshake ────────────────────────────────────────────────────
export interface StudioHandshake {
  readonly protocolVersion: StudioProtocolVersion
  readonly sdkVersion: string
  readonly supportedFeatures: readonly StudioFeature[]
}

export type StudioHandshakeResult = 'ACCEPTED' | 'UPGRADE_REQUIRED' | 'INCOMPATIBLE'

export interface StudioHandshakeResponse {
  readonly result: StudioHandshakeResult
  readonly serverProtocolVersion: StudioProtocolVersion
  readonly minSupportedVersion?: StudioProtocolVersion
  readonly message?: string
}

// ── Connection ────────────────────────────────────────────────────────────
export type StudioConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'FAILED'

export interface StudioConnectionState {
  readonly status: StudioConnectionStatus
  readonly connectedAt?: string
  readonly lastPingAt?: string
  readonly handshake?: StudioHandshakeResponse
}

// ── Runtime Events ────────────────────────────────────────────────────────
export type StudioEventType =
  | 'ExecutionStarted'
  | 'ExecutionCompleted'
  | 'ExecutionFailed'
  | 'MemoryCreated'
  | 'ObservationCreated'
  | 'ReflectionCompleted'
  | 'ReasoningCompleted'
  | 'LoopStarted'
  | 'LoopCycleCompleted'
  | 'LoopStopped'
  | 'ClusterNodeJoined'
  | 'ClusterNodeLeft'
  | 'CapabilityInstalled'
  | 'ProviderChanged'
  | 'DaemonStarted'
  | 'DaemonStopped'

export interface StudioEvent<T = unknown> {
  readonly eventId: string
  readonly sequenceNumber: number
  readonly type: StudioEventType
  readonly timestamp: string
  readonly payload: T
}

export type StudioEventHandler<T = unknown> = (event: StudioEvent<T>) => void | Promise<void>

// ── Replay options ────────────────────────────────────────────────────────
export interface StudioReplayOptions {
  readonly replaySince?: string
  readonly fromEventId?: string
  readonly fromSequenceNumber?: number
}

// ── Studio Commands ───────────────────────────────────────────────────────
export type StudioCommandType =
  | 'OPEN_EXECUTION'
  | 'COLLAPSE_GRAPH'
  | 'EXPAND_GRAPH'
  | 'PIN_TIMELINE'
  | 'EXPORT_GRAPH'
  | 'CREATE_SNAPSHOT'

export interface StudioCommand {
  readonly commandId: string
  readonly type: StudioCommandType
  readonly payload?: unknown
}

export interface StudioCommandResult {
  readonly commandId: string
  readonly success: boolean
  readonly payload?: unknown
  readonly error?: string
}

// ── Timeline ──────────────────────────────────────────────────────────────
export type TimelineEntryKind =
  | 'EXECUTION' | 'OBSERVATION' | 'REFLECTION' | 'REASONING'
  | 'ACQUISITION' | 'CLUSTER' | 'PROVIDER' | 'DAEMON'

export interface TimelineEntry {
  readonly entryId: string
  readonly kind: TimelineEntryKind
  readonly summary: string
  readonly timestamp: string
  readonly durationMs?: number
  readonly status: string
  readonly referenceId: string
}

// ── Graph API ─────────────────────────────────────────────────────────────
export type GraphNodeKind =
  | 'GOAL' | 'PLAN' | 'EXECUTION' | 'STEP'
  | 'MEMORY' | 'REFLECTION' | 'REASONING' | 'AGENT' | 'CLUSTER_NODE'

export interface GraphNode {
  readonly nodeId: string
  readonly kind: GraphNodeKind
  readonly label: string
  readonly status: string
  readonly referenceId: string
  readonly metadata: Record<string, unknown>
}

export interface GraphEdge {
  readonly edgeId: string
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly label?: string
}

export interface RuntimeGraph {
  readonly graphId: string
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  readonly generatedAt: string
}

export interface GraphBuilder<T> {
  build(model: T): RuntimeGraph
}

// ── View Models ───────────────────────────────────────────────────────────
export interface RuntimeDashboard {
  readonly sessionId: string
  readonly status: string
  readonly uptimeMs: number
  readonly cpuPercent: number
  readonly memoryBytes: number
  readonly activeExecutions: number
  readonly totalExecutions: number
  readonly installedCapabilities: number
  readonly activeProviders: number
  readonly clusterNodes: number
  readonly generatedAt: string
}

export interface ProviderDashboard {
  readonly providerId: string
  readonly name: string
  readonly available: boolean
  readonly totalRequests: number
  readonly failureCount: number
  readonly avgLatencyMs: number
  readonly lastUsedAt?: string
  readonly generatedAt: string
}

export interface MemoryDashboard {
  readonly totalArtifacts: number
  readonly episodicCount: number
  readonly workingCount: number
  readonly semanticCount: number
  readonly proceduralCount: number
  readonly generatedAt: string
}

export interface ClusterDashboard {
  readonly clusterId: string
  readonly nodeCount: number
  readonly onlineNodes: number
  readonly totalInvocations: number
  readonly failedInvocations: number
  readonly generatedAt: string
}

// ── Snapshot ──────────────────────────────────────────────────────────────
export interface RuntimeSnapshot {
  readonly snapshotId: string
  readonly protocolVersion: StudioProtocolVersion
  readonly capturedAt: string
  readonly daemon: RuntimeHealth
  readonly activeExecutions: readonly ExecutionResult[]
  readonly recentMemory: readonly MemoryArtifact[]
  readonly recentReflections: readonly ReflectionReport[]
  readonly recentReasoning: readonly InferenceChain[]
  readonly recentObservations: readonly Observation[]
  readonly clusterState?: ClusterDescriptor
}
