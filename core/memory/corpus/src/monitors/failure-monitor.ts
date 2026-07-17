import { randomUUID } from 'node:crypto'
import type { ExecutionRecord, LearningTrigger } from '@rohinik-org/compiler'
import type { EvidenceMonitor } from './evidence-monitor.js'

export interface FailureMonitorConfig {
  readonly failureRateThreshold: number
  readonly minSamples: number
}

export class FailureMonitor implements EvidenceMonitor {
  readonly monitorId = 'failure-monitor'
  readonly triggerKind = 'FAILURE_SPIKE' as const

  private total = 0
  private failed = 0
  private fired = false

  constructor(private readonly config: FailureMonitorConfig) {}

  observe(record: ExecutionRecord): LearningTrigger | null {
    if (this.fired) return null
    this.total++
    if (record.outcome === 'FAILED') this.failed++
    if (this.total < this.config.minSamples) return null

    const rate = this.failed / this.total
    if (rate < this.config.failureRateThreshold) return null

    this.fired = true
    const now = new Date().toISOString()
    return {
      kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: randomUUID(),
      detectedAt: now, triggerKind: 'FAILURE_SPIKE',
      ...(record.winnerSkillId !== undefined ? { affectedSkillId: record.winnerSkillId } : {}),
      evidence: {
        metric: 'failure_rate', observedValue: rate,
        confidence: Math.min(0.99, this.total / 20),
        confidenceMethod: 'MOVING_AVERAGE', sampleSize: this.total,
      },
      suggestedCommand: record.winnerSkillId ? `aios learn ${record.winnerSkillId}` : 'rhk learn',
      corpusWindowStart: record.timestamp, corpusWindowEnd: now, recordCount: this.total,
    }
  }

  reset(_skillId?: string): void { this.total = 0; this.failed = 0; this.fired = false }
}
