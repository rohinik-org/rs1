export interface ProviderEntry {
  readonly providerId: string
  readonly displayName: string
  readonly supportedSkillTags: readonly string[]
  readonly maxContextWindow: number
  readonly estimatedCostTier: 'free' | 'low' | 'medium' | 'high'
  readonly estimatedLatencyTier: 'very-low' | 'low' | 'medium' | 'high'
  readonly available: boolean
  readonly baseUrl?: string
}

export interface ProviderRegistry {
  readonly providers: readonly ProviderEntry[]
}
