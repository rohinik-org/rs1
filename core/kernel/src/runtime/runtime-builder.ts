import { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import { DefaultExecutionResolver } from '../resolver.js'
import type { RuntimeServices } from '../domain/context.js'
import { RuntimeRegistry } from './runtime-registry.js'
import { KernelRuntime } from './kernel-runtime.js'

export class RuntimeBuilder {
  constructor(
    private readonly catalog: InMemoryCapabilityCatalog,
    private readonly resolver: DefaultExecutionResolver,
    private readonly services: RuntimeServices,
  ) {}

  build(): KernelRuntime {
    const registry = new RuntimeRegistry(this.catalog, this.resolver)
    return new KernelRuntime(registry, this.services)
  }
}
