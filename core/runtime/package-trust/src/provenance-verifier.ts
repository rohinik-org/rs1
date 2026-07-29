import type {
  PackageTrustSubject,
  BuildProvenanceEnvelope,
  PackageTrustPolicySnapshot,
  TrustRootSnapshot,
  ProvenanceAssessment,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

function digestsEqual(a: IntegrityDigest, b: IntegrityDigest): boolean {
  return a.algorithm === b.algorithm && a.encoding === b.encoding && a.value === b.value
}

export class ProvenanceVerifier {
  async verify(
    subject: PackageTrustSubject,
    observedArtifactIntegrity: IntegrityDigest,
    envelope: BuildProvenanceEnvelope | undefined,
    policy: PackageTrustPolicySnapshot,
    trustRoot: TrustRootSnapshot,
  ): Promise<ProvenanceAssessment> {
    const required = policy.provenanceRules.some(r => r.required)

    if (!envelope) {
      if (required) {
        return { passed: false, reason: 'provenance-required' }
      }
      return { passed: true }
    }

    const issuer = trustRoot.issuers.find(i => i.issuerId === envelope.issuerId)
    if (!issuer) {
      return { passed: false, reason: 'provenance-issuer-not-in-trust-root' }
    }
    if (issuer.status === 'revoked') {
      return { passed: false, reason: 'provenance-issuer-revoked' }
    }

    if (!digestsEqual(envelope.outputIntegrity, observedArtifactIntegrity)) {
      return { passed: false, builderIdentity: envelope.builderIdentity, reason: 'provenance-output-integrity-mismatch' }
    }

    return { passed: true, builderIdentity: envelope.builderIdentity }
  }
}
