// @rohinik-org/application-manifest-ir
// Stage 9F IR — zero runtime dependencies

import type {
  CapabilityId,
  ApplicationId,
  CapabilityMultiplicity,
} from '@rohinik-org/capability-ir'
import type {
  CapabilityConstraint,
  IsoTimestamp,
} from '@rohinik-org/capability-contracts-ir'

export type { CapabilityId, ApplicationId, CapabilityMultiplicity, CapabilityConstraint, IsoTimestamp }

// ── Branded IDs ──────────────────────────────────────────────────────────────

export type ApplicationManifestSourceHash   = string & { readonly __brand: 'ApplicationManifestSourceHash' }
export type ApplicationManifestSemanticHash = string & { readonly __brand: 'ApplicationManifestSemanticHash' }
export type CapabilityDeclarationPath       = string & { readonly __brand: 'CapabilityDeclarationPath' }

export function toApplicationManifestSourceHash(raw: string): ApplicationManifestSourceHash {
  if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error('ApplicationManifestSourceHash must be 64-char hex')
  return raw as ApplicationManifestSourceHash
}

export function toApplicationManifestSemanticHash(raw: string): ApplicationManifestSemanticHash {
  if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error('ApplicationManifestSemanticHash must be 64-char hex')
  return raw as ApplicationManifestSemanticHash
}

// ── Schema version ───────────────────────────────────────────────────────────

export const MANIFEST_SCHEMA_VERSION = 'rohinik.application/v1' as const
export type ManifestSchemaVersion = typeof MANIFEST_SCHEMA_VERSION

// ── Application declaration ──────────────────────────────────────────────────

// reverse-domain pattern: e.g. com.example.my-app
export const APPLICATION_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/

export interface ApplicationDeclaration {
  readonly id: ApplicationId
  readonly name: string
  readonly version: string   // validated semver
}

// ── Runtime declaration ──────────────────────────────────────────────────────

export interface ApplicationRuntimeDeclaration {
  readonly language: string
  readonly languageVersion?: string
  readonly entrypoint?: string
}

// ── Dependency management ────────────────────────────────────────────────────

export type DependencyManagementMode = 'managed' | 'observed' | 'immutable'

export interface DependencyManagementDeclaration {
  readonly mode: DependencyManagementMode
}

// ── Resolution config ────────────────────────────────────────────────────────

export interface ResolutionConfig {
  readonly allowMarketplace: boolean
  readonly allowExternalRegistries: boolean
  readonly allowLocalPackages: boolean
}

// ── Degradation config ────────────────────────────────────────────────────────

export interface DegradationConfig {
  readonly allowOptionalCapabilityFailure: boolean
}

// ── Capability declarations ──────────────────────────────────────────────────

export type CapabilityNecessity = 'required' | 'optional'

export interface ManifestCapabilityDeclaration {
  readonly capabilityId: CapabilityId
  readonly versionRange: string
  readonly necessity: CapabilityNecessity
  readonly multiplicity: CapabilityMultiplicity
  readonly constraints: readonly CapabilityConstraint[]
  readonly declarationPath: CapabilityDeclarationPath
}

export interface ApplicationCapabilityDeclarations {
  readonly required: readonly ManifestCapabilityDeclaration[]
  readonly optional: readonly ManifestCapabilityDeclaration[]
}

// ── Canonical manifest ───────────────────────────────────────────────────────

