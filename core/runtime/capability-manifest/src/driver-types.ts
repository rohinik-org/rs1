import type { DriverRawEvent } from './driver-raw-event.js'
import type { ExecutionContext } from './execution-context.js'
import type { JsonSerializable } from './driver-error.js'

export interface DriverCapabilities {
  readonly supportsStreaming: boolean
  readonly supportsCancellation: boolean
  readonly supportsProgress: boolean
  readonly supportsHealth: boolean
  readonly offline: boolean
  readonly sandboxed: boolean
  readonly trusted: boolean
  readonly extensions?: Record<string, unknown>
}

export interface DriverDescriptor {
  readonly id: string
  readonly version: string
  readonly apiVersion: number
  readonly priority: number
  readonly tags: ReadonlyArray<string>
  readonly capabilities: DriverCapabilities
}

export interface DriverHealth {
  readonly status: 'healthy' | 'degraded' | 'unavailable' | 'unknown'
  readonly message?: string
  readonly checkedAt: Date
  readonly details?: Record<string, unknown>
}

export interface DriverRequest {
  readonly capabilityId: string
  readonly input: unknown
  readonly context: ExecutionContext
}

export interface ExecutionDriver {
  readonly descriptor: DriverDescriptor
  execute(request: DriverRequest): AsyncIterable<DriverRawEvent>
  health(): Promise<DriverHealth>
  shutdown(): Promise<void>
}

export interface DriverBinding {
  readonly driver: ExecutionDriver
  readonly descriptor: DriverDescriptor
}

export interface ExecutionResult<T extends JsonSerializable = JsonSerializable> {
  readonly requestId: string
  readonly executionId: string
  readonly driverId: string
  readonly capabilityId: string
  readonly value: T | undefined
  readonly startedAt: Date
  readonly completedAt: Date
  readonly durationMs: number
}
