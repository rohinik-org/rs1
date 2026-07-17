import { randomUUID } from 'node:crypto'
import type { LearningTrigger, Goal } from '@rohinik-org/compiler'

export class TriggerRouter {
  route(trigger: LearningTrigger): Goal {
    const now = new Date().toISOString()
    return {
      kind: 'Goal',
      schemaVersion: '1.0',
      goalId: randomUUID(),
      origin: 'OBSERVATION',
      priority: 50,
      intent: {
        intentId: randomUUID(),
        schemaVersion: '1.0',
        rawInput: trigger.suggestedCommand,
        concepts: [trigger.triggerKind.toLowerCase()],
        preferredSkills: [],
        constraints: {},
        translatedBy: 'TriggerRouter',
        translationConfidence: trigger.evidence.confidence,
        unresolvedTerms: [],
      },
      triggerRef: trigger.triggerId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    }
  }
}
