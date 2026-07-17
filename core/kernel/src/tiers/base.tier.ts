import type { Tier, TierId } from '../interfaces/tier.js'
import type { SelectedSkill } from '../domain/selected-skill.js'
import type { ExecutionContext } from '../domain/context.js'
import type { Skill, SkillScore } from '../interfaces/skill.js'
import type { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import type { ExecutionResolver, ProviderSelectionPolicy } from '../interfaces/resolver.js'
import { evaluateSkill } from '../interfaces/evaluate-skill.js'
import { DEFAULT_RANKING_POLICY, type RankingPolicy } from '../matching/ranking.js'

export abstract class BaseTier implements Tier {
  abstract readonly tierId: TierId

  constructor(
    protected readonly catalog: InMemoryCapabilityCatalog,
    protected readonly resolver: ExecutionResolver,
    protected readonly ranking: RankingPolicy = DEFAULT_RANKING_POLICY,
  ) {}

  protected get providerPolicy(): ProviderSelectionPolicy {
    return 'FIRST_AVAILABLE'
  }

  async evaluate(ctx: ExecutionContext): Promise<SelectedSkill | undefined> {
    const { allowedTiers, allowedExecutionModels, skipHealthChecks } = ctx.modePolicy

    // Step 1: Tier disabled?
    if (!allowedTiers.includes(this.tierId)) {
      ctx.traceBuilder.append({
        version: 1, requestId: ctx.request.id, timestamp: new Date(),
        type: 'SKILL_REJECTED', tierId: this.tierId, skillId: '',
        reason: 'TIER_DISABLED',
      })
      return undefined
    }

    // Step 2: Announce tier start
    ctx.traceBuilder.append({
      version: 1, requestId: ctx.request.id, timestamp: new Date(),
      type: 'TIER_STARTED', tierId: this.tierId,
    })

    // Step 3: Collect scored candidates
    const capabilities = this.catalog.getForTier(this.tierId)
    const candidates: Array<{ skill: Skill; score: SkillScore }> = []

    for (const cap of capabilities) {
      // Health check
      if (!skipHealthChecks && !this.catalog.isHealthy(cap.metadata.capabilityId)) {
        for (const skill of cap.skills) {
          ctx.traceBuilder.append({
            version: 1, requestId: ctx.request.id, timestamp: new Date(),
            type: 'SKILL_REJECTED', tierId: this.tierId,
            skillId: skill.metadata.skillId, reason: 'HEALTH_CHECK_FAILED',
          })
        }
        continue
      }

      for (const skill of cap.skills) {
        // ExecutionModel check
        if (!allowedExecutionModels.includes(skill.metadata.executionModel)) {
          ctx.traceBuilder.append({
            version: 1, requestId: ctx.request.id, timestamp: new Date(),
            type: 'SKILL_REJECTED', tierId: this.tierId,
            skillId: skill.metadata.skillId, reason: 'EXECUTION_MODEL_FORBIDDEN',
          })
          continue
        }

        // Provider resolvability check
        if (!this.resolver.isResolvable(skill.metadata.requirements, ctx)) {
          ctx.traceBuilder.append({
            version: 1, requestId: ctx.request.id, timestamp: new Date(),
            type: 'SKILL_REJECTED', tierId: this.tierId,
            skillId: skill.metadata.skillId, reason: 'PROVIDER_UNAVAILABLE',
          })
          continue
        }

        // Single-pass evaluate
        const evaluation = evaluateSkill(skill, ctx, this.ranking)
        if (!evaluation.matched) continue  // silent skip — no trace event

        // Emit SKILL_SCORED (score is defined when matched is true)
        const score = evaluation.score
        ctx.traceBuilder.append({
          version: 1, requestId: ctx.request.id, timestamp: new Date(),
          type: 'SKILL_SCORED', tierId: this.tierId,
          skillId: skill.metadata.skillId, score,
        })

        candidates.push({ skill, score })
      }
    }

    if (candidates.length === 0) return undefined

    // Step 4: Pick winner (highest finalScore)
    const winner = candidates.reduce((best, c) =>
      c.score.finalScore > best.score.finalScore ? c : best
    )

    // Step 5: Resolve providers (single call — single-resolution invariant)
    const resolvedProviders = await this.resolver.resolve(
      winner.skill.metadata.requirements,
      this.providerPolicy,
      ctx,
    )

    // Emit PROVIDER_RESOLVED for each resolved key
    for (const [requirementKey, resolution] of Object.entries(resolvedProviders)) {
      ctx.traceBuilder.append({
        version: 1, requestId: ctx.request.id, timestamp: new Date(),
        type: 'PROVIDER_RESOLVED',
        skillId: winner.skill.metadata.skillId,
        requirementKey,
        resolution,
      })
    }

    // Step 6: Emit SKILL_SELECTED
    ctx.traceBuilder.append({
      version: 1, requestId: ctx.request.id, timestamp: new Date(),
      type: 'SKILL_SELECTED', tierId: this.tierId,
      skillId: winner.skill.metadata.skillId, score: winner.score,
    })

    // Step 7: Return SelectedSkill
    return {
      skill: winner.skill,
      score: winner.score,
      resolvedProviders,
      estimatedCost: winner.skill.estimatedCost(ctx),
      tierId: this.tierId,
    }
  }
}
