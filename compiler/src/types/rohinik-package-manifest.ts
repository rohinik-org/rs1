export type AiosPackageType =
  | 'adapter'
  | 'capability'
  | 'provider'
  | 'memory'
  | 'compiler-frontend'
  | 'shell'
  | 'benchmark-suite'
  | 'asset'
  | 'pack'

// Reserved: compiler frontend target roles (Phase 6+)
export type AiosCompilerTarget =
  | 'capability'
  | 'memory'
  | 'agent'
  | 'federation'
  | 'shell'
  | 'compiler-frontend'
  | 'benchmark'

export type RohiniKAssetType =
  | 'claude-skill'
  | 'cursor-rule'
  | 'gemini-gem'
  | 'copilot-instruction'
  | 'continue-config'
  | 'prompt-bundle'
  | 'generic-asset'

export interface PublisherInfo {
  readonly name: string
  readonly url?: string
  readonly email?: string
  readonly publicKey?: string
}

export interface PackageDependency {
  readonly id: string
  readonly version: string
  readonly optional?: boolean
}

export interface ComplianceDeclaration {
  readonly targetLevel: number
  readonly laws: readonly number[]
  readonly benchmarkSuites: readonly string[]
}

export interface TrustInfo {
  readonly publisher: PublisherInfo
  readonly signature?: string
  readonly contentHash?: string
  readonly signedAt?: string
}

export interface MarketplaceMetadata {
  readonly category: string
  readonly tags: readonly string[]
  readonly homepage?: string
  readonly repository?: string
  readonly keywords?: readonly string[]
}

export interface EnterprisePolicy {
  readonly allowedSources?: readonly string[]
  readonly blockedIds?: readonly string[]
  readonly requiredComplianceLevel?: number
  readonly requireSignature?: boolean
  readonly approvalRequired?: boolean
}

// Canonical v2.0 Rohinik Package Manifest.
// Supersedes rohinik-adapter.json (v1, adapter-specific).
// Every installable Rohinik component uses this format.
export interface RohiniKPackageManifest {
  readonly schemaVersion: '2.0'
  // Legacy npm-style id (e.g. '@org/name' or 'name'). Retained for backward compat.
  readonly id: string
  // Canonical globally-unique package identity: rohinik://publisher/name
  // Immutable — does not encode version, type, or transport.
  readonly packageId?: string
  readonly version: string
  readonly type: AiosPackageType
  // Reserved: declares which compiler target this package implements (Phase 6+).
  // Present only on 'compiler-frontend', 'memory', or 'shell' packages.
  readonly compilerTarget?: AiosCompilerTarget
  // Stage 4H: declared asset type for Layer 1 manifest detection (optional — never required)
  readonly assetType?: RohiniKAssetType
  readonly name: string
  readonly description: string
  readonly author?: PublisherInfo
  readonly license?: string
  readonly minimumRuntime: string
  readonly minimumSdk: string
  readonly dependencies?: readonly PackageDependency[]
  readonly permissions?: readonly string[]
  readonly compliance?: ComplianceDeclaration
  readonly trust?: TrustInfo
  readonly marketplace?: MarketplaceMetadata
  readonly enterprise?: EnterprisePolicy
}

// Internal resolution concept: stable identity + pinned version + install source.
// Used by SourceResolvers and LifecycleManager; never persisted directly.
export interface PackageCoordinate {
  readonly packageId: string   // rohinik://publisher/name
  readonly version: string     // pinned semver
  readonly source: { readonly scheme: string; readonly location: string }
}

export interface PackContentsEntry {
  readonly packageId: string    // rohinik://publisher/name
  readonly version: string      // semver range e.g. '>=1.0.0'
  readonly optional?: boolean
}

export interface PackCurriculum {
  readonly objective: string
  readonly demonstrates: readonly string[]
}

// A Pack is a distribution artifact — declares installation composition only.
// Packs define composition; Memory defines meaning.
export interface RohiniKPackManifest extends RohiniKPackageManifest {
  readonly type: 'pack'
  readonly contents: readonly PackContentsEntry[]
  readonly tier?: number                // curriculum tier (1=basic, 4=advanced)
  readonly curriculum?: PackCurriculum  // educational objective for reference packs
}
