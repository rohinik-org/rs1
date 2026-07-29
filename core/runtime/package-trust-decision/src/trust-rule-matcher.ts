import type {
  PackageTrustDecisionRequest,
  CanonicalizedPolicy,
  MatchedRule,
  TrustRule,
} from './types.js'

export class TrustRuleMatcher {
  match(request: PackageTrustDecisionRequest, canonicalized: CanonicalizedPolicy): readonly MatchedRule[] {
    const { subject } = request
    const matched: MatchedRule[] = []

    for (const rule of canonicalized.orderedRules) {
      if (this.ruleMatches(rule, subject.packageId, subject.version, subject.publisherIdentity?.publisherId)) {
        matched.push({ rule, specificity: rule.specificity })
      }
    }

    return matched
  }

  private ruleMatches(
    rule: TrustRule,
    packageId: string,
    version: string,
    publisherId?: string,
  ): boolean {
    if (!rule.matchPattern) {
      // Global rule always matches
      return rule.specificity === 'global'
    }

    const pattern = rule.matchPattern

    switch (rule.specificity) {
      case 'exact-package-version':
        return pattern === `${packageId}@${version}`

      case 'exact-package':
        return pattern === packageId

      case 'namespace': {
        const ns = pattern.endsWith('/') ? pattern : `${pattern}/`
        return packageId.startsWith(ns) || packageId === pattern
      }

      case 'exact-publisher':
        return publisherId !== undefined && pattern === publisherId

      case 'publisher-class':
        return publisherId !== undefined && publisherId.startsWith(pattern)

      case 'package-class':
        return packageId.includes(pattern)

      case 'environment':
        // Would use context.environment — not available in IR, skip for now
        return false

      case 'tenant':
        // Would use context.tenant — not in IR, skip
        return false

      case 'global':
        return true
    }
  }
}
