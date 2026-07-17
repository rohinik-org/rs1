import type { ExecutionRecord, LearningTrigger, LearningTriggerKind } from '@rohinik-org/compiler'

export interface EvidenceMonitor {
  readonly monitorId: string
  readonly triggerKind: LearningTriggerKind
  // Called once per new ExecutionRecord — updates running statistics.
  // Returns a LearningTrigger if a threshold is crossed, null otherwise.
  observe(record: ExecutionRecord): LearningTrigger | null
  // Reset accumulated state (e.g. after a LearningReport is produced for this skill)
  reset(skillId?: string): void
}
