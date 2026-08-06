export interface ExecuteRequest {
  requestId?: string
  content: string
  contentType: string
  intentHint?: string
  context?: Record<string, unknown>
  constraints?: { allowReasoning?: boolean }
}

export interface ExecuteResponse {
  requestId: string
  output: unknown
  skillId: string
  tierId?: string
  reasoningInvoked: boolean
  confidence: number | null
  executionTimeMs: number
  resourceCost: unknown
  explanation: string | null
}

export interface SimulateResponse {
  requestId: string
  wouldRoute: boolean
  selectedTier?: string
  selectedSkill?: string
  confidence: number
  estimatedCost: unknown
  estimatedLatencyMs: number
  reasoningWouldBeInvoked: boolean
  candidatesConsidered: Array<{ skillId: string; tierId: string; score: number }>
}

export interface HealthCheck {
  subsystem: string
  status: string
  data?: unknown
}

export interface HealthResponse {
  requestId: string
  status: string
  runtimeId: string
  state: string
  uptimeMs: number
  checks: HealthCheck[]
  timestamp: number
}

export interface DecisionResponse {
  requestId: string
  trace: unknown
}

export interface ExperienceResponse {
  requestId: string
  experience: unknown
}

export interface ApiErrorBody {
  code: string
  message: string
}

export class RohinikError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'RohinikError'
    this.code = code
    this.status = status
  }
}
