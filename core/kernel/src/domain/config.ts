import type { RuntimeMode, RuntimeModePolicy, ScoringWeights } from './mode.js'
import type { TierId } from '../interfaces/tier.js'
import type { ProviderSelectionPolicy } from '../interfaces/resolver.js'

export interface TierConfig {
  readonly enabled: boolean
  readonly defaultTimeoutMs: number
}

export interface RouterConfig {
  readonly scoringWeights: ScoringWeights
  readonly tierConfigs: Partial<Record<TierId, TierConfig>>
}

export interface ManifestConfig {
  readonly rejectExperimental: boolean
  readonly scanPaths: string[]
}

export interface ProviderSelectionConfig {
  readonly defaultPolicy: ProviderSelectionPolicy
  readonly perCapabilityPolicy: Record<string, ProviderSelectionPolicy>
}

export interface RuntimeConfig {
  readonly defaultMode: RuntimeMode
  readonly customModePolicy?: RuntimeModePolicy
  readonly router: RouterConfig
  readonly manifest: ManifestConfig
  readonly providerSelection: ProviderSelectionConfig
}

export interface SystemConfig {
  readonly runtime: RuntimeConfig
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  runtime: {
    defaultMode: 'BALANCED',
    router: {
      scoringWeights: { confidence: 0.60, cost: 0.20, latency: 0.10, reliability: 0.10 },
      tierConfigs: {},
    },
    manifest: {
      rejectExperimental: false,
      scanPaths: ['packages', 'apps'],
    },
    providerSelection: {
      defaultPolicy: 'FIRST_AVAILABLE',
      perCapabilityPolicy: { reasoningEngine: 'LOWEST_COST' },
    },
  },
}
