export interface ResourceCostMeasure {
  readonly usd?: number
  readonly tokens?: number
  readonly cpuMs?: number
  readonly memoryMb?: number
  readonly gpuMs?: number
  readonly networkBytes?: number
}

export interface ResourceCost {
  readonly estimated: ResourceCostMeasure
  readonly actual?: ResourceCostMeasure
}

export type ProviderSelectionPolicy =
  | 'FIRST_AVAILABLE'
  | 'LOWEST_COST'
  | 'LOWEST_LATENCY'
  | 'HIGHEST_RELIABILITY'
  | 'USER_PREFERENCE'

export interface ProviderResolution {
  readonly provider: unknown
  readonly policy: ProviderSelectionPolicy
  readonly score: number
  readonly candidates: readonly string[]
}

export interface ResolvedProviders {
  readonly [requirementKey: string]: ProviderResolution
}
