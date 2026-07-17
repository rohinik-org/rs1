import type { RoutingRequest } from '../domain/request.js'
import type { RoutingResult } from '../domain/result.js'
import type { ExecutionPlan } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import type { ResourceCost } from '../domain/cost.js'
import type { TierId } from './tier.js'

export interface RouterHooks {
  beforeRoute: Array<(request: RoutingRequest) => void>
  afterRoute: Array<(result: RoutingResult) => void>
  beforeSkill: Array<(plan: ExecutionPlan, ctx: ExecutionContext) => void>
  afterSkill: Array<(outcome: ExecutionOutcome, ctx: ExecutionContext) => void>
  onFailure: Array<(outcome: ExecutionOutcome, ctx: ExecutionContext) => void>
}

export interface Router {
  route(request: RoutingRequest): Promise<RoutingResult>
  simulate(request: RoutingRequest): Promise<SimulationResult>
}

export interface SimulationResult {
  readonly wouldRoute: boolean
  readonly selectedTier?: TierId
  readonly selectedSkill?: string
  readonly confidence: number
  readonly estimatedCost: ResourceCost
  readonly estimatedLatencyMs: number
  readonly reasoningWouldBeInvoked: boolean
  readonly candidatesConsidered: Array<{ skillId: string; tierId: string; score: number }>
}
