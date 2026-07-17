import type {
  WorkflowPlan, ExecutionResult,
  MemoryArtifact, MemoryQuery, MemoryResult,
  ReasoningReport, ReflectionReport,
  ObservationQuery,
  RemoteInvocation, RemoteInvocationResult,
  CertificationScenario, CertificationReport,
  NodeDescriptor, NodeCapabilityProfile,
} from '@rohinik-org/compiler'
import type { EvidenceInput } from '@rohinik-org/reasoning'
import type { ObservationResult } from '@rohinik-org/observer'
import type { ExecutionHandle } from '@rohinik-org/executor'
import type { RunnerMap } from '@rohinik-org/runtime-certification'

export interface PlanningFacade {
  plan(goal: string): Promise<WorkflowPlan>
}

export interface ExecutionFacade {
  execute(plan: WorkflowPlan): Promise<ExecutionHandle>
  getResult(executionId: string): Promise<ExecutionResult | null>
}

export interface MemoryFacade {
  record(result: ExecutionResult): Promise<MemoryArtifact[]>
  recall(query: MemoryQuery): Promise<MemoryResult[]>
}

export interface ReasoningFacade {
  reason(input: EvidenceInput): Promise<ReasoningReport>
}

export interface ReflectionFacade {
  reflect(result: ExecutionResult): Promise<ReflectionReport>
}

export interface ObservationFacade {
  observe(query: ObservationQuery): Promise<ObservationResult>
}

export interface ClusterFacade {
  join(node: NodeDescriptor, profile: NodeCapabilityProfile, clusterId: string): void
  invoke(request: RemoteInvocation): Promise<RemoteInvocationResult>
}

export interface CertifyFacade {
  run(scenarios: readonly CertificationScenario[], runners: RunnerMap): Promise<CertificationReport>
  latest(): Promise<CertificationReport | undefined>
}
