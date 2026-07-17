export type ExecutionEnvironment = 'SHELL' | 'FILESYSTEM' | 'NETWORK' | 'GPU' | 'BROWSER' | 'MEMORY_STORE'

export type ProviderCapabilityType =
  | 'PYTHON_RUNTIME'
  | 'CONTAINER_RUNTIME'
  | 'REASONING_ENGINE'
  | 'BROWSER_ENGINE'
  | 'STORAGE_ENGINE'
  | 'SHELL_RUNTIME'

export interface ProviderMetadata {
  readonly providerId: string
  readonly name: string
  readonly environments: readonly ExecutionEnvironment[]
  readonly capabilities: readonly ProviderCapabilityType[]
  readonly version: string
}

export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'

export interface ProviderHealth {
  readonly status: ProviderHealthStatus
  readonly latencyMs?: number
  readonly message?: string
}

export interface Provider {
  readonly metadata: ProviderMetadata
  isAvailable(): Promise<boolean>
  health(): Promise<ProviderHealth>
}
