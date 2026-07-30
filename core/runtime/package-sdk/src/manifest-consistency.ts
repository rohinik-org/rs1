import type { RohinikPackageManifestV1, NpmDependencyDeclaration } from '@rohinik-org/package-manifest-ir'
import type { PackageDefinition } from './define-package.js'
import type { DependencyDefinition } from './declare-dependencies.js'
import type { ConfigurationDefinition } from './declare-configuration.js'
import type { PermissionDefinition } from './declare-permissions.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConsistencyMismatchCode =
  | 'capability-undeclared-in-manifest'
  | 'capability-undeclared-in-sdk'
  | 'npm-version-mismatch'
  | 'npm-undeclared-in-manifest'
  | 'npm-undeclared-in-sdk'
  | 'secret-mismatch'
  | 'permission-scope-expanded'

export interface ConsistencyMismatch {
  readonly code: ConsistencyMismatchCode
  readonly message: string
  readonly subject?: string
}

export interface ConsistencyReport {
  readonly consistent: boolean
  readonly mismatches: readonly ConsistencyMismatch[]
}

export interface ConsistencyInput {
  readonly packageDefinition: PackageDefinition
  readonly manifest: RohinikPackageManifestV1
  readonly dependencies?: DependencyDefinition
  readonly configuration?: ConfigurationDefinition
  readonly permissions?: PermissionDefinition
}

// ─── compareManifestConsistency ───────────────────────────────────────────────

export function compareManifestConsistency(input: ConsistencyInput): ConsistencyReport {
  const mismatches: ConsistencyMismatch[] = []
  const { packageDefinition, manifest } = input

  // Capability consistency
  const sdkProvides = new Set(packageDefinition.provides.map((p) => p.capability))
  const manifestProvides = new Set((manifest.provides ?? []).map((p) => p.capability))

  for (const id of sdkProvides) {
    if (!manifestProvides.has(id)) {
      mismatches.push({
        code: 'capability-undeclared-in-manifest',
        message: `capability "${id}" declared in SDK but not in manifest`,
        subject: id,
      })
    }
  }
  for (const id of manifestProvides) {
    if (!sdkProvides.has(id)) {
      mismatches.push({
        code: 'capability-undeclared-in-sdk',
        message: `capability "${id}" declared in manifest but not in SDK`,
        subject: id,
      })
    }
  }

  // npm dependency consistency
  if (input.dependencies) {
    const sdkNpm = new Map(input.dependencies.npm.map((d) => [d.name, d.version]))
    const manifestNpm = new Map<string, string>(
      ((manifest.dependencies?.npm ?? []) as readonly NpmDependencyDeclaration[]).map((d) => [d.name, d.version]),
    )

    for (const [name, version] of sdkNpm) {
      if (!manifestNpm.has(name)) {
        mismatches.push({
          code: 'npm-undeclared-in-manifest',
          message: `npm dependency "${name}" declared in SDK but not in manifest`,
          subject: name,
        })
      } else if (manifestNpm.get(name) !== version) {
        mismatches.push({
          code: 'npm-version-mismatch',
          message: `npm dependency "${name}" version mismatch: SDK="${version}" manifest="${manifestNpm.get(name)}"`,
          subject: name,
        })
      }
    }
    for (const [name] of manifestNpm) {
      if (!sdkNpm.has(name)) {
        mismatches.push({
          code: 'npm-undeclared-in-sdk',
          message: `npm dependency "${name}" declared in manifest but not in SDK`,
          subject: name,
        })
      }
    }
  }

  return Object.freeze({
    consistent: mismatches.length === 0,
    mismatches: Object.freeze(mismatches.map((m) => Object.freeze(m))),
  })
}
