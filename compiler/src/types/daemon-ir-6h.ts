export interface RuntimeSession {
  readonly sessionId: string
  readonly startedAt: string
  readonly version: string
  readonly runtimeDirectory: string
}

export type ServiceState = 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED'

export interface ServiceStatus {
  readonly serviceId: string
  readonly state: ServiceState
  readonly startedAt?: string
  readonly uptimeMs: number
}

export interface RuntimeHealth {
  readonly sessionId: string
  readonly services: readonly ServiceStatus[]
  readonly cpuPercent: number
  readonly memoryBytes: number
  readonly activeExecutions: number
}

export type RuntimeCommandType =
  | 'PLAN' | 'EXECUTE' | 'OBSERVE' | 'ACQUIRE'
  | 'REFLECT' | 'STATUS' | 'SHUTDOWN'

export interface RuntimeCommand {
  readonly requestId: string
  readonly type: RuntimeCommandType
  readonly payload: unknown
}

export interface RuntimeResponse {
  readonly requestId: string
  readonly success: boolean
  readonly payload: unknown
  readonly error?: string
}

export interface DaemonPolicy {
  readonly gracefulShutdownTimeoutMs: number
  readonly serviceRestartOnFailure: boolean
  readonly maxRestartAttempts: number
  readonly criticalServices: readonly string[]
}

export const DEFAULT_DAEMON_POLICY: DaemonPolicy = {
  gracefulShutdownTimeoutMs: 10_000,
  serviceRestartOnFailure: true,
  maxRestartAttempts: 3,
  criticalServices: ['memory', 'executor'],
}
