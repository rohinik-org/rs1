import type { DecisionTrace } from '@rohinik-org/kernel'

export interface ServerConfig {
  readonly port: number
  readonly host: string
}

export interface ExecuteRequestBody {
  readonly requestId?: string
  readonly content: string
  readonly contentType: string
  readonly intentHint?: string
  readonly context?: Record<string, unknown>
  readonly constraints?: {
    readonly allowReasoning?: boolean
    readonly mode?: string
  }
}

export interface ExecuteResponse {
  readonly requestId: string
  readonly output: unknown
  readonly skillId: string
  readonly tierId?: string
  readonly reasoningInvoked: boolean
  readonly confidence: number
  readonly executionTimeMs: number
  readonly resourceCost: unknown
  readonly explanation: string
}

export interface SimulateResponse {
  readonly requestId: string
  readonly wouldRoute: boolean
  readonly selectedTier?: string
  readonly selectedSkill?: string
  readonly confidence: number
  readonly estimatedCost: unknown
  readonly estimatedLatencyMs: number
  readonly reasoningWouldBeInvoked: boolean
  readonly candidatesConsidered: Array<{ skillId: string; tierId: string; score: number }>
}

export interface StoredDecision {
  readonly requestId: string
  readonly trace: DecisionTrace
  readonly timestamp: Date
}
