// Types
export type {
  PackageTrustReevaluationTriggerType,
  ReevaluationAuthority,
  ReevaluationScope,
  ReevaluationChangedReference,
  PackageTrustReevaluationTrigger,
  ReevaluationCandidateQuery,
  ReevaluationReasonType,
  ReevaluationSelectionReason,
  PackageTrustReevaluationCandidate,
  ReevaluationPriorityRule,
  PackageTrustReevaluationPolicy,
  AssessmentPlanKind,
  ReevaluationAssessmentPlan,
  ReevaluationInputReferences,
  PackageTrustReevaluationWorkItem,
  ReevaluationLifecycleState,
  PackageTrustPipelineInput,
  PackageTrustPipelineResult,
  TrustDecisionChangeClassification,
  TrustDecisionComparison,
  PackageQuarantineState,
  PackageTrustReevaluationEvent,
  ReevaluationOutcomeKind,
  ReevaluationItemResult,
  ReevaluationBatchResult,
  ReevaluationLockHandle,
  TriggerValidationResult,
  RetryMetadata,
  IdempotencyRecord,
} from './types.js'

// Ports
export type { TrustRepositoryReader } from './ports/trust-repository-reader.js'
export type { TrustRepositoryWriter } from './ports/trust-repository-writer.js'
export type { TrustPipeline } from './ports/trust-pipeline.js'
export type { QuarantineService } from './ports/quarantine-service.js'
export type { ReevaluationLock } from './ports/reevaluation-lock.js'
export type { ReevaluationEventSink } from './ports/reevaluation-event-sink.js'

// In-memory adapters
export { InMemoryTrustRepositoryReader } from './adapters/in-memory/in-memory-trust-repository-reader.js'
export { InMemoryTrustRepositoryWriter } from './adapters/in-memory/in-memory-trust-repository-writer.js'
export { InMemoryTrustPipeline } from './adapters/in-memory/in-memory-trust-pipeline.js'
export { InMemoryQuarantineService } from './adapters/in-memory/in-memory-quarantine-service.js'
export { InMemoryReevaluationLock } from './adapters/in-memory/in-memory-reevaluation-lock.js'
export { InMemoryReevaluationEventSink } from './adapters/in-memory/in-memory-reevaluation-event-sink.js'

// Domain components
export { validateTrigger } from './reevaluation-trigger-validator.js'
export { buildCandidateQuery } from './candidate-query-builder.js'
export { selectCandidates } from './reevaluation-candidate-selector.js'
export { deduplicateCandidates } from './candidate-deduplicator.js'
export { evaluateReevaluationPolicy } from './reevaluation-policy-evaluator.js'
export type { PolicyEvaluationResult } from './reevaluation-policy-evaluator.js'
export { buildWorkItem } from './reevaluation-work-item-builder.js'
export { resolveInputs } from './reevaluation-input-resolver.js'
export type { InputResolverResult } from './reevaluation-input-resolver.js'
export { runPipeline } from './reevaluation-pipeline-runner.js'
export { compareDecisions } from './trust-decision-comparator.js'
export { buildSuccessorCommands } from './successor-record-builder.js'
export type { SuccessorCommands } from './successor-record-builder.js'
export { buildItemResult, buildBatchResult } from './reevaluation-result-builder.js'
export {
  validateTransition,
  assertTransition,
  isTerminalState,
  VALID_TRANSITIONS,
} from './reevaluation-state-machine.js'
export { ReevaluationController } from './reevaluation-controller.js'
export type { ReevaluationControllerDeps } from './reevaluation-controller.js'
