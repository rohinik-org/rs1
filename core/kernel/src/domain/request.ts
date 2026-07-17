import type { RuntimeMode } from './mode.js'

export type ContentType = 'TEXT' | 'JSON' | 'CSV' | 'FILE' | 'IMAGE' | 'AUDIO'

export interface ExecutionBudget {
  readonly maxTokens?: number
  readonly maxCostUsd?: number
  readonly maxLatencyMs?: number
  readonly maxRetries: number
  readonly allowReasoning: boolean
  readonly allowNetwork: boolean
  readonly allowDisk: boolean
  readonly mode: RuntimeMode
}

export interface RoutingRequest {
  readonly id: string
  readonly content: string
  readonly contentType: ContentType
  readonly intentHint?: string
  readonly context: Readonly<Record<string, unknown>>
  readonly metadata: Readonly<Record<string, unknown>>
  readonly constraints: ExecutionBudget
  readonly timestamp: Date
}

export const DEFAULT_BUDGET: ExecutionBudget = {
  maxRetries: 3,
  allowReasoning: true,
  allowNetwork: true,
  allowDisk: true,
  mode: 'BALANCED',
}
