import type { ExecutionRecord } from '@rohinik-org/compiler'

export interface CorpusQuery {
  readonly skillId?: string
  readonly providerId?: string
  readonly tierId?: string
  readonly outcome?: ExecutionRecord['outcome']
  readonly reasoningInvoked?: boolean
  readonly dateStart?: string
  readonly dateEnd?: string
  readonly minLatencyMs?: number
  readonly maxLatencyMs?: number
  readonly maxCostUsd?: number
  readonly limit?: number
  readonly offset?: number
}

export interface CorpusStats {
  readonly total: number
  readonly successRate: number
  // Generic percentile map: { 50: 120, 90: 340, 95: 480, 99: 1200 }
  readonly latencyPercentiles: Readonly<Record<number, number>>
  readonly avgCostUsd?: number
  readonly reasoningInvokedRate: number
  readonly topSkills: readonly { skillId: string; count: number }[]
  readonly topProviders: readonly { providerId: string; count: number }[]
}
