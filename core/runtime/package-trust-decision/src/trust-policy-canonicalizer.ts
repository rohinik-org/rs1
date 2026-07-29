import type { PackageTrustPolicy, CanonicalizedPolicy, TrustRule } from './types.js'

const SPECIFICITY_ORDER = [
  'exact-package-version',
  'exact-package',
  'namespace',
  'exact-publisher',
  'publisher-class',
  'package-class',
  'environment',
  'tenant',
  'global',
] as const

function specificityRank(s: TrustRule['specificity']): number {
  return SPECIFICITY_ORDER.indexOf(s)
}

export class TrustPolicyCanonicalizer {
  canonicalize(policy: PackageTrustPolicy): CanonicalizedPolicy {
    // Validate rule IDs unique per category
    const allRules = [
      ...policy.hardRejectRules,
      ...policy.manualReviewRules,
      ...policy.degradedRules,
      ...policy.advisoryRules,
    ]

    const seenIds = new Set<string>()
    for (const rule of allRules) {
      if (!rule.ruleId) return { policy, orderedRules: [], valid: false, reason: 'missing-rule-id' }
      if (seenIds.has(rule.ruleId)) {
        return { policy, orderedRules: [], valid: false, reason: `duplicate-rule-id:${rule.ruleId}` }
      }
      seenIds.add(rule.ruleId)
    }

    const ordered = [...allRules].sort((a, b) => {
      const rankDiff = specificityRank(a.specificity) - specificityRank(b.specificity)
      if (rankDiff !== 0) return rankDiff
      // Within same specificity, deny/manual-review before allow
      const effectOrder = (e: TrustRule['effect']): number => {
        switch (e) {
          case 'deny': return 0
          case 'manual-review': return 1
          case 'degrade': return 2
          case 'advisory': return 3
          case 'allow': return 4
        }
      }
      const effectDiff = effectOrder(a.effect) - effectOrder(b.effect)
      if (effectDiff !== 0) return effectDiff
      return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0
    })

    return { policy, orderedRules: ordered, valid: true }
  }
}
