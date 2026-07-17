import { randomUUID } from 'node:crypto'
import type { ExecutionRecord, LearningTrigger } from '@rohinik-org/compiler'
import type { EvidenceMonitor } from './evidence-monitor.js'

export interface CostMonitorConfig {
  readonly deviationThresholdPercent: number
  readonly minSamples: number
}

export class CostMonitor implements EvidenceMonitor {
  readonly monitorId = 'cost-monitor'
  readonly triggerKind = 'COST_ANOMALY' as const

  private count = 0
  private mean = 0
  private M2 = 0
  private fired = false

  constructor(private readonly config: CostMonitorConfig) {}

  observe(record: ExecutionRecord): LearningTrigger | null {
    if (this.fired || record.estimatedCostUsd === undefined) return null

    const x = record.estimatedCostUsd
    this.count++
    const delta = x - this.mean
    this.mean += delta / this.count
    this.M2 += delta * (x - this.mean)

    if (this.count < this.config.minSamples) return null

    const deviationPct = ((x - this.mean) / Math.max(0.000001, this.mean)) * 100
    if (deviationPct < this.config.deviationThresholdPercent) return null

    this.fired = true
    const now = new Date().toISOString()
    return {
      kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: randomUUID(),
      detectedAt: now, triggerKind: 'COST_ANOMALY',
      ...(record.winnerSkillId !== undefined ? { affectedSkillId: record.winnerSkillId } : {}),
      evidence: {
        metric: 'cost_usd', observedValue: x, baselineValue: this.mean,
        deviationPercent: deviationPct, confidence: Math.min(0.99, this.count / 50),
        confidenceMethod: 'WELFORD', sampleSize: this.count,
      },
      suggestedCommand: record.winnerSkillId ? `aios learn ${record.winnerSkillId}` : 'rhk learn',
      corpusWindowStart: record.timestamp, corpusWindowEnd: now, recordCount: this.count,
    }
  }

  reset(_skillId?: string): void { this.count = 0; this.mean = 0; this.M2 = 0; this.fired = false }
}
