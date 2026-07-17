import type { NodeDescriptor } from '@rohinik-org/compiler'
import { NodeRegistry } from '../registry/node-registry.js'

export class NodeDiscovery {
  constructor(private readonly registry: NodeRegistry) {}

  join(descriptor: NodeDescriptor, profile: import('@rohinik-org/compiler').NodeCapabilityProfile): void {
    this.registry.register(descriptor, profile)
  }

  joinMany(entries: Array<{ descriptor: NodeDescriptor; profile: import('@rohinik-org/compiler').NodeCapabilityProfile }>): void {
    for (const { descriptor, profile } of entries) {
      this.registry.register(descriptor, profile)
    }
  }

  discover(): readonly NodeDescriptor[] {
    return this.registry.byStatus('ONLINE')
  }

  all(): readonly NodeDescriptor[] {
    return this.registry.list()
  }
}
