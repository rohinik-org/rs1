import { describe, it, expect } from 'vitest'
import type { LearningTrigger } from '@rohinik-org/compiler'
import { LearningTriggerHandler } from '../trigger/learning-trigger-handler.js'

function makeTrigger(overrides: Partial<LearningTrigger> = {}): LearningTrigger {
  return {
    kind: 'LearningTrigger',
    schemaVersion: '1.0',
    triggerId: 'trig-abc',
    detectedAt: '2026-07-14T10:00:00.000Z',
    triggerKind: 'FAILURE_SPIKE',
    affectedSkillId: 'pdf.extract',
    evidence: { metric: 'failureRate', observedValue: 0.4, confidence: 0.9, confidenceMethod: 'EWMA', sampleSize: 100 },
    suggestedCommand: 'rhk learn pdf.extract',
    corpusWindowStart: '2026-07-01T00:00:00.000Z',
    corpusWindowEnd: '2026-07-14T00:00:00.000Z',
    recordCount: 100,
    ...overrides,
  }
}

describe('LearningTriggerHandler', () => {
  it('query carries triggerId', () => {
    const handler = new LearningTriggerHandler()
    const query = handler.handle(makeTrigger({ triggerId: 'my-trigger-id' }))
    expect(query.triggerId).toBe('my-trigger-id')
  })

  it('searchTerms include affectedSkillId', () => {
    const handler = new LearningTriggerHandler()
    const query = handler.handle(makeTrigger({ affectedSkillId: 'image.resize' }))
    expect(query.searchTerms).toContain('image.resize')
  })

  it('FAILURE_SPIKE adds failure-spike hint', () => {
    const handler = new LearningTriggerHandler()
    const query = handler.handle(makeTrigger({ triggerKind: 'FAILURE_SPIKE' }))
    expect(query.searchTerms).toContain('failure-spike')
  })

  it('null skillId produces generic query from kind', () => {
    const handler = new LearningTriggerHandler()
    const { affectedSkillId: _, ...base } = makeTrigger()
    const trigger = { ...base } as LearningTrigger
    const query = handler.handle(trigger)
    expect(query.searchTerms).not.toContain(undefined)
    expect(query.searchTerms.length).toBeGreaterThan(0)
  })

  it('producedAt is valid ISO string', () => {
    const handler = new LearningTriggerHandler()
    const query = handler.handle(makeTrigger())
    expect(new Date(query.producedAt).toISOString()).toBe(query.producedAt)
  })
})
