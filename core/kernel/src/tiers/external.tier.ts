import { BaseTier } from './base.tier.js'
import type { TierId } from '../interfaces/tier.js'

export class ExternalTier extends BaseTier { readonly tierId: TierId = 'EXTERNAL' }
