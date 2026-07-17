import type { CapabilityHealth, CapabilityHealthStatus } from '../interfaces/capability.js'
import type { ExecutionOutcome } from '../domain/result.js'

interface HealthRecord {
  total: number
  successes: number
  consecutiveFailures: number
  lastFailure?: Date
  totalLatencyMs: number
}

export class InMemoryCapabilityHealthService {
  private records = new Map<string, HealthRecord>()

  private getRecord(capabilityId: string): HealthRecord {
    if (!this.records.has(capabilityId)) {
      this.records.set(capabilityId, { total: 0, successes: 0, consecutiveFailures: 0, totalLatencyMs: 0 })
    }
    return this.records.get(capabilityId)!
  }

  recordOutcome(capabilityId: string, outcome: ExecutionOutcome): void {
    const rec = this.getRecord(capabilityId)
    rec.total++
    rec.totalLatencyMs += outcome.metrics.durationMs
    if (outcome.status === 'SUCCESS') {
      rec.successes++
      rec.consecutiveFailures = 0
    } else {
      rec.consecutiveFailures++
      rec.lastFailure = new Date()
    }
  }

  getHealth(capabilityId: string): CapabilityHealth {
    const rec = this.getRecord(capabilityId)
    const successRate = rec.total === 0 ? 1.0 : rec.successes / rec.total
    const averageLatencyMs = rec.total === 0 ? 0 : rec.totalLatencyMs / rec.total

    let status: CapabilityHealthStatus = 'HEALTHY'
    if (rec.consecutiveFailures >= 5) status = 'UNAVAILABLE'
    else if (rec.consecutiveFailures >= 2) status = 'DEGRADED'

    return {
      capabilityId,
      status,
      successRate,
      averageLatencyMs,
      ...(rec.lastFailure !== undefined && { lastFailure: rec.lastFailure }),
      consecutiveFailures: rec.consecutiveFailures,
      enabled: true,
    }
  }
}
