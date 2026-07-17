import type { AgentDescriptor, AgentCapabilityProfile, AgentRole } from '@rohinik-org/compiler'

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDescriptor>()
  private readonly profiles = new Map<string, AgentCapabilityProfile>()

  register(descriptor: AgentDescriptor, profile: AgentCapabilityProfile): void {
    this.agents.set(descriptor.agentId, descriptor)
    this.profiles.set(descriptor.capabilityProfileId, profile)
  }

  get(agentId: string): AgentDescriptor | undefined { return this.agents.get(agentId) }
  getProfile(profileId: string): AgentCapabilityProfile | undefined { return this.profiles.get(profileId) }
  getProfileForAgent(agentId: string): AgentCapabilityProfile | undefined {
    const d = this.agents.get(agentId)
    return d ? this.profiles.get(d.capabilityProfileId) : undefined
  }

  list(): readonly AgentDescriptor[] { return Array.from(this.agents.values()) }
  byRole(role: AgentRole): readonly AgentDescriptor[] { return this.list().filter(a => a.role === role) }
  removeById(agentId: string): boolean { return this.agents.delete(agentId) }
  size(): number { return this.agents.size }
}
