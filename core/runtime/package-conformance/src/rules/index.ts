import { ConformanceRuleRegistry } from '../conformance-engine.js'
import { createManifestRule } from './manifest.js'
import { createCapabilityRule } from './capability.js'
import { createProviderRule } from './provider.js'
import { createLifecycleRule } from './lifecycle.js'
import { createDependencyRule } from './dependency.js'
import { createPermissionRule } from './permission.js'
import { createConfigurationRule } from './configuration.js'
import { createReadinessRule } from './readiness.js'
import { createShutdownRule } from './shutdown.js'
import { createFailureRule } from './failure.js'
import { createIsolationRule } from './isolation.js'
import { createDeterministicMetadataRule } from './deterministic-metadata.js'

export function createDefaultRuleSet(): ConformanceRuleRegistry {
  const registry = new ConformanceRuleRegistry()
  registry.register(createManifestRule())
  registry.register(createCapabilityRule())
  registry.register(createProviderRule())
  registry.register(createLifecycleRule())
  registry.register(createDependencyRule())
  registry.register(createPermissionRule())
  registry.register(createConfigurationRule())
  registry.register(createReadinessRule())
  registry.register(createShutdownRule())
  registry.register(createFailureRule())
  registry.register(createIsolationRule())
  registry.register(createDeterministicMetadataRule())
  return registry
}
