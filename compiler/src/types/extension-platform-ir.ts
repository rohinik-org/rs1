import type { RohiniKPackageManifest, PackageCoordinate } from './rohinik-package-manifest.js'
import type { ExtensionContribution, ExtensionState } from './console-extension-ir.js'

// TrustLevel: assigned by the registry — not self-declared by publisher.
export type TrustLevel = 'Official' | 'Verified' | 'Community' | 'Local' | 'Unsigned'

export interface CompatibilityMatrix {
  readonly runtimeRange: string
  readonly consoleRange?: string
  readonly sdkRange?: string
  readonly os?: readonly ('windows' | 'macos' | 'linux')[]
}

// PackManifest: canonical format for .rpk packages. Extends RohiniKPackageManifest v2.0.
export interface PackManifest extends RohiniKPackageManifest {
  readonly packVersion: '1.0'
  readonly contributions: readonly ExtensionContribution[]
  readonly compatibilityMatrix: CompatibilityMatrix
  readonly checksum: string
  readonly publishedAt?: string
  readonly trustLevel?: TrustLevel
}

export interface LockEntry {
  readonly packageId: string
  readonly version: string
  readonly checksum: string
  readonly repositoryId: string
  readonly dependsOn: readonly string[]
}

export interface InstallationPlan {
  readonly planId: string
  readonly packages: readonly ResolvedPack[]
  readonly totalSizeBytes: number
  readonly resolvedAt: string
}

export interface ResolvedPack {
  readonly coordinate: PackageCoordinate
  readonly action: 'install' | 'upgrade' | 'downgrade' | 'skip'
  readonly dependsOn: readonly string[]
  readonly trustLevel: TrustLevel
}

export type InstallationPhase =
  | 'Pending' | 'Downloading' | 'Verifying' | 'Extracting'
  | 'Validating' | 'Registering' | 'Activating' | 'Committed'
  | 'RollingBack' | 'RolledBack' | 'Failed'

export interface InstallationTransaction {
  readonly transactionId: string
  readonly planId: string
  readonly phase: InstallationPhase
  readonly startedAt: string
  readonly completedAt?: string
  readonly error?: string
}

export type RegistryKind =
  | 'official' | 'enterprise' | 'private' | 'git' | 'filesystem' | 'http' | 'mirror' | 'air-gapped'

export interface RegistryDescriptor {
  readonly registryId: string
  readonly kind: RegistryKind
  readonly url: string
  readonly priority: number
  readonly offline?: boolean
  readonly requireSignature?: boolean
  readonly authScheme?: 'none' | 'bearer' | 'basic' | 'ssh'
}

export interface PackageRecord {
  readonly packageId: string
  readonly version: string
  readonly installedAt: string
  readonly registryId: string
  readonly checksum: string
  readonly trustLevel: TrustLevel
  readonly state: 'Installed' | 'Disabled' | 'Quarantined'
}

export interface PublisherProfile {
  readonly publisherId: string
  readonly displayName: string
  readonly email?: string
  readonly publicKey: string
  readonly trustLevel: TrustLevel
  readonly registeredAt: string
}

export interface MarketplaceSearchResult {
  readonly packageId: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly type: string
  readonly publisher: string
  readonly trustLevel: TrustLevel
  readonly score: number
  readonly downloads?: number
  readonly rating?: number
  readonly registryId: string
}

export interface ExtensionActivationRecord {
  readonly extensionId: string
  readonly packageId: string
  readonly activatedAt: string
  readonly order: number
  readonly state: ExtensionState
}
