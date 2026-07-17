export type RejectionReason =
  | 'LOW_SCORE'
  | 'FAILED_SIMULATION'
  | 'POLICY_REJECTED'
  | 'INCOMPLETE'
  | 'DUPLICATE'
  | 'LOWER_EVIDENCE'
  | 'INCOMPATIBLE_OUTPUT_TYPE'
  | 'MISSING_PROVIDER'

export interface PlanningDecision {
  readonly decisionId: string
  readonly selectedCandidateId: string
  readonly rejectedCandidates: readonly {
    readonly candidateId: string
    readonly reason: RejectionReason
    readonly detail?: string
  }[]
  readonly policyId: string
  readonly plannerVersion: string
  readonly timestamp: string // ISO-8601
}
