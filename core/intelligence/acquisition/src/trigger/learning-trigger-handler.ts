import { randomUUID } from 'node:crypto'
import type { LearningTrigger, CapabilityQuery } from '@rohinik-org/compiler'

export class LearningTriggerHandler {
  handle(trigger: LearningTrigger): CapabilityQuery {
    const searchTerms = trigger.affectedSkillId
      ? [trigger.affectedSkillId, trigger.triggerKind.toLowerCase().replace(/_/g, '-')]
      : [trigger.triggerKind.toLowerCase().replace(/_/g, '-')]

    return {
      queryId: randomUUID(),
      triggerId: trigger.triggerId,
      searchTerms,
      producedAt: new Date().toISOString(),
    }
  }
}
