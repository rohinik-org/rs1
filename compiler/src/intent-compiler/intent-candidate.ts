// Transient compiler artifact — never persisted, never used for execution.
export interface IntentCandidate {
  readonly rawText: string
  readonly parsedGoal?: {
    readonly action?: string
    readonly object?: string
    readonly desiredState?: string
  }
  readonly parsedEntities?: Array<{
    readonly name: string
    readonly rawValue: string
    readonly inferredType?: string
  }>
  readonly parsedConstraints?: Array<{
    readonly type?: string
    readonly target: string
    readonly value?: unknown
  }>
  readonly rawConfidence?: number
  readonly parseWarnings?: readonly string[]
}
