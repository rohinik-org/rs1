export type ApplicationStatus = 'INITIALIZING' | 'READY' | 'RUNNING' | 'SHUTTING_DOWN' | 'STOPPED' | 'FAILED'

export interface ApplicationOptions {
  readonly applicationId?: string
  readonly name?: string
  readonly version?: string
  readonly enableMemory?: boolean
  readonly enableReasoning?: boolean
  readonly enableReflection?: boolean
  readonly enableObservation?: boolean
  readonly enableCertification?: boolean
  readonly enableCluster?: boolean
}

export interface ApplicationContext {
  readonly applicationId: string
  readonly name: string
  readonly version: string
  readonly startedAt: string
  readonly status: ApplicationStatus
}

export interface ApplicationEvent {
  readonly eventId: string
  readonly applicationId: string
  readonly type: string
  readonly payload?: unknown
  readonly timestamp: string
}

export type ApplicationEventHandler = (event: ApplicationEvent) => void | Promise<void>

export interface ApplicationManifest {
  readonly applicationId: string
  readonly name: string
  readonly version: string
  readonly enabledCapabilities: readonly string[]
  readonly createdAt: string
}

export interface ApplicationDiagnostics {
  readonly applicationId: string
  readonly status: ApplicationStatus
  readonly uptime: number
  readonly enabledFacades: readonly string[]
  readonly generatedAt: string
}
