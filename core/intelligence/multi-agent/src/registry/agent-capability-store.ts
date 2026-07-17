import type { AgentDescriptor, AgentCapabilityProfile, AgentSelectionDecision } from '@rohinik-org/compiler'
import { AgentRegistry } from './agent-registry.js'

// two-stage: role filter → capability intersection → multiplicative score
// score = avg(confidence[cap]) × (1 − costWeight × normalizedCost) × (1 − latencyWeight × normalizedLatency)
// ponytail: normalizedCost/Latency are placeholders — no real provider metrics at this layer
function score(profile: AgentCapabilityProfile, required: readonly string[]): number {
  const matched = required.filter(c => profile.capabilities.includes(c))
  if (matched.length === 0) return 0
  const avgConf = matched.reduce((s, c) => s + (profile.confidence[c] ?? 0.5), 0) / matched.length
  const costFactor = 1 - profile.costWeight * 0.5
  const latFactor = 1 - profile.latencyWeight * 0.5
  return avgConf * costFactor * latFactor
}

export class AgentCapabilityStore {
  constructor(private readonly registry: AgentRegistry) {}

  matchForTask(
    requiredCapabilities: readonly string[],
    candidates: readonly AgentDescriptor[],
  ): AgentSelectionDecision {
    const scored = candidates.map(agent => {
      const profile = this.registry.getProfileForAgent(agent.agentId)
      return { agent, s: profile ? score(profile, requiredCapabilities) : 0 }
    }).sort((a, b) => b.s - a.s)

    const best = scored[0]
    const selected = best?.agent
    return {
      decisionId: crypto.randomUUID(),
      selectedAgentId: selected?.agentId ?? '',
      rejectedAgentIds: scored.slice(1).map(x => x.agent.agentId),
      reasoning: requiredCapabilities.length
        ? [`required: [${requiredCapabilities.join(', ')}]`, `selected: ${selected?.agentId ?? 'none'} (score: ${best?.s.toFixed(3) ?? '0'})`]
        : ['no required capabilities — fallback to first candidate'],
      scores: Object.fromEntries(scored.map(x => [x.agent.agentId, x.s])),
      selectedAt: new Date().toISOString(),
    }
  }
}
