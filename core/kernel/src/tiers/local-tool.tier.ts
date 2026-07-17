import { BaseTier } from './base.tier.js'
import type { TierId } from '../interfaces/tier.js'

export class LocalToolTier extends BaseTier { readonly tierId: TierId = 'LOCAL_TOOL' }
