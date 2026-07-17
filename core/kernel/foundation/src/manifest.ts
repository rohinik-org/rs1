export type ManifestType =
  | 'capability'
  | 'provider'
  | 'memory'
  | 'policy'
  | 'telemetry'
  | 'scheduler'
  | 'ui'

export type ManifestCompatibility = 'stable' | 'experimental' | 'deprecated'

export interface ManifestCapabilityDep {
  readonly id: string
  readonly contractVersion: string
}

export interface AiosManifest {
  readonly schemaVersion: string
  readonly runtimeVersion: string
  readonly type: ManifestType
  readonly compatibility: ManifestCompatibility
  readonly id: string
  readonly name: string
  readonly version: string
  readonly contractVersion: string
  readonly entry: string
  readonly requiresProviders?: readonly string[]
  readonly requiresCapabilities?: readonly ManifestCapabilityDep[]
  readonly requiresFeatures?: readonly string[]
  readonly skills?: readonly string[]
  readonly permissions?: readonly string[]
}
