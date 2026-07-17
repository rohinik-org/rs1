export interface SynthesizedStep {
  readonly skillId: string
  readonly graphPath: string
  readonly rationale: string
}

export interface CapabilityPlanEvidence {
  readonly graphPaths: readonly string[]
  readonly selectedCapabilities: readonly string[]
  readonly missingCapabilities: readonly string[]
  readonly synthesizedSteps: readonly SynthesizedStep[]
  readonly coverageScore: number
  readonly confidence: number
}
