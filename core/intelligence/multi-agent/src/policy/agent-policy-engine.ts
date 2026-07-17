import type { AgentSession, AgentPolicy } from '@rohinik-org/compiler'

export class AgentPolicyEngine {
  evaluate(session: AgentSession, policy: AgentPolicy): 'APPROVED' | 'DEFERRED' | 'REJECTED' {
    if (session.status === 'FAILED') return 'REJECTED'

    // delegation depth check: tasks assigned + any nested (approximated by task count vs max parallel)
    if (session.tasks.length > policy.maxParallelAgents * policy.maxDelegationDepth) return 'REJECTED'

    // UNANIMOUS consensus with no selected result → DEFERRED
    if (policy.consensusStrategy === 'UNANIMOUS' && !session.consensusDecision.selectedResultId) return 'DEFERRED'

    if (session.status === 'PARTIAL') return 'DEFERRED'
    return 'APPROVED'
  }
}
