import type {
  WorkflowDescriptor,
  CapabilityDescriptorIR,
  Observation,
  MemoryArtifact,
  ExecutionRecord,
  ProviderEntry,
  ExecutionOutcome,
} from './index.js'

export type ScenarioType = 'STATIC' | 'REPLAY' | 'LIVE'

export type ScenarioTag =
  | 'PLANNING' | 'EXECUTION' | 'MEMORY' | 'OBSERVATION'
  | 'ACQUISITION' | 'ORCHESTRATION' | 'AUTONOMY'
  | 'FULL_PIPELINE' | 'FAILURE' | 'RECOVERY' | 'PERFORMANCE' | 'SECURITY'

export type ValidationStatus = 'PASSED' | 'FAILED' | 'WARNING'

export interface RuntimeFixture {
  readonly graphRevision: number
  readonly workflowDescriptors: readonly WorkflowDescriptor[]
  readonly capabilityDescriptors: readonly CapabilityDescriptorIR[]
  readonly observations: readonly Observation[]
  readonly memory: readonly MemoryArtifact[]
  readonly corpus: readonly ExecutionRecord[]
  readonly providers: readonly ProviderEntry[]
}

export interface ScenarioExpectation {
  readonly capabilitiesInstalled?: readonly string[]
  readonly workflowRebuilt?: boolean
  readonly executionOutcome?: ExecutionOutcome
  readonly episodeRecorded?: boolean
  readonly triggerEmitted?: boolean
  readonly errorContains?: string
  readonly maxLatencyMs?: number
}

export interface RuntimeScenario {
  readonly kind: 'RuntimeScenario'
  readonly schemaVersion: '1.0'
  readonly scenarioId: string
  readonly name: string
  readonly tags: readonly ScenarioTag[]
  readonly scenarioType: ScenarioType
  readonly initialState: RuntimeFixture
  readonly expectedOutcome: ScenarioExpectation
  readonly timeoutMs?: number
  readonly createdAt: string
}

export interface RuntimeBenchmark {
  readonly baselineMs: number
  readonly executionMs: number
  readonly memoryMb: number
  readonly cpuMs: number
  readonly providerCalls: number
  readonly networkRequests: number
  readonly tokenCount: number
}

export interface ValidationFinding {
  readonly findingId: string
  readonly severity: 'ERROR' | 'WARNING' | 'INFO'
  readonly message: string
  readonly component?: string
}

export interface RuntimeValidationReport {
  readonly kind: 'RuntimeValidationReport'
  readonly schemaVersion: '1.0'
  readonly reportId: string
  readonly scenarioId: string
  readonly startedAt: string
  readonly completedAt: string
  readonly status: ValidationStatus
  readonly benchmark: RuntimeBenchmark
  readonly findings: readonly ValidationFinding[]
}
