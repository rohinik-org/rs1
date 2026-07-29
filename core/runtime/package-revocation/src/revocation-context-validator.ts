import type { RevocationEvaluationContext, RevocationPolicy } from './types.js'

export type ContextValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function validateRevocationContext(
  ctx: RevocationEvaluationContext,
  policy: RevocationPolicy,
): ContextValidationResult {
  // evaluatedAt must be valid ISO timestamp
  const evalDate = new Date(ctx.evaluatedAt)
  if (isNaN(evalDate.getTime())) {
    return { valid: false, reason: `invalid evaluatedAt: ${ctx.evaluatedAt}` }
  }

  // signature assessment must be present for issuer/key evaluation
  if (policy.requireIssuer && !ctx.issuerId) {
    if (!ctx.signatureAssessment.passed) {
      return { valid: false, reason: 'signature-not-passed: cannot evaluate issuer revocation' }
    }
    return { valid: false, reason: 'missing-issuer-id: required by policy' }
  }

  if (policy.requireSigningKey && !ctx.signingKeyId) {
    return { valid: false, reason: 'missing-signing-key-id: required by policy' }
  }

  // issuerId and signingKeyId must be non-empty strings if provided
  if (ctx.issuerId !== undefined && ctx.issuerId.trim() === '') {
    return { valid: false, reason: 'empty issuerId' }
  }
  if (ctx.signingKeyId !== undefined && ctx.signingKeyId.trim() === '') {
    return { valid: false, reason: 'empty signingKeyId' }
  }

  return { valid: true }
}
