import type {
  PackageQuarantineResult,
  PackageQuarantineRequest,
  PackageQuarantineEvidence,
  QuarantineOperationalOutcome,
  QuarantineRecord,
} from './types.js'

export function buildQuarantineResult(params: {
  request: PackageQuarantineRequest
  outcome: QuarantineOperationalOutcome
  evidence: PackageQuarantineEvidence
  quarantineRecord?: QuarantineRecord
}): PackageQuarantineResult {
  const { request, outcome, evidence, quarantineRecord } = params

  // Invariant checks
  if (outcome === 'quarantined') {
    const hasVerifyReceipt = evidence.storageReceipts.some(r => r.operation === 'verify-destination')
    if (!hasVerifyReceipt) {
      throw new Error('quarantined outcome requires at least one verify-destination receipt in evidence')
    }
  }
  if (outcome === 'containment-failed' && !evidence.failureReason) {
    throw new Error('containment-failed outcome requires failureReason in evidence')
  }
  if (outcome === 'verification-failed' && evidence.verificationFindings.length === 0) {
    throw new Error('verification-failed outcome requires non-empty verificationFindings')
  }
  if (outcome === 'manual-intervention-required' && !evidence.manualInterventionReason) {
    throw new Error('manual-intervention-required outcome requires manualInterventionReason in evidence')
  }
  if (outcome === 'not-required' && quarantineRecord) {
    throw new Error('not-required outcome must not have a quarantineRecord')
  }
  if (outcome === 'already-quarantined' && !quarantineRecord) {
    throw new Error('already-quarantined outcome requires a quarantineRecord')
  }

  const base: PackageQuarantineResult = {
    operationId: request.operationId,
    subject: request.subject,
    outcome,
    trustDecision: request.trustDecision,
    trustDecisionId: request.trustDecisionId ?? '',
    policyId: request.policy.policyId,
    policyVersion: request.policy.policyVersion,
    evidence,
    requestedAt: request.requestedAt,
  }
  return quarantineRecord !== undefined ? { ...base, quarantineRecord } : base
}
