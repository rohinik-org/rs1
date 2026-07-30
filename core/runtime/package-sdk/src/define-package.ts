import type {
  PackageDeclaration,
  PublisherDeclaration,
  RuntimeDeclaration,
  ProvidedCapabilityDeclaration,
  ConsumedCapabilityDeclaration,
  DependencyDeclarations,
  ConfigurationDeclarations,
  PermissionDeclarations,
  HealthDeclaration,
  LifecycleDeclaration,
} from '@rohinik-org/package-manifest-ir'
import { PACKAGE_ID_PATTERN } from '@rohinik-org/package-manifest-ir'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageDefinition {
  readonly package: PackageDeclaration
  readonly publisher?: PublisherDeclaration
  readonly runtime?: RuntimeDeclaration
  readonly provides: readonly ProvidedCapabilityDeclaration[]
  readonly consumes: readonly ConsumedCapabilityDeclaration[]
  readonly dependencies?: DependencyDeclarations
  readonly configuration?: ConfigurationDeclarations
  readonly permissions?: PermissionDeclarations
  readonly health?: HealthDeclaration
  readonly lifecycle?: LifecycleDeclaration
  readonly metadata?: Readonly<Record<string, string>>
}

export interface DefinePackageInput {
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
  readonly metadata?: Readonly<Record<string, string>>
}

// ─── definePackage ────────────────────────────────────────────────────────────

export function definePackage(input: DefinePackageInput): PackageDefinition {
  if (!input.package.id || !PACKAGE_ID_PATTERN.test(input.package.id)) {
    throw Object.assign(new Error(`invalid-input: package id "${input.package.id}" does not match required pattern`), {
      code: 'invalid-input' as const,
    })
  }
  // ponytail: semver prefix check (^\d+\.\d+\.\d+), full parse not needed for static declaration
  if (!input.package.version || !/^\d+\.\d+\.\d+/.test(input.package.version)) {
    throw Object.assign(new Error(`invalid-input: package version "${input.package.version}" must be semver (e.g. 1.0.0)`), { code: 'invalid-input' as const })
  }

  const provides = Object.freeze([...(input.provides ?? [])])
  const consumes = Object.freeze([...(input.consumes ?? [])])

  return Object.freeze({
    package: Object.freeze({ ...input.package }),
    ...(input.publisher !== undefined ? { publisher: Object.freeze({ ...input.publisher }) } : {}),
    ...(input.runtime !== undefined ? { runtime: Object.freeze({ ...input.runtime }) } : {}),
    provides,
    consumes,
    ...(input.dependencies !== undefined ? { dependencies: Object.freeze({ ...input.dependencies }) } : {}),
    ...(input.configuration !== undefined ? { configuration: Object.freeze({ ...input.configuration }) } : {}),
    ...(input.permissions !== undefined ? { permissions: Object.freeze({ ...input.permissions }) } : {}),
    ...(input.health !== undefined ? { health: Object.freeze({ ...input.health }) } : {}),
    ...(input.lifecycle !== undefined ? { lifecycle: Object.freeze({ ...input.lifecycle }) } : {}),
    ...(input.metadata !== undefined ? { metadata: Object.freeze({ ...input.metadata }) } : {}),
  })
}
