import type { RuntimeIdentity } from '@rohinik-org/runtime-state'

export type TransportType = 'IPC' | 'HTTP'
export type InteractionType = 'command' | 'conversation' | 'system' | 'event'

export interface InteractionContext {
  readonly sessionId: string
  readonly workspaceId: string
  readonly adapterId: string
  readonly transport: TransportType
  readonly interactive: boolean
  readonly cwd: string
  readonly locale: string
  readonly identity: RuntimeIdentity
  readonly requestNumber: number
  readonly timestamp: Date
}

export interface RuntimeInteractionRequest {
  readonly id: string
  readonly sessionId: string
  readonly workspaceId: string
  readonly input: string
  readonly type: InteractionType
  readonly context: InteractionContext
}

export interface RuntimeEvent {
  readonly type: string
  readonly payload: unknown
  readonly timestamp: Date
}

export interface RuntimeInteractionResponse {
  readonly executionId: string
  readonly output: string
  readonly events: ReadonlyArray<RuntimeEvent>
  readonly metadata: Record<string, unknown>
  readonly durationMs: number
}

export interface IpcEnvelope {
  readonly protocol: 1
  readonly type: 'request' | 'response' | 'event' | 'cancel' | 'ping' | 'pong' | 'error'
  readonly payload: unknown
}

export interface InteractionAdapter {
  readonly id: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  nextRequest(): Promise<RuntimeInteractionRequest>
}

export interface Transport {
  readonly type: TransportType
  send(request: RuntimeInteractionRequest): Promise<RuntimeInteractionResponse>
  close(): Promise<void>
}
