import { BaseTier } from './base.tier.js'
import type { TierId } from '../interfaces/tier.js'
import type { ProviderSelectionPolicy } from '../interfaces/resolver.js'

export class ReasoningTier extends BaseTier {
  readonly tierId: TierId = 'REASONING'
  protected override get providerPolicy(): ProviderSelectionPolicy { return 'LOWEST_COST' }
}
