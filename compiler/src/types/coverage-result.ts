export interface CoverageResult {
  readonly matchedCapabilities: readonly string[]
  readonly missingCapabilities: readonly string[]
  readonly optionalCapabilities: readonly string[]
  readonly coverageScore: number
}
