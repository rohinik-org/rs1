import type { Capability } from '../interfaces/capability.js'

export class StaticCapabilityDiscovery {
  constructor(private readonly capabilities: Capability[]) {}

  async discover(): Promise<Capability[]> {
    return [...this.capabilities]
  }
}
