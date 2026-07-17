export interface PlanningConstraints {
  readonly maxLatencyMs?: number
  readonly preferredProviders?: readonly string[]
  readonly requiredCapabilities?: readonly string[]
  readonly forbiddenCapabilities?: readonly string[]
  readonly maxCost?: number
  readonly offlineOnly?: boolean
}
