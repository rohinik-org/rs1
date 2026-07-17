import type { ArtifactBase } from './artifact.js'
import type { ArtifactId } from './primitives.js'

export interface ClarificationReason {
  readonly type:
    | 'ambiguous_entity' | 'conflicting_constraints' | 'missing_entity'
    | 'low_confidence' | 'requires_confirmation' | 'policy_restriction'
    | 'simulation_divergence' | 'planner_confirmation'
  readonly description: string
  readonly affectedEntities?: readonly string[]
}

export interface ClarificationQuestion {
  readonly questionId: string
  readonly text: string
  readonly choices?: readonly string[]
  readonly required: boolean
}

export interface CompilerResumePoint {
  readonly stage:
    | 'entity_resolution' | 'constraint_resolution' | 'validation'
    | 'planning' | 'verification'
  readonly partialArtifactId?: ArtifactId
}

export interface ClarificationIR extends ArtifactBase {
  readonly expiresAt?: string
  readonly originStage: 'intent_compiler' | 'planner' | 'verifier' | 'optimizer'
  readonly reason: ClarificationReason
  readonly questions: readonly ClarificationQuestion[]
  readonly resumePoint: CompilerResumePoint
}
