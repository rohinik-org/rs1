export interface ProviderScore {
  readonly providerId: string
  readonly capabilityScore: number
  readonly costScore: number
  readonly latencyScore: number
  readonly policyScore: number
  readonly finalScore: number
}
