import type { ExecutionEnvironment, ProviderCapabilityType, ProviderHealth } from './provider.js'
import type { ExecutionContext } from '../domain/context.js'

export interface Resource {
  readonly resourceId: string
  readonly environment: ExecutionEnvironment
}

export interface ResourceRequirement {
  readonly environment: ExecutionEnvironment
  readonly capabilities?: readonly ProviderCapabilityType[]
  readonly exclusive?: boolean
  readonly timeoutMs?: number
}

export interface ResourceManager {
  acquire(requirement: ResourceRequirement, ctx: ExecutionContext): Promise<Resource>
  release(resource: Resource): Promise<void>
  health(environment: ExecutionEnvironment): Promise<ProviderHealth>
  utilization(environment: ExecutionEnvironment): number
}
