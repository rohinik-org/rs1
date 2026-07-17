import type { PlanningConstraints } from './planning-constraints.js'

export interface StructuredIntent {
  readonly intentId: string
  readonly schemaVersion: '1.0'
  readonly rawInput: string
  readonly concepts: readonly string[]
  readonly preferredSkills: readonly string[]
  readonly constraints: PlanningConstraints
  readonly translatedBy: string
  readonly translationConfidence: number
  readonly unresolvedTerms: readonly string[]
}
