// ─── Schema version ───────────────────────────────────────────────────────────
export const PACKAGE_MANIFEST_SCHEMA_VERSION = 'rohinik.package/v1' as const
export type PackageManifestSchemaVersion = typeof PACKAGE_MANIFEST_SCHEMA_VERSION

// ─── Identifier patterns ──────────────────────────────────────────────────────
export const PACKAGE_ID_PATTERN = /^[a-z]([a-z0-9]*(-[a-z0-9]+)*)(\.[a-z]([a-z0-9]*(-[a-z0-9]+)*))+$/
export const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/

// ─── Package types ────────────────────────────────────────────────────────────
export type RohinikPackageType =
  | 'capability-provider'
  | 'capability-composite'
  | 'adapter'
  | 'infrastructure-provider'
  | 'model-provider'
  | 'developer-tooling'

export type PublisherCertification = 'official' | 'verified' | 'compatible' | 'none'

// ─── Error codes ──────────────────────────────────────────────────────────────
export type PackageManifestErrorCode =
  | 'invalid-input'
  | 'unsupported-schema'
  | 'validation-failed'
  | 'conformance-failed'
  | 'blocked'
  | 'unavailable'
  | 'integrity-failed'
  | 'signature-failed'
  | 'authorization-required'
  | 'internal-failure'

export interface ManifestValidationIssue {
  readonly severity: 'error' | 'warning'
  readonly code: PackageManifestErrorCode
  readonly message: string
  readonly path?: string
}

// ─── Package declaration ──────────────────────────────────────────────────────
export interface PackageDeclaration {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly type: RohinikPackageType
  readonly description?: string
  readonly license?: string
  readonly homepage?: string
  readonly repository?: string
}

// ─── Publisher declaration ────────────────────────────────────────────────────
export interface PublisherDeclaration {
  readonly id: string
  readonly certification: PublisherCertification
  readonly url?: string
}

// ─── Runtime declaration ──────────────────────────────────────────────────────
export interface RuntimeDeclaration {
  readonly language: string
  readonly languageVersion?: string
  readonly entrypoint?: string
}

// ─── Capability declarations ──────────────────────────────────────────────────
export interface ProvidedCapabilityDeclaration {
  readonly capability: string
  readonly version: string
  readonly description?: string
  readonly deprecated?: boolean
}

export interface ConsumedCapabilityDeclaration {
  readonly capability: string
  readonly versionRange: string
  readonly optional?: boolean
}

// ─── Dependencies ─────────────────────────────────────────────────────────────
export interface NpmDependencyDeclaration {
  readonly name: string
  readonly version: string
  readonly optional?: boolean
}

export interface DependencyDeclarations {
  readonly rohinik?: readonly string[]
  readonly npm?: readonly NpmDependencyDeclaration[]
}

// ─── Configuration ────────────────────────────────────────────────────────────
export interface SecretDeclaration {
  readonly name: string
  readonly required: boolean
  readonly description?: string
}

export interface EnvironmentVariableDeclaration {
  readonly name: string
  readonly required: boolean
  readonly default?: string
  readonly description?: string
}

export interface ConfigurationDeclarations {
  readonly secrets?: readonly SecretDeclaration[]
  readonly environment?: readonly EnvironmentVariableDeclaration[]
}

// ─── Permissions ──────────────────────────────────────────────────────────────
export interface NetworkAccessRule {
  readonly host: string
  readonly protocols: readonly string[]
  readonly ports?: readonly number[]
}

export interface NetworkPermissions {
  readonly outbound?: readonly NetworkAccessRule[]
  readonly inbound?: readonly NetworkAccessRule[]
}

export interface SecretsPermissions {
  readonly consume?: readonly string[]
}

export interface CapabilityPermissions {
  readonly consume?: readonly string[]
  readonly provide?: readonly string[]
}

export interface FilesystemPermissions {
  readonly paths?: readonly string[]
  readonly modes?: readonly ('read' | 'write' | 'execute')[]
}

export interface PermissionDeclarations {
  readonly network?: NetworkPermissions
  readonly secrets?: SecretsPermissions
  readonly capabilities?: CapabilityPermissions
  readonly filesystem?: FilesystemPermissions
}

// ─── Health ───────────────────────────────────────────────────────────────────
export interface HealthDeclaration {
  readonly startup?: string
  readonly readiness?: string
  readonly liveness?: string
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
export interface LifecycleDeclaration {
  readonly idempotentShutdown?: boolean
  readonly gracefulShutdownTimeoutMs?: number
}

// ─── Top-level manifest ───────────────────────────────────────────────────────
export interface RohinikPackageManifestV1 {
  readonly schemaVersion: 'rohinik.package/v1'
  readonly package: PackageDeclaration
  readonly publisher?: PublisherDeclaration
  readonly runtime?: RuntimeDeclaration
  readonly provides?: readonly ProvidedCapabilityDeclaration[]
  readonly consumes?: readonly ConsumedCapabilityDeclaration[]
  readonly dependencies?: DependencyDeclarations
  readonly configuration?: ConfigurationDeclarations
  readonly permissions?: PermissionDeclarations
  readonly health?: HealthDeclaration
  readonly lifecycle?: LifecycleDeclaration
  readonly metadata?: Record<string, string>
}

// ─── Parse result ─────────────────────────────────────────────────────────────
export type PackageManifestParseResult =
  | { readonly success: true; readonly manifest: RohinikPackageManifestV1 }
  | { readonly success: false; readonly issues: readonly ManifestValidationIssue[] }
