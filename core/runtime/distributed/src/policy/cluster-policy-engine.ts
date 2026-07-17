import type { ClusterPolicy } from '@rohinik-org/compiler'

export type PolicyDecision = 'ALLOWED' | 'REJECTED'

export type ClusterOperation =
  | 'REMOTE_EXECUTE'
  | 'REPLICATE'
  | 'MEMORY_ACCESS'

export class ClusterPolicyEngine {
  evaluate(operation: ClusterOperation, policy: ClusterPolicy): PolicyDecision {
    if (operation === 'REMOTE_EXECUTE' && !policy.allowRemoteExecution) return 'REJECTED'
    if (operation === 'REPLICATE' && !policy.allowReplication) return 'REJECTED'
    if (operation === 'MEMORY_ACCESS' && !policy.allowReplication) return 'REJECTED'
    return 'ALLOWED'
  }
}
