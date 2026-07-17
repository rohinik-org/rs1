import type { ProviderScore } from './provider-score-6d.js'

export interface RoutingDecision {
  readonly kind: 'RoutingDecision'
  readonly skillId: string
  readonly selectedProviderId: string
  readonly scores: readonly ProviderScore[]
  readonly fallbackChain: readonly string[]
  readonly decidedAt: string
}
