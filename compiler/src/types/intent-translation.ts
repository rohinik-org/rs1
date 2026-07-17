import type { PlanningConstraints } from './planning-constraints.js'
import type { StructuredIntent } from './structured-intent.js'

export interface IntentTranslationRequest {
  readonly input: string
  readonly constraints?: PlanningConstraints
}

export interface IntentTranslationResult {
  readonly intent: StructuredIntent
  readonly confidence: number
  readonly translatorId: string
  readonly unresolvedTerms: readonly string[]
  readonly warnings: readonly string[]
  readonly status: 'SUCCESS' | 'DECLINED'
}
