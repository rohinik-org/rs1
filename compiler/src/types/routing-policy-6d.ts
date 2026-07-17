export interface RoutingPolicy {
  readonly preferLocalModels: boolean
  readonly maxCostTier: 'free' | 'low' | 'medium' | 'high'
  readonly maxLatencyMs: number
  readonly minimumContextWindow: number
  readonly preferredProviders: readonly string[]
  readonly blockedProviders: readonly string[]
}

export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  preferLocalModels: false,
  maxCostTier: 'high',
  maxLatencyMs: 30000,
  minimumContextWindow: 4096,
  preferredProviders: [],
  blockedProviders: [],
}
