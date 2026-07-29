import type {
  PackageTrustSubject,
  PackageTrustPolicySnapshot,
  TrustRootSnapshot,
  SourceAssessment,
  PublisherAssessment,
  ExternalSourceKind,
} from '@rohinik-org/package-trust-ir'

export class SourceAdmissionEvaluator {
  assess(
    subject: PackageTrustSubject,
    policy: PackageTrustPolicySnapshot,
  ): SourceAssessment {
    const sourceKind = subject.sourceIdentity.sourceKind as ExternalSourceKind

    for (const rule of [...policy.sourceRules].sort((a, b) => a.order - b.order)) {
      if (rule.sourceKind !== sourceKind) continue
      if (rule.registryPattern) {
        const locator = 'registryId' in subject.sourceIdentity
          ? subject.sourceIdentity.registryId
          : ''
        if (!locator.includes(rule.registryPattern)) continue
      }
      if (rule.effect === 'deny') {
        return { passed: false, sourceKind, reason: `source-rule-${rule.order}-deny` }
      }
      return { passed: true, sourceKind }
    }

    // unknownSourceDecision is always 'deny'
    return { passed: false, sourceKind, reason: 'unknown-source' }
  }

  // Correction 15: publisher assessment only uses verified issuerId
  assessPublisher(
    subject: PackageTrustSubject,
    signatureIssuerId: string | undefined,
    policy: PackageTrustPolicySnapshot,
    trustRoot: TrustRootSnapshot,
  ): PublisherAssessment {
    // No verified issuer — check policy for unknown publisher
    if (!signatureIssuerId) {
      if (policy.unknownPublisherDecision === 'manual-review') {
        return { decision: 'manual-review-required', reason: 'no-verified-issuer' }
      }
      return { decision: 'rejected', reason: 'no-verified-issuer' }
    }

    // Verify issuer is in trust root
    const issuer = trustRoot.issuers.find(i => i.issuerId === signatureIssuerId)
    if (!issuer) {
      return { decision: 'rejected', reason: 'issuer-not-in-trust-root' }
    }
    if (issuer.status === 'revoked') {
      return { decision: 'rejected', reason: 'issuer-revoked' }
    }

    // Check namespace binding
    const packageNamespace = subject.packageId.split('/')[0] ?? subject.packageId
    const binding = trustRoot.namespaceBindings.find(b => {
      const pattern = b.namespacePattern
      return packageNamespace === pattern || pattern === '*' || packageNamespace.startsWith(pattern.replace('*', ''))
    })

    for (const rule of [...policy.publisherRules].sort((a, b) => a.order - b.order)) {
      const matchesNamespace = !binding || rule.namespacePattern === undefined || binding.namespacePattern.includes(rule.namespacePattern)
      const matchesPublisher = rule.publisherPattern === '*' || rule.publisherPattern === signatureIssuerId
      if (!matchesPublisher || !matchesNamespace) continue
      if (rule.effect === 'deny') return { decision: 'rejected', reason: `publisher-rule-${rule.order}-deny` }
      if (rule.effect === 'manual-review') return { decision: 'manual-review-required', reason: `publisher-rule-${rule.order}-manual-review` }
      return { decision: 'accepted' }
    }

    if (policy.unknownPublisherDecision === 'manual-review') {
      return { decision: 'manual-review-required', reason: 'no-matching-publisher-rule' }
    }
    return { decision: 'rejected', reason: 'no-matching-publisher-rule' }
  }
}
