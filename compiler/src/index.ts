// @rohinik-org/compiler — Rohinik Intent Compiler Foundation
export const COMPILER_VERSION = '0.1.0'

// Types
export type {
  ArtifactId, SessionId, SnapshotId, IntentId, PlanId, ExecutionId,
  SemanticCapability, Requirement,
} from './types/primitives.js'
export type {
  ArtifactBase, ArtifactMetadata, ArtifactProvenance, ArtifactIntegrity,
  ArtifactLifecycle, ArtifactReference, ParentRef, BaseArtifact, RuntimeArtifactBase,
} from './types/artifact.js'
export type { IntentIR, IntentGoal, IntentEntity, IntentConstraint } from './types/intent-ir.js'
export type { ClarificationIR, ClarificationReason, ClarificationQuestion, CompilerResumePoint } from './types/clarification-ir.js'
export type { PlanIR, PlanStep, StepInput, StepOutputSpec, ResourceEstimate } from './types/plan-ir.js'
export type {
  ExecutionGraph, ExecutionNode, ExecutionEdge, ExecutionCommand,
  ExecutionOperation, ExecutionEdgeType, RetryPolicy,
} from './types/execution-graph.js'
export type {
  VerificationReport, VerificationFinding, SimulationRecord,
  VerificationStatus, FindingSeverity,
} from './types/verification-report.js'
export type {
  ExecutionReport, StepExecutionReport, StepFailure, ExecutionStatus,
} from './types/execution-report.js'
export type {
  ExecutionRecord, ExecutionOutcome, ExecutionCandidate, TierLatency, ProviderResolutionRecord,
} from './types/execution-record.js'
export type {
  CompilerContext, SessionContext, CompilationPolicy, SystemSnapshot,
  RuntimeInfo, FeatureMap, BindingTable,
} from './types/compiler-context.js'
export type { CapabilitySnapshot, SkillDescriptor, PlannerMetadata } from './types/capability-snapshot.js'
export type {
  CapabilityDescriptorIR, CapabilityDefinition, DescriptorOrigin, SemanticCapabilityID,
} from './types/capability-descriptor-ir.js'
export type { RegistrationRecord, RegistrationStatus, CompatibilityStatus } from './types/registration-record.js'
export type { DiagnosticArtifactBase, DiagnosticSubject, SubjectReference } from './types/diagnostic-artifact.js'
export type { InstalledCapabilityEntry, CapabilityCatalogSnapshot, InstalledCapabilityStatus, CatalogInstallSource } from './types/installed-capability.js'
export type {
  RohiniKPackageManifest, AiosPackageType, RohiniKAssetType, AiosCompilerTarget,
  PublisherInfo, PackageDependency, ComplianceDeclaration, TrustInfo,
  MarketplaceMetadata, EnterprisePolicy, PackageCoordinate,
  PackContentsEntry, RohiniKPackManifest, PackCurriculum,
} from './types/rohinik-package-manifest.js'
export type { ComplianceCertificate } from './types/compliance-certificate.js'
export type {
  LearningTrigger, LearningTriggerKind, TriggerEvidence, ConfidenceMethod,
  LearningReport, AdaptationProposal, AppliedAdaptation,
} from './types/learning-trigger.js'
export type {
  HostResourceType, HostObservation, HostResource, HostResourceRelationship, HostInventory,
} from './types/host-resource.js'
export type { CommandIR, CommandCondition, CommandResolution } from './types/command-ir.js'
export type {
  CapabilityGraph, CapabilityGraphNode, CapabilityGraphEdge, CapabilityGraphNodeKind,
  CapabilityGraphRelationship, EdgeCertainty, EdgeProvenance,
} from './types/capability-graph.js'
export type { InferenceSet, InferenceCandidate, InferenceEvidence } from './types/inference-set.js'
export type { InferencePromotion } from './types/inference-promotion.js'
export type {
  RecommendationType, ExplanationStep, ExplanationPath,
  RecommendationConfidence, Recommendation,
} from './types/recommendation.js'
export type { RecommendationResult } from './types/recommendation-result.js'
export type { ExecutionChain } from './types/execution-chain.js'
export type {
  WorkflowStepStatistics, WorkflowStep, WorkflowEvidence,
  WorkflowCandidateDefinition, WorkflowCandidateStatistics,
  WorkflowCandidate, WorkflowCandidateSet,
} from './types/workflow-candidate.js'
export type {
  WorkflowStatus, WorkflowDescriptorDefinition, WorkflowDescriptorStatistics,
  WorkflowDescriptorLineage, WorkflowDescriptor,
} from './types/workflow-descriptor.js'
export type {
  WorkflowDecisionOutcome, WorkflowDecision, WorkflowApproval,
} from './types/workflow-approval.js'
export type { PlanningConstraints } from './types/planning-constraints.js'
export type { IntentTranslationRequest, IntentTranslationResult } from './types/intent-translation.js'
export type { StructuredIntent } from './types/structured-intent.js'
export type { WorkflowMatchEvidence } from './types/workflow-match-evidence.js'
export type { SynthesizedStep, CapabilityPlanEvidence } from './types/capability-plan-evidence.js'
export type { WorkflowOrigin, WorkflowReference, WorkflowPlanCandidate } from './types/workflow-plan-candidate.js'
export type { CoverageResult } from './types/coverage-result.js'
export type { SimulationStatus, PlanCost, SimulationResult } from './types/simulation-result.js'
export type { PlanRetryPolicy, WorkflowPlanStep } from './types/workflow-plan-step.js'
export type { RejectionReason, PlanningDecision } from './types/planning-decision.js'
export type { WorkflowPlanStatus, WorkflowPlan } from './types/workflow-plan.js'
export type { PlanningPolicySnapshot, PlanningTrace } from './types/planning-trace.js'
export type { ExecutionState } from './types/execution-state.js'
export type { TerminationReason, ExecutionTermination } from './types/execution-termination.js'
export type { ExecutionMetadata } from './types/execution-metadata.js'
export type { ExecutionPolicy } from './types/execution-policy-6a.js'
export { DEFAULT_EXECUTION_POLICY } from './types/execution-policy-6a.js'
export type { StepExecutionState, StepExecutionRecord } from './types/step-execution-record.js'
export type { ExecutionEventType, ExecutionJournalEntry } from './types/execution-journal-entry.js'
export type { ExecutionMetrics } from './types/execution-metrics-6a.js'
export type { ExecutionCheckpoint } from './types/execution-checkpoint.js'
export type { ExecutionResult } from './types/execution-result-6a.js'
export type { ExecutionEvent } from './types/execution-event.js'
export type { ProviderResult, ProviderInvocation } from './types/provider-invocation.js'
export type { MemoryEpisode } from './types/memory-episode.js'
export type { MemoryCandidateKind, MemoryCandidate, MemoryCandidateSet } from './types/memory-candidate.js'
export type { MemoryArtifactKind, MemoryArtifact } from './types/memory-artifact.js'
export type { MemoryQuery, MemoryResult } from './types/memory-query.js'
export type { MemoryPolicyConfig } from './types/memory-policy-type.js'
export { DEFAULT_MEMORY_POLICY } from './types/memory-policy-type.js'
export type { CapabilityQuery } from './types/capability-query-6c.js'
export type { CapabilityCandidate, CapabilityCandidateSet } from './types/capability-candidate-6c.js'
export type { ValidationCheckStatus, ValidationCheck, CapabilityValidationReport } from './types/capability-validation-report-6c.js'
export type { ApprovalDecision, CapabilityApproval } from './types/capability-approval-6c.js'
export type { AcquisitionPolicy } from './types/acquisition-policy-6c.js'
export { DEFAULT_ACQUISITION_POLICY } from './types/acquisition-policy-6c.js'
export type { ProviderEntry, ProviderRegistry } from './types/provider-registry-6d.js'
export type { RoutingPolicy } from './types/routing-policy-6d.js'
export { DEFAULT_ROUTING_POLICY } from './types/routing-policy-6d.js'
export type { PromptRequest } from './types/prompt-request-6d.js'
export type { ProviderScore } from './types/provider-score-6d.js'
export type { RoutingDecision } from './types/routing-decision-6d.js'
export type { HttpMethod, NetworkJournalEntryKind, NetworkRequest, NetworkResponse, NetworkJournalEntry, NetworkMetrics } from './types/network-ir-6e.js'
export type { ObservationCategory, ObservationStatus, ObservationEvidence, ProviderMetricsEvidence, RegistryEvidence, HttpEvidence, Observation, ObservationState, ObservationQuery } from './types/observation-ir-6e.js'
export type { ObservationPolicy } from './types/observation-policy-6e.js'
export { DEFAULT_OBSERVATION_POLICY } from './types/observation-policy-6e.js'
export type { ScenarioType, ScenarioTag, ValidationStatus, RuntimeFixture, ScenarioExpectation, RuntimeScenario, RuntimeBenchmark, ValidationFinding, RuntimeValidationReport } from './types/runtime-validation-ir-6-5.js'

