import type { Skill } from '../interfaces/skill.js'
import type { SkillScore } from '../interfaces/skill.js'
import type { ResolvedProviders } from '../interfaces/resolver.js'
import type { ResourceCost } from './cost.js'
import type { TierId } from '../interfaces/tier.js'

export interface SelectedSkill {
  readonly skill: Skill
  readonly score: SkillScore
  readonly resolvedProviders: ResolvedProviders
  readonly estimatedCost: ResourceCost
  readonly tierId: TierId
}
