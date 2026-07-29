import type {
  PackageTrustDecisionRequest,
  AssessmentSetValidationResult,
  AssessmentType,
  BlockingFinding,
} from './types.js'

export class AssessmentSetValidator {
  validate(request: PackageTrustDecisionRequest): AssessmentSetValidationResult {
    const required = request.policy.requiredAssessments
    const missing: AssessmentType[] = []
    const findings: BlockingFinding[] = []

    for (const type of required) {
      if (!this.isPresent(request, type)) {
        missing.push(type)
        findings.push({
          kind: 'blocking',
          code: `missing-mandatory-assessment:${type}`,
          assessmentType: type,
          detail: `Mandatory assessment '${type}' is absent`,
        })
      }
    }

    const sorted = [...missing].sort()
    const sortedFindings = [...findings].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

    return {
      complete: missing.length === 0,
      missingAssessments: sorted,
      findings: sortedFindings,
    }
  }

  private isPresent(request: PackageTrustDecisionRequest, type: AssessmentType): boolean {
    switch (type) {
      case 'integrity': return request.integrityAssessment !== undefined
      case 'signature': return request.signatureAssessment !== undefined
      case 'publisher': return request.publisherAssessment !== undefined
      case 'revocation': return request.revocationAssessment !== undefined
      case 'provenance': return request.provenanceAssessment !== undefined
      case 'permission': return request.permissionAssessment !== undefined
      case 'vulnerability': return request.vulnerabilityAssessment !== undefined
      default: return false
    }
  }
}
