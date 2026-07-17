import type { RuntimeHealth } from './daemon-ir-6h.js'
import type { ExecutionResult } from './execution-result-6a.js'
import type { MemoryArtifact } from './memory-artifact.js'
import type { ReflectionReport } from './reflection-ir-6g.js'
import type { InferenceChain } from './reasoning-ir-7a.js'
import type { Observation } from './observation-ir-6e.js'
import type { ClusterDescriptor } from './distributed-ir-7c.js'

// ── Protocol version ──────────────────────────────────────────────────────
export const CONSOLE_PROTOCOL_VERSION = '8.1'

export type ConsoleProtocolVersion = string

// ConsoleRuntimeVersion: alias for protocol/runtime version strings.
// Today: string. Future: { major, minor, patch } without ripple if alias is used everywhere.
export type ConsoleRuntimeVersion = string

// ── Feature identifiers ───────────────────────────────────────────────────
export type ConsoleFeature =
  | 'LIVE_EVENTS'
  | 'REPLAY'
  | 'SNAPSHOT'
  | 'GRAPH'
  | 'TIMELINE'
  | 'DASHBOARD'

// ── Protocol handshake ────────────────────────────────────────────────────
export interface ConsoleHandshakeRequest {
  readonly minimumSupportedVersion: ConsoleRuntimeVersion
  readonly maximumSupportedVersion: ConsoleRuntimeVersion
  readonly clientId: string
}

export type ConsoleHandshakeResult = 'ACCEPTED' | 'INCOMPATIBLE'

export interface ConsoleHandshakeResponse {
  readonly result: ConsoleHandshakeResult
  readonly negotiatedVersion: ConsoleRuntimeVersion
  readonly daemonMinimumVersion?: ConsoleRuntimeVersion
  readonly daemonVersion?: ConsoleRuntimeVersion
}

// ── Connection ────────────────────────────────────────────────────────────
export type ConsoleConnectionPhase =
  | 'Disconnected'
  | 'Connecting'
  | 'Negotiating'
  | 'Authenticating'    // reserved; no-op Stage 8C; required for Enterprise Stage 8E
  | 'Connected'
  | 'Degraded'
  | 'Reconnecting'
  | 'Offline'

// ── Runtime Events ────────────────────────────────────────────────────────
export type ConsoleEventType =
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

export interface ConsoleEvent<T = unknown> {
  readonly eventId: string
  readonly sequenceNumber: number
  readonly type: ConsoleEventType
  readonly timestamp: string
  readonly payload: T
}

export type ConsoleEventHandler<T = unknown> = (event: ConsoleEvent<T>) => void | Promise<void>

// ── Replay options ────────────────────────────────────────────────────────
export interface ConsoleReplayOptions {
  readonly replaySince?: string
  readonly fromEventId?: string
  readonly fromSequenceNumber?: number
}

// ── Console Commands ──────────────────────────────────────────────────────
// ConsoleCommandSource: extensible string type; closed union cannot accommodate
// extensions, voice, automation, assistant, remote, toolbar — future sources will grow.
export type ConsoleCommandSource = string
// ponytail: narrow to union once the full source taxonomy is stable (Stage 8D+)

// ConsoleRuntimeVersion: alias for protocol/runtime version strings.
// Today: string. Future: { major, minor, patch } without ripple if alias is used everywhere.
export type ConsoleCommandType =
  | 'OPEN_EXECUTION'
  | 'COLLAPSE_GRAPH'
  | 'EXPAND_GRAPH'
  | 'PIN_TIMELINE'
  | 'EXPORT_GRAPH'
  | 'CREATE_SNAPSHOT'

export interface ConsoleCommand {
  readonly commandId: string        // uuid — enables replay, undo, macros, automation
  readonly type: ConsoleCommandType
  readonly timestamp: string
  readonly source: ConsoleCommandSource
  readonly correlationId?: string   // groups related commands from voice/assistant/macro/automation flows
  readonly workspaceId?: string
  readonly payload?: unknown
}

export interface ConsoleCommandResult {
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
  readonly revision: number         // increments on mutation; used in layout cache key
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

// ── Runtime State Snapshot ────────────────────────────────────────────────
export interface RuntimeStateSnapshot {
  readonly snapshotId: string
  readonly protocolVersion: ConsoleProtocolVersion
  readonly capturedAt: string
  readonly daemon: RuntimeHealth
  readonly activeExecutions: readonly ExecutionResult[]
  readonly recentMemory: readonly MemoryArtifact[]
  readonly recentReflections: readonly ReflectionReport[]
  readonly recentReasoning: readonly InferenceChain[]
  readonly recentObservations: readonly Observation[]
  readonly clusterState?: ClusterDescriptor
}

// ── Projection interface ──────────────────────────────────────────────────
// Projection<TState>: projection-agnostic contract. ProjectionRuntime is a runner,
// not a hardcoded list. Analogous to GraphLayoutAlgorithm in console-sdk.
// Stage 8D marketplace projections register without editing ProjectionRuntime.
export interface Projection<TState> {
  readonly id: string
  readonly version: string
  readonly initialState: TState
  // pure function (CONSOLE-015): no IO, no timers, no storage, no network
  reduce(previous: TState, event: ConsoleEvent): TState
}
