import type { Goal, AutonomyPolicy } from '@rohinik-org/compiler'

export class AutonomyPolicyEngine {
  evaluate(goal: Goal, policy: AutonomyPolicy): { allowed: boolean; reason?: string } {
    if (!policy.allowSelfPlanning) {
      return { allowed: false, reason: 'allowSelfPlanning is false' }
    }
    if (!policy.allowSelfExecution) {
      return { allowed: false, reason: 'allowSelfExecution is false' }
    }
    if (policy.requireApprovalFor.includes(goal.origin)) {
      return { allowed: false, reason: `origin ${goal.origin} requires human approval` }
    }
    return { allowed: true }
  }
}
