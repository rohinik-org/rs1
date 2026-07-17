import { randomUUID } from 'node:crypto'
import type { ExecutionRecord, LearningTrigger } from '@rohinik-org/compiler'
import type { EvidenceMonitor } from './evidence-monitor.js'

export interface VolumeMonitorConfig {
  readonly minVolume: number
}

export class VolumeMonitor implements EvidenceMonitor {
  readonly monitorId = 'volume-monitor'
  readonly triggerKind = 'VOLUME_THRESHOLD' as const

  private readonly skillCounts = new Map<string, number>()
  private readonly fired = new Set<string>()

  constructor(private readonly config: VolumeMonitorConfig) {}

  observe(record: ExecutionRecord): LearningTrigger | null {
    const skillId = record.winnerSkillId
    if (!skillId) return null
    if (this.fired.has(skillId)) return null

    const count = (this.skillCounts.get(skillId) ?? 0) + 1
    this.skillCounts.set(skillId, count)

    if (count < this.config.minVolume) return null

    this.fired.add(skillId)
    const now = new Date().toISOString()
    return {
      kind: 'LearningTrigger',
      schemaVersion: '1.0',
      triggerId: randomUUID(),
      detectedAt: now,
      triggerKind: 'VOLUME_THRESHOLD',
      affectedSkillId: skillId,
      evidence: {
        metric: 'execution_count',
        observedValue: count,
        confidence: 0.99,
        confidenceMethod: 'WELFORD',
        sampleSize: count,
      },
      suggestedCommand: `aios learn ${skillId}`,
      corpusWindowStart: record.timestamp,
      corpusWindowEnd: now,
      recordCount: count,
    }
  }

  reset(skillId?: string): void {
    if (skillId) {
      this.skillCounts.delete(skillId)
      this.fired.delete(skillId)
    } else {
      this.skillCounts.clear()
      this.fired.clear()
    }
  }
}