export interface ApplicationManifest {
  readonly schemaVersion: ManifestSchemaVersion
  readonly application: ApplicationDeclaration
  readonly runtime: ApplicationRuntimeDeclaration
  readonly capabilities: ApplicationCapabilityDeclarations
  readonly dependencyManagement: DependencyManagementDeclaration
  readonly resolution: ResolutionConfig
  readonly degradation: DegradationConfig
  readonly sourceHash: ApplicationManifestSourceHash
  readonly semanticHash: ApplicationManifestSemanticHash
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export type ManifestDiagnosticSeverity = 'error' | 'warning' | 'info'

export interface SourceRange {
  readonly line: number
  readonly column: number
}

// Exhaustive diagnostic code union — no open string
export type ManifestDiagnosticCode =
  | 'YAML_PARSE_ERROR'
  | 'INVALID_ROOT_TYPE'
  | 'UNKNOWN_TOP_LEVEL_KEY'
  | 'UNKNOWN_CAPABILITIES_KEY'
  | 'MISSING_SCHEMA_VERSION'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_APPLICATION'
  | 'UNKNOWN_APPLICATION_KEY'
  | 'MISSING_APPLICATION_ID'
  | 'INVALID_APPLICATION_ID'
  | 'MISSING_APPLICATION_NAME'
  | 'MISSING_APPLICATION_VERSION'
  | 'INVALID_APPLICATION_VERSION'
  | 'MISSING_RUNTIME'
  | 'UNKNOWN_RUNTIME_KEY'
  | 'MISSING_RUNTIME_LANGUAGE'
  | 'MISSING_CAPABILITIES'
  | 'CAPABILITIES_REQUIRED_NOT_ARRAY'
  | 'CAPABILITIES_OPTIONAL_NOT_ARRAY'
  | 'CAPABILITY_NOT_OBJECT'
  | 'UNKNOWN_CAPABILITY_KEY'
  | 'MISSING_CAPABILITY_ID'
  | 'INVALID_CAPABILITY_ID'
  | 'MISSING_CAPABILITY_VERSION'
  | 'INVALID_VERSION_RANGE'
  | 'INVALID_MULTIPLICITY'
  | 'DUPLICATE_CAPABILITY_ID'
  | 'MISSING_DEPENDENCY_MANAGEMENT'
  | 'UNKNOWN_DEPENDENCY_MANAGEMENT_KEY'
  | 'INVALID_DEPENDENCY_MANAGEMENT_MODE'
  | 'MISSING_RESOLUTION'
  | 'UNKNOWN_RESOLUTION_KEY'
  | 'INVALID_RESOLUTION_FIELD'
  | 'MISSING_DEGRADATION'
  | 'UNKNOWN_DEGRADATION_KEY'
  | 'INVALID_DEGRADATION_FIELD'
  | 'CONSTRAINTS_NOT_OBJECT'
  | 'UNKNOWN_CONSTRAINT_KEY'
  | 'INVALID_CONSTRAINT_VALUE'
  | 'CONTRADICTORY_CONSTRAINTS'
  | 'REQUIREMENT_COMPILATION_FAILED'
  | 'REQUIREMENT_MAPPING_FAILED'
  | 'INVALID_CAPABILITY_USAGE_LITERAL'
  | 'INVALID_RUNTIME_FIELD'
  | 'SOURCE_SCAN_PARSE_FAILED'
  | 'UNDECLARED_CAPABILITY_USAGE'
  | 'DYNAMIC_CAPABILITY_USAGE'

export interface ApplicationManifestDiagnostic {
  readonly code: ManifestDiagnosticCode
  readonly severity: ManifestDiagnosticSeverity
  readonly message: string
  readonly path?: string
  readonly range?: SourceRange
}

// ── Parse result ─────────────────────────────────────────────────────────────

export type ApplicationManifestParseResult =
  | {
      readonly status: 'valid'
      readonly manifest: ApplicationManifest
      readonly diagnostics: readonly ApplicationManifestDiagnostic[]
    }
  | {
      readonly status: 'invalid'
      readonly diagnostics: readonly ApplicationManifestDiagnostic[]
    }

export interface ApplicationManifestParser {
  parse(yamlSource: string): ApplicationManifestParseResult
}

// ── Declaration map (for Part 2 compiler traceability) ──────────────────────

export interface CapabilityDeclarationMapEntry {
  readonly requirementId: string
  readonly capabilityId: CapabilityId
  readonly declarationPath: CapabilityDeclarationPath
  readonly declarationIndex: number
  readonly necessity: CapabilityNecessity
}
export type CapabilityDeclarationMap = readonly CapabilityDeclarationMapEntry[]
