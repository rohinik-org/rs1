import type { RevocationAssessment } from '@rohinik-org/package-trust-ir'
import type { ProvenanceBuilderIdentity, BuilderValidationResult, ProvenancePolicy, PublisherTrustAssessment } from './types.js'

export class BuilderIdentityValidator {
  validate(
    builderIdentity: ProvenanceBuilderIdentity | undefined,
    policy: ProvenancePolicy,
    revocationAssessment: RevocationAssessment | undefined,
    publisherTrustAssessment: PublisherTrustAssessment | undefined,
  ): BuilderValidationResult {
    if (!builderIdentity) {
      if (policy.requiredBuilderIds.length > 0 || policy.requiredWorkflowIds.length > 0) {
        return { valid: false, reason: 'builder-untrusted' }
      }
      return { valid: true }
    }

    if (builderIdentity.kind === 'anonymous') {
      if (policy.requiredBuilderIds.length > 0 || policy.requiredWorkflowIds.length > 0) {
        return { valid: false, reason: 'builder-untrusted' }
      }
    }

    if (revocationAssessment?.decision === 'failed') {
      return { valid: false, reason: 'builder-revoked' }
    }

    if (policy.requiredBuilderIds.length > 0) {
      const builderId = builderIdentity.builderId
      if (!policy.requiredBuilderIds.includes(builderId)) {
        return { valid: false, reason: 'builder-untrusted' }
      }
    }

    if (policy.requiredWorkflowIds.length > 0) {
      const workflowId = builderIdentity.workflowId
      if (!workflowId || !policy.requiredWorkflowIds.includes(workflowId)) {
        return { valid: false, reason: 'builder-untrusted' }
      }
    }

    const builderIdentityStr = `${builderIdentity.kind}:${builderIdentity.builderId}`
    return { valid: true, builderIdentity: builderIdentityStr }
  }
}
