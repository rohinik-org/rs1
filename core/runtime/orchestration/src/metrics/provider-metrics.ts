export interface ProviderStats {
  readonly providerId: string
  readonly callCount: number
  readonly successRate: number
  readonly avgLatencyMs: number
  readonly avgCostUsd: number
}

interface Record {
  success: boolean
  latencyMs: number
  costUsd: number
}

export class ProviderMetrics {
  private readonly records: Map<string, Record[]> = new Map()

  record(providerId: string, success: boolean, latencyMs: number, costUsd = 0): void {
    if (!this.records.has(providerId)) this.records.set(providerId, [])
    this.records.get(providerId)!.push({ success, latencyMs, costUsd })
  }

  stats(providerId: string): ProviderStats {
    const entries = this.records.get(providerId) ?? []
    if (entries.length === 0) {
      return { providerId, callCount: 0, successRate: 0, avgLatencyMs: 0, avgCostUsd: 0 }
    }
    const callCount = entries.length
    const successRate = entries.filter(r => r.success).length / callCount
    const avgLatencyMs = entries.reduce((s, r) => s + r.latencyMs, 0) / callCount
    const avgCostUsd = entries.reduce((s, r) => s + r.costUsd, 0) / callCount
    return { providerId, callCount, successRate, avgLatencyMs, avgCostUsd }
  }
}
