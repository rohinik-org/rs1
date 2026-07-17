import type { IntentTranslationRequest, IntentTranslationResult } from './intent-translation.js'
import type { WorkflowMatchEvidence } from './workflow-match-evidence.js'
import type { CapabilityPlanEvidence } from './capability-plan-evidence.js'
import type { WorkflowPlanCandidate } from './workflow-plan-candidate.js'
import type { SimulationResult } from './simulation-result.js'
import type { PlanningDecision } from './planning-decision.js'

export interface PlanningPolicySnapshot {
  readonly policyId: string
  readonly planningWeight: number
  readonly evidenceWeight: number
  readonly provenanceWeight: number
  readonly tieBreakRule: string
  readonly optimizationGoal: string
}

export interface PlanningTrace {
  readonly kind: 'PlanningTrace'
  readonly schemaVersion: '1.0'
  readonly traceId: string
  readonly producedAt: string // ISO-8601
  readonly plannerVersion: string
  readonly translation: {
    readonly request: IntentTranslationRequest
    readonly result: IntentTranslationResult
    readonly translatorChain: readonly string[]
  }
  readonly matching: {
    readonly workflowsExamined: number
    readonly matches: readonly WorkflowMatchEvidence[]
  }
  readonly synthesis: {
    readonly graphPathsExplored: number
    readonly evidence: readonly CapabilityPlanEvidence[]
  }
  readonly ranking: {
    readonly allCandidates: readonly WorkflowPlanCandidate[]
    readonly policyApplied: PlanningPolicySnapshot
    readonly tieBreaksApplied: number
  }
  readonly simulation: SimulationResult
  readonly decision: PlanningDecision
}