// Components
export { InMemoryArtifactStore, type ArtifactStore } from './artifact-store/index.js'
export { CapabilitySnapshotBuilder } from './snapshot/index.js'
export { SessionManager } from './session/index.js'
export { SequentialPlanner, type Planner } from './planner/index.js'
export { ExecutionGraphBuilder } from './egb/index.js'
export { Verifier } from './verifier/index.js'
export { IntentCompiler, type CompilerResult, IntentParser, AnthropicLLMClient, type LLMClient } from './intent-compiler/index.js'
export type { IntentCandidate } from './intent-compiler/index.js'
export { CommandCompiler } from './command-compiler/index.js'
export type { GoalOrigin, GoalStatus, LoopState, LoopEventType, Goal, AutonomyPolicy, RuntimeState, ObservationQuerySet, LoopJournalEntry, AutonomyReport } from './types/autonomy-ir-6f.js'
export { DEFAULT_AUTONOMY_POLICY } from './types/autonomy-ir-6f.js'
export type { FindingCategory, RootCauseCategory, RecommendationKind, ReflectionFinding, RootCause, ReflectionRecommendation, ReflectionCandidate, ReflectionReport, ReflectionPolicy, ReflectionQuery } from './types/reflection-ir-6g.js'
export { DEFAULT_REFLECTION_POLICY } from './types/reflection-ir-6g.js'
export type { RuntimeSession, ServiceState, ServiceStatus, RuntimeHealth, RuntimeCommandType, RuntimeCommand, RuntimeResponse, DaemonPolicy } from './types/daemon-ir-6h.js'
export { DEFAULT_DAEMON_POLICY } from './types/daemon-ir-6h.js'
export type { EvidenceArtifactType, EvidenceReference, NormalizedEvidence, EvidenceSet, HypothesisCategory, Hypothesis, InferenceChain, ReasoningAction, ReasoningPriority, ReasoningRecommendation, ReasoningReport, ReasoningPolicy, ReasoningQuery } from './types/reasoning-ir-7a.js'
export { DEFAULT_REASONING_POLICY } from './types/reasoning-ir-7a.js'
export type { AgentRole, AgentDescriptor, AgentCapabilityProfile, AgentGoal, AgentTask, AgentSelectionDecision, AgentResult, AgentMessage, ConsensusStrategy, ConsensusDecision, MemoryScope, MemoryPromotionDecision, AgentTopology, AgentPolicy, AgentSession, AgentEventType, AgentJournalEntry, AgentQuery, CompositeInference } from './types/multi-agent-ir-7b.js'
export { DEFAULT_AGENT_POLICY } from './types/multi-agent-ir-7b.js'
export type { NodeStatus, NodeDescriptor, ClusterDescriptor, NodeCapabilityProfile, DistributedTask, RemoteInvocation, RemoteInvocationResult, DistributedExecutionRecord, ReplicationRecord, ClusterMemoryScope, ClusterPolicy, NodeHealth, ClusterEventType, ClusterJournalEntry, NodeQuery, ClusterQuery } from './types/distributed-ir-7c.js'
export { DEFAULT_CLUSTER_POLICY } from './types/distributed-ir-7c.js'
export type { CertificationStatus, CertificationSeverity, CertificationCategory, CertificationExpectation, CertificationScenario, CertificationViolation, CertificationBenchmark, CertificationResult, CertificationSummary, CertificationReport, CertificationQuery } from './types/certification-ir-7-5.js'
export type { ApplicationStatus, ApplicationOptions, ApplicationContext, ApplicationEvent, ApplicationEventHandler, ApplicationManifest, ApplicationDiagnostics } from './types/application-sdk-ir-8a.js'
export { STUDIO_PROTOCOL_VERSION } from './types/studio-ir-8b.js'
export type { StudioProtocolVersion, StudioFeature, StudioHandshake, StudioHandshakeResult, StudioHandshakeResponse, StudioConnectionStatus, StudioConnectionState, StudioEventType, StudioEvent, StudioEventHandler, StudioReplayOptions, StudioCommandType, StudioCommand, StudioCommandResult, TimelineEntryKind, TimelineEntry, GraphNodeKind, GraphNode, GraphEdge, RuntimeGraph, GraphBuilder, RuntimeDashboard, ProviderDashboard, MemoryDashboard, ClusterDashboard, RuntimeSnapshot } from './types/studio-ir-8b.js'
export { CONSOLE_PROTOCOL_VERSION } from './types/console-core-ir.js'
export type { ConsoleProtocolVersion, ConsoleRuntimeVersion, ConsoleFeature, ConsoleHandshakeRequest, ConsoleHandshakeResult, ConsoleHandshakeResponse, ConsoleConnectionPhase, ConsoleEventType, ConsoleEvent, ConsoleEventHandler, ConsoleReplayOptions, ConsoleCommandSource, ConsoleCommandType, ConsoleCommand, ConsoleCommandResult, RuntimeStateSnapshot, Projection } from './types/console-core-ir.js'
export type { PanelId, LayoutPanel, LayoutDefinition, WorkspaceId, WorkspaceRevision, WorkspaceDefinition, WorkspaceViewport, ThemeId, ThemeColorTokens, ThemeTypography, ThemeSpacing, ThemeDefinition, ThemeSnapshot, NotificationPriority, ConsoleNotification, ConsoleActivityLevel, ConsoleActivityEventType, ConsoleActivityEntry, ProjectionVersion, ConsoleEventLogEntry } from './types/console-workspace-ir.js'
export type { ConsolePermission, ConsolePermissionPolicy, ExtensionPoint, ExtensionContribution, ExtensionDescriptor, ExtensionManifest, ExtensionState } from './types/console-extension-ir.js'
export type { GraphLayoutAlgorithmId, NodePosition, EdgeRoute, GraphViewport, GraphLayout, GraphLayoutOptions } from './types/console-graph-ir.js'
