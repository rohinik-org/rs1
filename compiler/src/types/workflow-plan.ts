import type { StructuredIntent } from './structured-intent.js'
import type { IntentTranslationResult } from './intent-translation.js'
import type { WorkflowPlanCandidate } from './workflow-plan-candidate.js'
import type { WorkflowPlanStep } from './workflow-plan-step.js'
import type { PlanningDecision } from './planning-decision.js'
import type { SimulationResult } from './simulation-result.js'

export type WorkflowPlanStatus = 'DRAFT' | 'EXECUTABLE' | 'APPROVED' | 'REJECTED'

export interface WorkflowPlan {
  readonly kind: 'WorkflowPlan'
  readonly schemaVersion: '1.0'
  readonly planId: string
  readonly planRevision: number
  readonly status: WorkflowPlanStatus
  readonly producedAt: string // ISO-8601
  readonly graphRevision: number
  readonly workflowRevision: number
  readonly plannerVersion: string
  readonly intent: StructuredIntent
  readonly translationResult: IntentTranslationResult
  readonly selectedCandidate: WorkflowPlanCandidate
  readonly alternatives: readonly WorkflowPlanCandidate[]
  readonly steps: readonly WorkflowPlanStep[]
  readonly planningDecision: PlanningDecision
  readonly simulation: SimulationResult
}
