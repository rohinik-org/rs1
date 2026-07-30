import type { PackageQuarantineRequest, ValidationResult } from './types.js'

const BLOCKING_REASON_CODES = new Set([
  'source-denied', 'source-identity-invalid', 'integrity-mismatch',
  'signature-invalid', 'signing-key-revoked', 'publisher-revoked',
  'artifact-revoked', 'permission-denied', 'critical-vulnerability',
  'policy-violation', 'archive-safety-violation',
])

export function validateTrustDecision(request: PackageQuarantineRequest): ValidationResult {
  if (request.subject.packageId !== request.artifact.packageId) {
    return { valid: false, reason: `subject.packageId (${request.subject.packageId}) does not match artifact.packageId (${request.artifact.packageId})` }
  }
  const { trustDecision, trustDecisionReasonCodes } = request
  if (!['trusted', 'conditionally-trusted', 'quarantined', 'manual-review-required', 'denied'].includes(trustDecision)) {
    return { valid: false, reason: `unsupported trustDecision: ${trustDecision}` }
  }
  if (trustDecision === 'denied' && trustDecisionReasonCodes && trustDecisionReasonCodes.length === 0) {
    return { valid: false, reason: 'denied decision must have at least one reasonCode when provided' }
  }
  if (trustDecision === 'trusted' && trustDecisionReasonCodes) {
    for (const code of trustDecisionReasonCodes) {
      if (BLOCKING_REASON_CODES.has(code)) {
        return { valid: false, reason: `trusted decision cannot have blocking reasonCode: ${code}` }
      }
    }
  }
  return { valid: true }
}
