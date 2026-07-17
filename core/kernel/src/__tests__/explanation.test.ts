import { describe, it, expect } from 'vitest'
import { buildExplanation } from '../explanation.js'
import type { DecisionTrace } from '../domain/trace.js'

const makeTrace = (overrides: Partial<DecisionTrace> = {}): DecisionTrace => ({
  requestId: 'req-1',
  events: [],
  reasoningInvoked: false,
  ...overrides,
})

describe('buildExplanation', () => {
  it('returns no-match message when no winner', () => {
    const explanation = buildExplanation(makeTrace())
    expect(explanation).toContain('No skill matched')
  })

  it('includes winner tier and skill when present', () => {
    const explanation = buildExplanation(makeTrace({ winnerTierId: 'DETERMINISTIC', winnerSkillId: 'csv' }))
    expect(explanation).toContain('csv')
    expect(explanation).toContain('DETERMINISTIC')
  })

  it('mentions reasoning invoked when true', () => {
    const explanation = buildExplanation(makeTrace({
      winnerTierId: 'REASONING', winnerSkillId: 'llm-skill', reasoningInvoked: true,
    }))
    expect(explanation.toLowerCase()).toContain('reasoning')
  })

  it('mentions reasoning skipped when deterministic winner', () => {
    const explanation = buildExplanation(makeTrace({
      winnerTierId: 'DETERMINISTIC', winnerSkillId: 'csv', reasoningInvoked: false,
    }))
    expect(explanation.toLowerCase()).toContain('reasoning')
  })

  it('includes rejection counts from SKILL_REJECTED events', () => {
    const trace = makeTrace({
      winnerTierId: 'REASONING',
      winnerSkillId: 'llm',
      reasoningInvoked: true,
      events: [
        { version: 1, requestId: 'req-1', timestamp: new Date(), type: 'SKILL_REJECTED', tierId: 'DETERMINISTIC', skillId: 'csv', reason: 'PROVIDER_UNAVAILABLE' },
        { version: 1, requestId: 'req-1', timestamp: new Date(), type: 'SKILL_REJECTED', tierId: 'DETERMINISTIC', skillId: 'json', reason: 'EXECUTION_MODEL_FORBIDDEN' },
      ],
    })
    const explanation = buildExplanation(trace)
    expect(explanation).toContain('2')
  })

  it('includes score when SKILL_SELECTED event present', () => {
    const trace = makeTrace({
      winnerTierId: 'DETERMINISTIC',
      winnerSkillId: 'csv',
      reasoningInvoked: false,
      events: [
        {
          version: 1, requestId: 'req-1', timestamp: new Date(),
          type: 'SKILL_SELECTED', tierId: 'DETERMINISTIC', skillId: 'csv',
          score: { skillId: 'csv', components: [], finalScore: 0.87 },
        },
      ],
    })
    const explanation = buildExplanation(trace)
    expect(explanation).toContain('0.87')
  })
})
