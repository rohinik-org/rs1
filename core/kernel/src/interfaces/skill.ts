import type { ExecutionContext } from '../domain/context.js'
import type { ResourceCost } from '../domain/cost.js'
import type { ExecutionOutcome } from '../domain/result.js'
import type { ResolvedProviders } from './resolver.js'
import type { TierId } from './tier.js'
import type { Matcher } from '../matching/matcher.js'

export type ExecutionModel = 'DETERMINISTIC' | 'HEURISTIC' | 'REASONING'

export interface ScoreComponent {
  readonly id: string
  readonly value: number
  readonly weight: number
}

export interface SkillScore {
  readonly skillId: string
  readonly components: readonly ScoreComponent[]
  readonly finalScore: number
}

export type SkillEvaluation =
  | { readonly matched: true; readonly score: SkillScore; readonly reason?: string }
  | { readonly matched: false; readonly reason?: string }

// Matching metadata belongs to the skill — it decides "should I be considered?".
// The skill owns the matcher as data. The router/tier calls the matcher via
// evaluateSkill() and constructs a SkillScore through the injected
// RankingPolicy.
//
// When `matching.matcher` is present, evaluateSkill() prefers it over
// legacy skill.evaluate(). Skills migrated to the Matcher abstraction can
// omit their custom evaluate() implementation.
export interface SkillMatchingMetadata {
  readonly matcher: Matcher
  // Reserved: readonly confidenceThreshold?, readonly boost?
}

export interface SkillMetadata {
  readonly skillId: string
  readonly name: string
  readonly tierId: TierId
  readonly version: string
  readonly executionModel: ExecutionModel
  readonly requirements: ExecutionRequirements
  // Optional in v1: when present, the tier uses matcher.match(). When
  // absent, the tier falls back to the legacy skill.evaluate() path.
  readonly matching?: SkillMatchingMetadata
}

export interface ExecutionRequirements {
  readonly environments?: {
    readonly shell?: boolean
    readonly filesystem?: { read?: boolean; write?: boolean }
    readonly network?: boolean
    readonly gpu?: boolean
    readonly browser?: boolean
  }
  readonly providerCapabilities?: {
    readonly pythonRuntime?: boolean
    readonly containerRuntime?: boolean
    readonly reasoningEngine?: ReasoningRequirements
    readonly browserEngine?: boolean
    readonly storageEngine?: boolean
  }
}

export interface ReasoningRequirements {
  readonly reasoning?: boolean
  readonly planning?: boolean
  readonly vision?: boolean
  readonly streaming?: boolean
  readonly toolCalling?: boolean
  readonly multimodal?: boolean
  readonly structuredOutput?: boolean
  readonly longContext?: boolean
}

export interface Skill<TResult = unknown> {
  readonly metadata: SkillMetadata
  estimatedCost(ctx: ExecutionContext): ResourceCost
  // Legacy evaluation path. Skills that declare matching.matcher may omit
  // this and let evaluateSkill() delegate to the matcher.
  evaluate?(ctx: ExecutionContext): SkillEvaluation
  execute(ctx: ExecutionContext, providers: ResolvedProviders): Promise<ExecutionOutcome<TResult>>
}
