// packages/kernel/src/router.ts
import type { RoutingRequest } from './domain/request.js'
import type { RoutingResult } from './domain/result.js'
import type { Tier } from './interfaces/tier.js'
import type { SelectedSkill } from './domain/selected-skill.js'
import type { Planner } from './interfaces/planner.js'
import type { RouterHooks, Router, SimulationResult } from './interfaces/router.js'
import type { Engine } from './interfaces/engine.js'
import { ExecutionContextFactory } from './context-factory.js'
import { buildExplanation } from './explanation.js'
import { ZERO_COST } from './domain/cost.js'

export class AiosRouter implements Router {
  private readonly tiers: readonly Tier[]
  readonly hooks: RouterHooks = {
    beforeRoute: [],
    afterRoute: [],
    beforeSkill: [],
    afterSkill: [],
    onFailure: [],
  }

  constructor(
    tiers: readonly Tier[],
    private readonly contextFactory: ExecutionContextFactory,
    private readonly planner: Planner,
    private readonly engine: Engine,
  ) {
    this.tiers = tiers
  }

  async route(request: RoutingRequest): Promise<RoutingResult> {
    const startMs = Date.now()

    for (const fn of this.hooks.beforeRoute) fn(request)

    const ctx = this.contextFactory.create(request)

    ctx.traceBuilder.append({
      version: 1, requestId: request.id, timestamp: new Date(),
      type: 'REQUEST_RECEIVED', contentType: request.contentType,
    })

    let selected: SelectedSkill | undefined
    for (const tier of this.tiers) {
      ctx.currentTierId = tier.tierId
      selected = await tier.evaluate(ctx)
      if (selected) break
    }

    if (!selected) {
      // Engine emits COMPLETED on the match path; we emit it here for the no-match path only.
      ctx.traceBuilder.append({
        version: 1, requestId: request.id, timestamp: new Date(),
        type: 'COMPLETED', reasoningInvoked: false,
      })
      const trace = ctx.traceBuilder.build()
      ctx.services.events.emit('EXECUTION_RECORD_READY', {
        type: 'EXECUTION_RECORD_READY',
        version: 1,
        requestId: trace.requestId,
        timestamp: new Date(),
        trace,
        totalLatencyMs: Date.now() - startMs,
      })
      const result: RoutingResult = {
        requestId: request.id,
        output: undefined,
        skillId: '',
        decisionTrace: trace,
        reasoningInvoked: false,
        explanation: buildExplanation(trace),
        confidence: 0,
        resourceCost: ZERO_COST,
        executionTimeMs: Date.now() - startMs,
      }
      for (const fn of this.hooks.afterRoute) fn(result)
      return result
    }

    const plan = await this.planner.createPlan(selected, ctx)

    for (const fn of this.hooks.beforeSkill) fn(plan, ctx)

    const outcome = await this.engine.execute(plan, ctx)

    for (const fn of this.hooks.afterSkill) fn(outcome, ctx)
    if (outcome.status !== 'SUCCESS') {
      for (const fn of this.hooks.onFailure) fn(outcome, ctx)
    }

    const trace = ctx.traceBuilder.build()
    ctx.services.events.emit('EXECUTION_RECORD_READY', {
      type: 'EXECUTION_RECORD_READY',
      version: 1,
      requestId: trace.requestId,
      timestamp: new Date(),
      trace,
      totalLatencyMs: Date.now() - startMs,
    })
    const reasoningInvoked = selected.tierId === 'REASONING'

    const result: RoutingResult = {
      requestId: request.id,
      output: outcome.result,
      skillId: selected.skill.metadata.skillId,
      tierId: selected.tierId,
      decisionTrace: trace,
      reasoningInvoked,
      explanation: buildExplanation(trace),
      confidence: selected.score.finalScore,
      resourceCost: outcome.metrics.resourceCost,
      executionTimeMs: Date.now() - startMs,
    }

    for (const fn of this.hooks.afterRoute) fn(result)
    return result
  }

  async simulate(request: RoutingRequest): Promise<SimulationResult> {
    const startMs = Date.now()
    const ctx = this.contextFactory.create(request)

    let selected: SelectedSkill | undefined
    const candidates: Array<{ skillId: string; tierId: string; score: number }> = []

    for (const tier of this.tiers) {
      ctx.currentTierId = tier.tierId
      const candidate = await tier.evaluate(ctx)
      if (candidate) {
        candidates.push({
          skillId: candidate.skill.metadata.skillId,
          tierId: candidate.tierId,
          score: candidate.score.finalScore,
        })
        if (!selected) selected = candidate
        break
      }
    }

    return {
      wouldRoute: !!selected,
      ...(selected ? { selectedTier: selected.tierId, selectedSkill: selected.skill.metadata.skillId } : {}),
      confidence: selected?.score.finalScore ?? 0,
      estimatedCost: selected?.estimatedCost ?? ZERO_COST,
      estimatedLatencyMs: Date.now() - startMs,
      reasoningWouldBeInvoked: selected?.tierId === 'REASONING',
      candidatesConsidered: candidates,
    }
  }
}
