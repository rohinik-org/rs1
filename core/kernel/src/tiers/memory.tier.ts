import { BaseTier } from './base.tier.js'
import type { TierId } from '../interfaces/tier.js'

export class MemoryTier extends BaseTier { readonly tierId: TierId = 'MEMORY' }
