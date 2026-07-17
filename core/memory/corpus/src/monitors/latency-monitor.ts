import { randomUUID } from 'node:crypto'
import type { ExecutionRecord, LearningTrigger } from '@rohinik-org/compiler'
import type { EvidenceMonitor } from './evidence-monitor.js'

export interface LatencyMonitorConfig {
  readonly deviationThresholdPercent: number
  readonly minSamples: number
}

export class LatencyMonitor implements EvidenceMonitor {
  readonly monitorId = 'latency-monitor'
  readonly triggerKind = 'LATENCY_REGRESSION' as const

  private count = 0
  private mean = 0
  private M2 = 0
  private fired = false

  constructor(private readonly config: LatencyMonitorConfig) {}

  observe(record: ExecutionRecord): LearningTrigger | null {
    if (this.fired) return null

    const x = record.totalLatencyMs
    this.count++

    // Welford's online mean+variance update
    const delta = x - this.mean
    this.mean += delta / this.count
    const delta2 = x - this.mean
    this.M2 += delta * delta2

    if (this.count < this.config.minSamples) return null

    const baseline = this.mean
    const deviationPct = ((x - baseline) / Math.max(1, baseline)) * 100
    if (deviationPct < this.config.deviationThresholdPercent) return null

    this.fired = true
    const now = new Date().toISOString()
    return {
      kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: randomUUID(),
      detectedAt: now, triggerKind: 'LATENCY_REGRESSION',
      ...(record.winnerSkillId !== undefined ? { affectedSkillId: record.winnerSkillId } : {}),
      evidence: {
        metric: 'p95_latency_ms', observedValue: x, baselineValue: baseline,
        deviationPercent: deviationPct, confidence: Math.min(0.99, this.count / 100),
        confidenceMethod: 'WELFORD', sampleSize: this.count,
      },
      suggestedCommand: record.winnerSkillId ? `aios learn ${record.winnerSkillId}` : 'rhk learn',
      corpusWindowStart: record.timestamp, corpusWindowEnd: now, recordCount: this.count,
    }
  }

  reset(_skillId?: string): void {
    this.count = 0; this.mean = 0; this.M2 = 0; this.fired = false
  }
}
