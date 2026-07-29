import type { RequestValidationResult, ProvenanceVerificationRequest } from './types.js'

export class ProvenanceRequestValidator {
  validate(request: ProvenanceVerificationRequest): RequestValidationResult {
    if (!request.subject || !request.subject.packageId || !request.subject.version) {
      return { valid: false, reason: 'missing-provenance' }
    }

    if (!request.integrityAssessment) {
      return { valid: false, reason: 'missing-provenance' }
    }

    if (!request.integrityAssessment.passed) {
      return { valid: false, reason: 'missing-provenance' }
    }

    if (!request.provenanceStatement) {
      return { valid: false, reason: 'missing-provenance' }
    }

    if (!request.provenanceStatement.statementType || !request.provenanceStatement.statementVersion) {
      return { valid: false, reason: 'malformed-provenance' }
    }

    if (!request.evaluatedAt || isNaN(Date.parse(request.evaluatedAt))) {
      return { valid: false, reason: 'evaluation-failed' }
    }

    if (!request.policy) {
      return { valid: false, reason: 'evaluation-failed' }
    }

    if (!Array.isArray(request.policy.acceptedStatementTypes) || !Array.isArray(request.policy.acceptedStatementVersions)) {
      return { valid: false, reason: 'evaluation-failed' }
    }

    if (request.revocationAssessment?.decision === 'failed' && request.signatureAssessment?.passed === false) {
      // contradictory: revoked and sig fails — still valid to process, no structural contradiction
    }

    return { valid: true }
  }
}
