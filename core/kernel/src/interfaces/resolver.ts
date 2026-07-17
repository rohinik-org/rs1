import type { Provider } from './provider.js'
import type { ExecutionRequirements } from './skill.js'
import type { ExecutionContext } from '../domain/context.js'

export type ProviderSelectionPolicy =
  | 'FIRST_AVAILABLE'
  | 'LOWEST_COST'
  | 'LOWEST_LATENCY'
  | 'HIGHEST_RELIABILITY'
  | 'USER_PREFERENCE'

export interface ProviderResolution {
  readonly provider: Provider
  readonly policy: ProviderSelectionPolicy
  readonly score: number
  readonly candidates: readonly string[]
}

export interface ResolvedProviders {
  readonly [requirementKey: string]: ProviderResolution
}

export interface ExecutionResolver {
  resolve(
    requirements: ExecutionRequirements,
    policy: ProviderSelectionPolicy,
    ctx: ExecutionContext,
  ): Promise<ResolvedProviders>
  isResolvable(requirements: ExecutionRequirements, ctx: ExecutionContext): boolean
}

export interface MutableExecutionResolver extends ExecutionResolver {
  registerProvider(provider: Provider): void
}
