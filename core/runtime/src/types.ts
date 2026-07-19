export type RuntimeHostState =
  | 'CREATED'
  | 'INITIALIZING'
  | 'BOOTSTRAPPING'
  | 'READY'
  | 'DEGRADED'
  | 'STOPPING'
  | 'STOPPED'
  | 'FAILED'

export type RuntimeHostEvent =
  | 'runtime:ready'
  | 'runtime:stopping'
  | 'runtime:stopped'
  | 'runtime:degraded'

export interface RuntimeProviderConfig {
  readonly apiKey?: string
  readonly baseUrl?: string
}

export interface ResolvedConfig {
  readonly configPath: string
  readonly runtimeId: string
  readonly runtime: {
    readonly routing: {
      readonly mode: 'strict' | 'fast' | 'balanced' | 'quality'
      readonly explain: boolean
      readonly traceBuffer: number
    }
    readonly resources: {
      readonly maxConcurrentRequests: number
      readonly timeoutMs: number
    }
    readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
  }
  readonly extensions: {
    readonly paths: string[]
  }
  readonly providers: Record<string, RuntimeProviderConfig>
  readonly server: {
    readonly port: number
    readonly host: string
  }
}
