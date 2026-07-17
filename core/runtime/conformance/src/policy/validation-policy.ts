export interface ValidationPolicy {
  readonly performanceRegressionThreshold: number
  readonly failOnPerformanceRegression: boolean
  readonly maxScenarioTimeoutMs: number
  readonly allowLiveScenarios: boolean
}

export const DEFAULT_VALIDATION_POLICY: ValidationPolicy = {
  performanceRegressionThreshold: 1.2,
  failOnPerformanceRegression: false,
  maxScenarioTimeoutMs: 30_000,
  allowLiveScenarios: false,
}
