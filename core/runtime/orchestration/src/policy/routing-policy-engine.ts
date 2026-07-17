import type { ProviderEntry, RoutingPolicy } from '@rohinik-org/compiler'

const COST_TIER_ORDER = { free: 0, low: 1, medium: 2, high: 3 } as const

export class RoutingPolicyEngine {
  filter(candidates: readonly ProviderEntry[], policy: RoutingPolicy): ProviderEntry[] {
    return candidates.filter(p => {
      if (!p.available) return false
      if (policy.blockedProviders.includes(p.providerId)) return false
      if (COST_TIER_ORDER[p.estimatedCostTier] > COST_TIER_ORDER[policy.maxCostTier]) return false
      if (p.maxContextWindow < policy.minimumContextWindow) return false
      return true
    })
  }
}
