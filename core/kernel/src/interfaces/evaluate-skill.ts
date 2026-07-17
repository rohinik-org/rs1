import type { Skill, SkillEvaluation } from './skill.js'
import type { ExecutionContext } from '../domain/context.js'
import type { RankingPolicy } from '../matching/ranking.js'

// evaluateSkill — the composition seam between Skill, Matcher, and Router.
//
// Flow:
//   1. If skill.metadata.matching?.matcher is present, delegate to it and
//      let the RankingPolicy normalize rawConfidence into a SkillScore.
//   2. Otherwise, fall through to the legacy skill.evaluate(ctx) method.
//
// This preserves backward compatibility (legacy skills still work) while
// letting migrated skills declare matching declaratively as data.
export function evaluateSkill(
  skill: Skill,
  ctx: ExecutionContext,
  ranking: RankingPolicy,
): SkillEvaluation {
  const matcher = skill.metadata.matching?.matcher
  if (matcher !== undefined) {
    const result = matcher.match(ctx.request)
    if (!result.matched) {
      return { matched: false, reason: result.explanation.message }
    }
    return {
      matched: true,
      score: ranking.normalize(result, skill, ctx),
      reason: result.explanation.message,
    }
  }
  if (skill.evaluate === undefined) {
    return {
      matched: false,
      reason: `Skill '${skill.metadata.skillId}' has neither matching.matcher nor evaluate()`,
    }
  }
  return skill.evaluate(ctx)
}
