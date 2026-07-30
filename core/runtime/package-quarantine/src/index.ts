// Types
export type {
  QuarantineLifecycleState,
  QuarantineMode,
  QuarantineOperationalOutcome,
  QuarantineArtifactRef,
  PackageQuarantineContext,
  QuarantineRetentionPolicy,
  QuarantineLocationRule,
  PackageQuarantinePolicy,
  PackageQuarantineRequest,
  QuarantinePlanStepKind,
  QuarantinePlanStep,
  QuarantineRollbackStrategy,
  QuarantineContainmentPlan,
  StorageReceipt,
  ArtifactIdentityReceipt,
  ArtifactStorageStat,
  QuarantineNamespace,
  QuarantineNamespaceRequest,
  ExistingQuarantineOperation,
  QuarantineRecordReceipt,
  QuarantineLifecycleTransition,
  PackageQuarantineEvidence,
  PackageQuarantineResult,
  PackageQuarantineEvent,
  QuarantinePolicyRequirement,
  ValidationResult,
} from './types.js'

// Ports
export type { ArtifactStorage } from './ports/artifact-storage.js'
export type { QuarantineStorage } from './ports/quarantine-storage.js'
export type { QuarantineLock, QuarantineLockHandle } from './ports/quarantine-lock.js'
export type { QuarantineEventSink } from './ports/quarantine-event-sink.js'

// In-memory adapters
export { InMemoryArtifactStorage } from './adapters/in-memory/in-memory-artifact-storage.js'
export { InMemoryQuarantineStorage } from './adapters/in-memory/in-memory-quarantine-storage.js'
export { InMemoryQuarantineLock } from './adapters/in-memory/in-memory-quarantine-lock.js'
export { InMemoryQuarantineEventSink } from './adapters/in-memory/in-memory-quarantine-event-sink.js'

// Source components
export { validateQuarantineRequest } from './quarantine-request-validator.js'
export { validateTrustDecision } from './trust-decision-validator.js'
export { evaluateQuarantinePolicy } from './quarantine-policy-evaluator.js'
export { resolveQuarantineMode } from './quarantine-mode-resolver.js'
export { resolveQuarantineLocation } from './quarantine-location-resolver.js'
export { buildContainmentPlan } from './containment-plan-builder.js'
export { QuarantineExecutor } from './quarantine-executor.js'
export type { ExecutionResult } from './quarantine-executor.js'
export { verifyContainment } from './containment-verifier.js'
export type { VerificationResult } from './containment-verifier.js'
export { validateTransition, buildTransitionHistory, VALID_TRANSITIONS } from './quarantine-state-machine.js'
export { buildQuarantineEvidence } from './quarantine-evidence-builder.js'
export { buildQuarantineResult } from './quarantine-result-builder.js'
export { QuarantineController } from './quarantine-controller.js'
