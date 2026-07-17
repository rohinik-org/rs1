import type { ExecutionContext } from './skill-context.js'
import type { ResourceCost } from './skill-resource.js'
import type { ExecutionOutcome } from './skill-result.js'
import type { ResolvedProviders } from './skill-resource.js'
import type { SkillMatchingMetadata } from './matching.js'

export type TierId = 'MEMORY' | 'DETERMINISTIC' | 'LOCAL_TOOL' | 'EXTERNAL' | 'REASONING'
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

export interface SkillMetadata {
  readonly skillId: string
  readonly name: string
  readonly tierId: TierId
  readonly version: string
  readonly executionModel: ExecutionModel
  readonly requirements: ExecutionRequirements
  readonly matching?: SkillMatchingMetadata
}

export interface Skill<TResult = unknown> {
  readonly metadata: SkillMetadata
  estimatedCost(ctx: ExecutionContext): ResourceCost
  evaluate?(ctx: ExecutionContext): SkillEvaluation
  execute(ctx: ExecutionContext, providers: ResolvedProviders): Promise<ExecutionOutcome<TResult>>
}
