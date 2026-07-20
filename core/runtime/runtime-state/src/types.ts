export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface RuntimeIdentity {
  readonly runtimeId: string
  readonly version: string
  readonly assistantName?: string
  readonly organization?: string
}

export interface RuntimeEnvironment {
  readonly cwd: string
  readonly variables: Record<string, string>
  readonly aliases: Record<string, string>
  readonly activeProvider?: string
  readonly activeProfile?: string
}

export interface RuntimeSession {
  readonly id: string
  readonly workspaceId: string
  readonly adapterId: string
  readonly startedAt: Date
  readonly environment: RuntimeEnvironment
}

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly mountedProjects: ReadonlyArray<string>
  readonly variables: Record<string, string>
  readonly createdAt: Date
  readonly lastOpenedAt: Date
}

export interface BackgroundJob {
  readonly id: string
  readonly sessionId: string
  readonly type: string
  readonly description: string
  readonly status: JobStatus
  readonly progress?: number
  readonly createdAt: Date
  readonly completedAt?: Date
  readonly result?: unknown
}

export interface InteractionHistoryEntry {
  readonly requestNumber: number
  readonly sessionId: string
  readonly workspaceId: string
  readonly adapterId: string
  readonly input: string
  readonly output: string
  readonly durationMs: number
  readonly timestamp: Date
}
