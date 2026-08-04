export interface AdapterConfig {
  readonly endpoint?: string
  readonly credentials?: Record<string, string>
  readonly options?: Record<string, unknown>
}

export interface RawDiscoveryModel {
  readonly protocol: string
  readonly items: readonly unknown[]
  readonly metadata: Record<string, unknown>
}

export interface AdapterValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

export interface ExecutionBinding {
  readonly adapterId: string
  readonly capabilityId: string
  invoke(input: unknown): Promise<unknown>
}

export interface InstallSource {
  readonly scheme: string
  readonly location: string
}

export interface CapabilityAdapter {
  readonly id: string
  readonly protocol: string
  readonly version: string
  discover(config: AdapterConfig): Promise<RawDiscoveryModel>
  validate(raw: RawDiscoveryModel): AdapterValidationResult
}
