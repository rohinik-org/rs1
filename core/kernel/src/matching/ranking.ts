import type { MatchResult } from './matcher.js'
import type { Skill, SkillScore } from '../interfaces/skill.js'
import type { ExecutionContext } from '../domain/context.js'

// RankingPolicy — normalizes matcher-local rawConfidence into a comparable
// SkillScore that the router uses to rank candidates.
//
// The router is the single authority on candidate ranking. Matchers report
// only their local view of confidence (KeywordMatcher: 1.0 on match;
// SemanticMatcher (future): 0.0–1.0 continuous). RankingPolicy is the seam
// where Stage 5's adaptive routing plugs in — cost weighting, latency,
// provider reliability, historical success — without touching a single
// matcher.
export interface RankingPolicy {
  normalize(match: MatchResult, skill: Skill, ctx: ExecutionContext): SkillScore
}

// Identity ranking: rawConfidence becomes finalScore, single component.
// The v1 policy. Preserves the existing scoring semantics of the standard
// library.
export class IdentityRankingPolicy implements RankingPolicy {
  normalize(match: MatchResult, skill: Skill, _ctx: ExecutionContext): SkillScore {
    return {
      skillId: skill.metadata.skillId,
      components: [
        { id: 'rawConfidence', value: match.rawConfidence, weight: 1.0 },
      ],
      finalScore: match.rawConfidence,
    }
  }
}

export const DEFAULT_RANKING_POLICY: RankingPolicy = new IdentityRankingPolicy()
