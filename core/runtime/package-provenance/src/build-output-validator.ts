import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'
import type { ProvenanceBuildOutput, OutputValidationResult, ProvenancePolicy } from './types.js'

export class BuildOutputValidator {
  validate(
    outputs: readonly ProvenanceBuildOutput[],
    artifactDigest: IntegrityDigest,
    packageId: string,
    version: string,
    policy: ProvenancePolicy,
  ): OutputValidationResult {
    if (outputs.length === 0) {
      if (policy.requireOutputDigestBinding) {
        return { valid: false, reason: 'output-mismatch' }
      }
      return { valid: true, outputEvidenceIds: [] }
    }

    const matching = outputs.filter(o => this.digestMatches(o.digest, artifactDigest))

    if (matching.length === 0) {
      return { valid: false, reason: 'output-mismatch' }
    }

    if (matching.length > 1) {
      if (!policy.allowDegradedProvenance) {
        return { valid: false, reason: 'ambiguous-provenance' }
      }
    }

    const identityMatches = matching.filter(o =>
      (o.packageId === undefined || o.packageId === packageId) &&
      (o.version === undefined || o.version === version),
    )

    if (policy.requireOutputDigestBinding && identityMatches.length === 0) {
      return { valid: false, reason: 'subject-mismatch' }
    }

    const outputEvidenceIds = matching.map(o => o.outputId)
    return { valid: true, outputEvidenceIds }
  }

  private digestMatches(a: IntegrityDigest, b: IntegrityDigest): boolean {
    if (a.algorithm !== b.algorithm) return false
    if (a.encoding !== b.encoding) return false
    const av = a.encoding === 'hex' ? a.value.toLowerCase() : a.value
    const bv = b.encoding === 'hex' ? b.value.toLowerCase() : b.value
    return av === bv
  }
}
