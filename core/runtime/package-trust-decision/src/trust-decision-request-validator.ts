import type { PackageTrustDecisionRequest, RequestValidationResult } from './types.js'

export class TrustDecisionRequestValidator {
  validate(request: PackageTrustDecisionRequest): RequestValidationResult {
    if (!request.subject) return { valid: false, reason: 'missing-subject' }
    if (!request.subject.packageId) return { valid: false, reason: 'missing-subject-packageId' }
    if (!request.subject.version) return { valid: false, reason: 'missing-subject-version' }

    if (!request.integrityAssessment) return { valid: false, reason: 'missing-integrityAssessment' }
    if (!request.signatureAssessment) return { valid: false, reason: 'missing-signatureAssessment' }
    if (!request.publisherAssessment) return { valid: false, reason: 'missing-publisherAssessment' }
    if (!request.revocationAssessment) return { valid: false, reason: 'missing-revocationAssessment' }
    if (!request.provenanceAssessment) return { valid: false, reason: 'missing-provenanceAssessment' }
    if (!request.permissionAssessment) return { valid: false, reason: 'missing-permissionAssessment' }
    if (!request.vulnerabilityAssessment) return { valid: false, reason: 'missing-vulnerabilityAssessment' }

    if (!request.policy) return { valid: false, reason: 'missing-policy' }
    if (!request.policy.policyId) return { valid: false, reason: 'missing-policy-policyId' }
    if (!request.policy.snapshot) return { valid: false, reason: 'missing-policy-snapshot' }

    if (!request.context) return { valid: false, reason: 'missing-context' }
    if (!request.context.policySnapshot) return { valid: false, reason: 'missing-context-policySnapshot' }
    if (!request.context.trustRootSnapshot) return { valid: false, reason: 'missing-context-trustRootSnapshot' }
    if (!request.context.enforcementProfile) return { valid: false, reason: 'missing-context-enforcementProfile' }

    if (!request.evaluatedAt) return { valid: false, reason: 'missing-evaluatedAt' }
    if (!isValidIso(request.evaluatedAt)) return { valid: false, reason: 'malformed-evaluatedAt' }

    const publisherDecision = request.publisherAssessment.decision
    if (publisherDecision !== 'accepted' && publisherDecision !== 'manual-review-required' && publisherDecision !== 'rejected') {
      return { valid: false, reason: 'unsupported-publisher-assessment-discriminant' }
    }

    const revocationDecision = request.revocationAssessment.decision
    if (revocationDecision !== 'passed' && revocationDecision !== 'manual-review-required' && revocationDecision !== 'failed') {
      return { valid: false, reason: 'unsupported-revocation-assessment-discriminant' }
    }

    return { valid: true }
  }
}

function isValidIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !isNaN(Date.parse(value))
}
