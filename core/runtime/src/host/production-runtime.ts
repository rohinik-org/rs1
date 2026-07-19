import { activate as activateCapabilityCore } from '@rohinik-org/capability-core'
import { BuiltinRegistry } from './builtin-registry.js'
import { defaultBootstrapPlan } from './bootstrap-plan.js'
import { RuntimeHost } from './runtime-host.js'
import type { ResolvedConfig } from '../types.js'
import type { KernelRuntime } from '@rohinik-org/kernel'
import type { BuiltinDescriptor } from './builtin-registry.js'

const DEFAULT_CAPABILITY_CORE_DESCRIPTOR: BuiltinDescriptor = {
  id: 'capability-core',
  version: '0.1.0',
  // ponytail: KernelRuntime satisfies foundation's Runtime interface structurally
  activate: (runtime: KernelRuntime) => activateCapabilityCore(runtime as Parameters<typeof activateCapabilityCore>[0]),
}

export function createProductionHost(config: ResolvedConfig): RuntimeHost {
  const registry = new BuiltinRegistry()
  registry.register(DEFAULT_CAPABILITY_CORE_DESCRIPTOR)
  const plan = defaultBootstrapPlan(config, registry)
  return new RuntimeHost(plan)
}
