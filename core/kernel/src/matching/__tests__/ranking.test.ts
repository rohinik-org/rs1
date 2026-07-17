import { describe, it, expect } from 'vitest'
import { IdentityRankingPolicy } from '../ranking.js'
import type { MatchResult } from '../matcher.js'
import type { Skill } from '../../interfaces/skill.js'
import type { ExecutionContext } from '../../domain/context.js'

const stubSkill = {
  metadata: {
    skillId: 'test.skill',
    name: 'Test',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
  },
} as unknown as Skill

const stubCtx = {} as unknown as ExecutionContext

describe('IdentityRankingPolicy', () => {
  it('rawConfidence becomes finalScore verbatim', () => {
    const policy = new IdentityRankingPolicy()
    const match: MatchResult = {
      matched: true,
      rawConfidence: 0.85,
      matcherId: 'keyword',
      explanation: { code: 'MATCH.KEYWORD', message: 'x' },
    }
    const score = policy.normalize(match, stubSkill, stubCtx)
    expect(score.finalScore).toBe(0.85)
    expect(score.skillId).toBe('test.skill')
    expect(score.components).toHaveLength(1)
    expect(score.components[0]!.id).toBe('rawConfidence')
    expect(score.components[0]!.value).toBe(0.85)
  })
})
