export type {
  AuthorizationId,
  AuthorizationToken,
  PackageProvisioningMode,
  PackageProvisioningAuthorizationOutcome,
  AuthorizationLifecycleState,
  ProvisioningAuthorizationConditionKind,
  ProvisioningAuthorizationCondition,
  AuthorizationReason,
  PackageQuarantineState,
  PackageTrustReevaluationState,
  PackageTrustReevaluationStatus,
  PackageProvisioningTrustSnapshot,
  RequestedCapability,
  RequestedPermission,
  CapabilityConstraint,
  PermissionConstraint,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningAuthorizationRequest,
  CapabilityRestriction,
  CapabilityScopeEvaluation,
  PackageProvisioningAuthorizationDecision,
  PackageProvisioningAuthorizationRecord,
  AuthorizationWriteReceipt,
  AuthorizationTransitionReason,
  AuthorizationTransitionCommand,
  ProvisioningTrustSnapshotRequest,
  AuthorizationEventType,
  PackageProvisioningAuthorizationEvent,
  ProvisioningAuthorizationLockHandle,
} from './types.js'

export { AuthorizationError, AuthorizationConflict } from './types.js'

export type {
  ProvisioningTrustRepositoryReader,
  ProvisioningQuarantineReader,
  ReevaluationStatusReader,
  ProvisioningAuthorizationRecordStore,
  ProvisioningAuthorizationLock,
  ProvisioningAuthorizationEventSink,
} from './ports/index.js'

export {
  createInMemoryTrustRepositoryReader,
  createInMemoryQuarantineReader,
  createInMemoryReevaluationStatusReader,
  createInMemoryAuthorizationRecordStore,
  createInMemoryAuthorizationLock,
  createInMemoryEventSink,
} from './adapters/in-memory/index.js'

export { validateProvisioningRequest } from './provisioning-request-validator.js'
export { loadProvisioningSnapshot } from './provisioning-snapshot-loader.js'
export { evaluateTrustUsability } from './trust-usability-evaluator.js'
export { evaluateQuarantineGate } from './quarantine-gate.js'
export { evaluateReevaluationGate } from './reevaluation-gate.js'
export { evaluateCapabilityScope, evaluatePermissionScope } from './capability-scope-evaluator.js'
export { evaluateProvisioningPolicy } from './provisioning-policy-evaluator.js'
export { buildAuthorizationDecision, decisionToRecord, computeAuthorizationId } from './authorization-decision-builder.js'
export { buildAuthorizationToken, verifyAuthorizationToken, computeTokenDigest } from './authorization-token-builder.js'
export { verifyAuthorizationTokenFull } from './authorization-token-verifier.js'
export { invalidateAuthorization } from './authorization-invalidator.js'
export { assertValidTransition, isTerminalState, isUsableState } from './authorization-state-machine.js'
export { createAuthorizationController } from './authorization-controller.js'
export type { AuthorizationController, AuthorizationControllerResult, ConsumeAuthorizationCommand } from './authorization-controller.js'
export type { TrustUsabilityResult } from './trust-usability-evaluator.js'
export type { QuarantineGateResult } from './quarantine-gate.js'
export type { ReevaluationGateResult } from './reevaluation-gate.js'
export type { PolicyEvaluationResult } from './provisioning-policy-evaluator.js'
export type { TokenVerificationResult, TokenPayload } from './authorization-token-builder.js'
export type { FullVerificationResult, TokenVerificationContext } from './authorization-token-verifier.js'
