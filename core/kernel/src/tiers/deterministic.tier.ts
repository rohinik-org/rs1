import { BaseTier } from './base.tier.js'
import type { TierId } from '../interfaces/tier.js'

export class DeterministicTier extends BaseTier { readonly tierId: TierId = 'DETERMINISTIC' }
