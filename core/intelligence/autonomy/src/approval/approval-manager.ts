import type { Goal, AutonomyPolicy, GoalStatus } from '@rohinik-org/compiler'
import { AutonomyPolicyEngine } from '../policy/autonomy-policy-engine.js'

export class ApprovalManager {
  private readonly engine = new AutonomyPolicyEngine()

  evaluate(goal: Goal, policy: AutonomyPolicy): GoalStatus {
    const { allowed, reason } = this.engine.evaluate(goal, policy)
    if (!allowed) {
      // Human approval required → DEFERRED; hard policy block → REJECTED
      return reason?.includes('requires human approval') ? 'DEFERRED' : 'REJECTED'
    }
    return 'APPROVED'
  }
}
