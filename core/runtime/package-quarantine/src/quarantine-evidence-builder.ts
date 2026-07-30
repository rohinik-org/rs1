import type {
  PackageQuarantineEvidence,
  PackageTrustSubject,
  PackageTrustDecision,
  QuarantineMode,
  StorageReceipt,
  QuarantineLifecycleTransition,
} from './types.js'

export function buildQuarantineEvidence(params: {
  operationId: string
  subject: PackageTrustSubject
  trustDecisionId: string
  trustDecision: PackageTrustDecision
  policyId: string
  policyVersion: string
  mode: QuarantineMode
  sourceLocation: string
  destinationLocation?: string
  storageReceipts: readonly StorageReceipt[]
  verificationFindings: readonly string[]
  lifecycleTransitions: readonly QuarantineLifecycleTransition[]
  restrictions: readonly string[]
  requestedAt: string
  failureReason?: string
  manualInterventionReason?: string
}): PackageQuarantineEvidence {
  // ponytail: no secrets, no raw bytes, no stack traces — just the structured evidence
  const base: PackageQuarantineEvidence = {
    operationId: params.operationId,
    subject: params.subject,
    trustDecisionId: params.trustDecisionId,
    trustDecision: params.trustDecision,
    policyId: params.policyId,
    policyVersion: params.policyVersion,
    mode: params.mode,
    sourceLocation: params.sourceLocation,
    storageReceipts: params.storageReceipts,
    verificationFindings: params.verificationFindings,
    lifecycleTransitions: params.lifecycleTransitions,
    restrictions: params.restrictions,
    requestedAt: params.requestedAt,
  }
  return {
    ...base,
    ...(params.destinationLocation !== undefined ? { destinationLocation: params.destinationLocation } : {}),
    ...(params.failureReason !== undefined ? { failureReason: params.failureReason } : {}),
    ...(params.manualInterventionReason !== undefined ? { manualInterventionReason: params.manualInterventionReason } : {}),
  }
}
