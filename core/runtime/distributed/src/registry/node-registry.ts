import type { NodeDescriptor, NodeCapabilityProfile, NodeStatus } from '@rohinik-org/compiler'

export class NodeRegistry {
  private readonly nodes = new Map<string, NodeDescriptor>()
  private readonly profiles = new Map<string, NodeCapabilityProfile>()

  register(descriptor: NodeDescriptor, profile: NodeCapabilityProfile): void {
    this.nodes.set(descriptor.nodeId, descriptor)
    this.profiles.set(descriptor.nodeId, profile)
  }

  get(nodeId: string): NodeDescriptor | undefined {
    return this.nodes.get(nodeId)
  }

  getProfile(nodeId: string): NodeCapabilityProfile | undefined {
    return this.profiles.get(nodeId)
  }

  list(): readonly NodeDescriptor[] {
    return Array.from(this.nodes.values())
  }

  byRegion(region: string): readonly NodeDescriptor[] {
    return this.list().filter(n => n.region === region)
  }

  byStatus(status: NodeStatus): readonly NodeDescriptor[] {
    return this.list().filter(n => n.status === status)
  }

  updateStatus(nodeId: string, status: NodeStatus): boolean {
    const node = this.nodes.get(nodeId)
    if (!node) return false
    this.nodes.set(nodeId, { ...node, status })
    return true
  }

  removeById(nodeId: string): boolean {
    const existed = this.nodes.has(nodeId)
    this.nodes.delete(nodeId)
    this.profiles.delete(nodeId)
    return existed
  }
}
