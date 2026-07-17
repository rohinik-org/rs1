export interface ProviderResult {
  readonly output: unknown
  readonly providerUsed: string
  readonly latencyMs: number
  readonly tokensUsed?: number
  readonly estimatedCostUsd?: number
}

export interface ProviderInvocation {
  readonly skillId: string
  readonly input: unknown
  invoke(): Promise<ProviderResult>
}
