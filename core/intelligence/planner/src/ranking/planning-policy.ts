export type OptimizationGoal = 'SPEED' | 'COST' | 'RELIABILITY' | 'COVERAGE'

export interface PlanningPolicy {
  readonly policyId: string
  readonly optimizationGoal: OptimizationGoal
  readonly planningWeight: number
  readonly evidenceWeight: number
  readonly provenanceWeight: number
  readonly tieBreakRule: string
  readonly minConfidenceThreshold: number
  readonly maxCandidates: number
  readonly allowSynthesized: boolean
}

export const DEFAULT_PLANNING_POLICY: PlanningPolicy = {
  policyId: 'default-v1',
  optimizationGoal: 'RELIABILITY',
  planningWeight: 0.4,
  evidenceWeight: 0.4,
  provenanceWeight: 0.2,
  tieBreakRule: 'DISCOVERED_WINS',
  minConfidenceThreshold: 0.1,
  maxCandidates: 10,
  allowSynthesized: true,
}
