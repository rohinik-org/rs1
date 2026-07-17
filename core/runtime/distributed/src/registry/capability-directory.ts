import type { NodeDescriptor } from '@rohinik-org/compiler'
import { NodeRegistry } from './node-registry.js'

export interface NodeSelectionDecision {
  readonly selectedNodeId: string
  readonly rejectedNodeIds: readonly string[]
  readonly scores: Readonly<Record<string, number>>
  readonly selectedAt: string
}

export class CapabilityDirectory {
  constructor(private readonly registry: NodeRegistry) {}

  score(nodeId: string, requiredCapabilities: string[]): number {
    const profile = this.registry.getProfile(nodeId)
    if (!profile) return 0
    if (requiredCapabilities.length === 0) return 1 - profile.costWeight
    const matched = requiredCapabilities.filter(c => profile.installedCapabilities.includes(c)).length
    const matchRatio = matched / requiredCapabilities.length
    const latencyFactor = 1 - Math.min(profile.latencyProfileMs / 1_000, 1) * 0.3
    return matchRatio * latencyFactor * (1 - profile.costWeight)
  }

  matchForTask(requiredCapabilities: string[], candidates: readonly NodeDescriptor[]): NodeSelectionDecision {
    const scores: Record<string, number> = {}
    for (const node of candidates) {
      scores[node.nodeId] = this.score(node.nodeId, requiredCapabilities)
    }
    const sorted = [...candidates].sort((a, b) => (scores[b.nodeId] ?? 0) - (scores[a.nodeId] ?? 0))
    const selected = sorted[0]
    if (!selected) throw new Error('matchForTask called with empty candidates')
    return {
      selectedNodeId: selected.nodeId,
      rejectedNodeIds: sorted.slice(1).map(n => n.nodeId),
      scores,
      selectedAt: new Date().toISOString(),
    }
  }
}
