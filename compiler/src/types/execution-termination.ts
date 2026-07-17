export type TerminationReason =
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_VIOLATION'
  | 'PROVIDER_ERROR'

export interface ExecutionTermination {
  readonly reason: TerminationReason
  readonly message?: string
}
