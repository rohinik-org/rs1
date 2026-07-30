export { definePackage } from './define-package.js'
export type { PackageDefinition, DefinePackageInput } from './define-package.js'

export { defineProvider } from './define-provider.js'
export type { ProviderDefinition, DefineProviderInput, CapabilityBinding } from './define-provider.js'

export { provideCapability } from './provide-capability.js'

export { consumeCapability } from './consume-capability.js'
export type { ConsumptionDescriptor } from './consume-capability.js'

export { declareConfiguration } from './declare-configuration.js'
export type { ConfigurationDefinition } from './declare-configuration.js'

export { declarePermissions } from './declare-permissions.js'
export type { PermissionDefinition } from './declare-permissions.js'

export { declareDependencies } from './declare-dependencies.js'
export type {
  DependencyDefinition,
  DeclareDependenciesInput,
  LanguageDependencyDeclaration,
  ModelDependencyDeclaration,
  InfrastructureDependencyDeclaration,
} from './declare-dependencies.js'

export { compareManifestConsistency } from './manifest-consistency.js'
export type {
  ConsistencyReport,
  ConsistencyMismatch,
  ConsistencyMismatchCode,
  ConsistencyInput,
} from './manifest-consistency.js'
