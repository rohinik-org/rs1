import type { CoverageResult } from './coverage-result.js'

export interface PlanCost {
  readonly estimatedLatencyMs: number
  readonly estimatedTokens: number
  readonly estimatedCostUsd: number
  readonly estimatedMemoryMb: number
}

export type SimulationStatus = 'EXECUTABLE' | 'VALID_STRUCTURE' | 'PARTIALLY_EXECUTABLE' | 'INVALID'

export interface SimulationResult {
  readonly status: SimulationStatus
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
  readonly cost: PlanCost
  readonly estimatedSteps: number
  readonly hasCycle: boolean
  readonly coverage: CoverageResult
  readonly simulatedWith: {
    readonly capabilityRegistryRevision: number
    readonly plannerVersion: string
  }
}
